# api/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from .models import AnalyzeRequest, AnalysisResponse
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry
from .services.normalizer import normalize_llm_output
from .services.chunking import chunk_passage
from .services.merge import merge_chunk_results
from .services.scripture_lookup import (
    ScriptureLookupError,
    get_passage_asv,
    get_passage_metadata,
    validate_asv_corpus,
)
import json
import os
import time
import uuid
import asyncio
import logging
import httpx
from typing import Any, Dict, List

app = FastAPI(title="Remez API", version="0.2.1")
logger = logging.getLogger("remez")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
if cors_origins.strip() == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def validate_asv_on_startup() -> None:
    errors = validate_asv_corpus()
    if errors:
        logger.error("asv_corpus_validation_failed", extra={"count": len(errors), "errors": errors[:25]})
    else:
        logger.info("asv_corpus_validation_ok")

MAX_WALL_TIME_SEC = float(os.getenv("MAX_WALL_TIME_SEC", "240"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "12000"))
MAX_ANALYZE_INPUT_CHARS = int(os.getenv("MAX_ANALYZE_INPUT_CHARS", str(MAX_INPUT_CHARS)))
RAW_LOG_CHARS = int(os.getenv("RAW_LOG_CHARS", "3000"))
MAX_ANALYZE_CHARS_PER_CHUNK = int(os.getenv("MAX_ANALYZE_CHARS_PER_CHUNK", "2500"))
ANALYZE_CHUNK_OVERLAP_CHARS = int(os.getenv("ANALYZE_CHUNK_OVERLAP_CHARS", "250"))
MAX_CHUNK_FAILURE_RATIO = float(os.getenv("MAX_CHUNK_FAILURE_RATIO", "0.5"))


@app.middleware("http")
async def add_request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.exception("request_failed", extra={"request_id": request_id, "path": request.url.path, "ms": duration_ms})
        raise
    duration_ms = int((time.perf_counter() - start) * 1000)
    response.headers["X-Request-Id"] = request_id
    logger.info("request_complete", extra={"request_id": request_id, "path": request.url.path, "status": response.status_code, "ms": duration_ms})
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


def _too_empty(p: dict) -> bool:
    structure = p.get("structure") or {}
    if not isinstance(structure, dict):
        return True

    lines = structure.get("lines")
    if not isinstance(lines, list):
        lines = []
    detected = structure.get("detected", "none")
    parallels = structure.get("parallels")
    if not isinstance(parallels, list):
        parallels = []

    # Enforce Option A: parallelism MUST include at least 2 parallel groups
    missing_parallels = (detected == "parallelism" and len(parallels) < 2)

    def _safe_list_len(value: Any) -> int:
        return len(value) if isinstance(value, list) else 0

    return (
        len(lines) < 2
        or missing_parallels
        or _safe_list_len(p.get("cultural_worldview_notes")) < 2
        or _safe_list_len(p.get("motifs_and_patterns")) < 2
        or _safe_list_len(p.get("second_temple_bridge")) < 1
        or _safe_list_len(p.get("nt_parallels")) < 1
    )


def _stage_log(stage: str, status: str, **kwargs: Any) -> None:
    payload = {"stage": stage, "status": status, **kwargs}
    logger.info("analyze_stage", extra=payload)


def _error_json(status_code: int, error: str, stage: str, details: Any | None = None) -> JSONResponse:
    payload: Dict[str, Any] = {"error": error, "stage": stage}
    if details is not None:
        payload["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


def _truncate_for_log(value: str, limit: int = RAW_LOG_CHARS) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "...[truncated]"


def _extract_upstream_error(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    if "error" not in payload:
        return None
    err = payload.get("error")
    if isinstance(err, dict):
        message = str(err.get("message", "")).strip()
        code = str(err.get("code", "")).strip()
        detail = message or json.dumps(err, ensure_ascii=False)[:500]
        if code:
            return f"{code}: {detail}"
        return detail
    return str(err)


def _field_shape_issues(payload: Dict[str, Any]) -> list[str]:
    issues: list[str] = []
    expected = [
        "overview_summary",
        "keywords",
        "literary_notes",
        "second_temple_bridge",
        "nt_parallels",
        "structure",
    ]
    for key in expected:
        if key not in payload:
            issues.append(f"missing:{key}")

    if "structure" in payload and not isinstance(payload.get("structure"), dict):
        issues.append("malformed:structure:not_object")
    if "keywords" in payload and not isinstance(payload.get("keywords"), list):
        issues.append("malformed:keywords:not_array")
    if "literary_notes" in payload and not isinstance(payload.get("literary_notes"), list):
        issues.append("malformed:literary_notes:not_array")
    if "second_temple_bridge" in payload and not isinstance(payload.get("second_temple_bridge"), list):
        issues.append("malformed:second_temple_bridge:not_array")
    if "nt_parallels" in payload and not isinstance(payload.get("nt_parallels"), list):
        issues.append("malformed:nt_parallels:not_array")
    if "overview_summary" in payload and not isinstance(payload.get("overview_summary"), str):
        issues.append("malformed:overview_summary:not_string")
    return issues


def _parse_and_normalize(raw_response: str, attempt: str) -> tuple[AnalysisResponse | None, Dict[str, Any] | None, JSONResponse | None]:
    _stage_log("raw_model_response_received", "ok", attempt=attempt, chars=len(raw_response))

    # Detect upstream-style error payloads before treating content as normal analysis JSON.
    try:
        maybe_payload = json.loads(raw_response)
    except json.JSONDecodeError:
        maybe_payload = None
    upstream_error = _extract_upstream_error(maybe_payload)
    if upstream_error:
        logger.error(
            "model_call_upstream_error_payload",
            extra={"attempt": attempt, "details": upstream_error},
        )
        return None, None, _error_json(
            status_code=502,
            error="Upstream model call failed",
            stage="model_call",
            details=upstream_error,
        )

    _stage_log("parse_json", "start", attempt=attempt)
    try:
        parsed_json = json.loads(raw_response)
    except Exception as exc:
        logger.error(
            "parse_json_failed",
            extra={
                "attempt": attempt,
                "exception_type": type(exc).__name__,
                "raw_response_snippet": _truncate_for_log(raw_response),
            },
        )
        return None, None, _error_json(
            status_code=502,
            error="Model returned invalid JSON content",
            stage="parse_json",
        )
    _stage_log("parse_json", "end", attempt=attempt)

    _stage_log("normalize_response", "start", attempt=attempt)
    try:
        normalized = normalize_llm_output(parsed_json)
        validated = AnalysisResponse(**normalized)
    except ValidationError as exc:
        logger.error(
            "normalize_response_validation_failed",
            extra={
                "attempt": attempt,
                "issues": _field_shape_issues(parsed_json)[:25],
                "validation_errors": exc.errors(),
            },
        )
        return None, None, _error_json(
            status_code=500,
            error="Structured response normalization failed",
            stage="normalize_response",
        )
    except Exception as exc:
        logger.exception(
            "normalize_response_failed",
            extra={
                "attempt": attempt,
                "exception_type": type(exc).__name__,
                "issues": _field_shape_issues(parsed_json)[:25],
            },
        )
        return None, None, _error_json(
            status_code=500,
            error="Structured response normalization failed",
            stage="normalize_response",
        )
    _stage_log("normalize_response", "end", attempt=attempt)
    return validated, normalized, None


async def _run_single_analysis(text: str, unit: str) -> tuple[AnalysisResponse | None, Dict[str, Any] | None, JSONResponse | None, int]:
    unit_start = time.perf_counter()
    _stage_log("prompt_build", "start", unit=unit)
    prompt = build_prompt(text)
    _stage_log("prompt_build", "end", unit=unit, chars=len(prompt))

    start_total = time.perf_counter()
    llm_ms = 0
    parse_norm_ms = 0

    async def call_with_budget(prompt_text: str) -> Dict[str, Any]:
        remaining = max(1.0, MAX_WALL_TIME_SEC - (time.perf_counter() - start_total))
        return await asyncio.wait_for(call_azure_foundry(prompt_text), timeout=remaining)

    _stage_log("model_request", "start", unit=unit, attempt="initial")
    llm_start = time.perf_counter()
    try:
        model_result = await call_with_budget(prompt)
    except asyncio.TimeoutError:
        logger.error("model_request_timeout", extra={"unit": unit, "attempt": "initial"})
        return None, None, _error_json(
            status_code=504,
            error="Upstream model call failed",
            stage="model_call",
            details="Analysis exceeded time limit.",
        ), int((time.perf_counter() - unit_start) * 1000)
    except httpx.HTTPStatusError as exc:
        detail = _truncate_for_log(exc.response.text if exc.response is not None else str(exc))
        logger.error(
            "model_request_http_status_error",
            extra={"unit": unit, "attempt": "initial", "status_code": exc.response.status_code if exc.response else None, "details": detail},
        )
        return None, None, _error_json(
            status_code=502,
            error="Upstream model call failed",
            stage="model_call",
            details=detail,
        ), int((time.perf_counter() - unit_start) * 1000)
    except Exception as exc:
        logger.exception("model_request_failed", extra={"unit": unit, "attempt": "initial", "exception_type": type(exc).__name__})
        return None, None, _error_json(
            status_code=502,
            error="Upstream model call failed",
            stage="model_call",
            details=str(exc),
        ), int((time.perf_counter() - unit_start) * 1000)

    if not model_result.get("ok"):
        stage = str(model_result.get("stage", "model_call"))
        details = model_result.get("details", "")
        content_type = str(model_result.get("content_type", "unknown"))
        logger.error(
            "model_request_result_error",
            extra={"unit": unit, "attempt": "initial", "stage": stage, "content_type": content_type, "details": details},
        )
        return None, None, _error_json(
            status_code=502,
            error=str(model_result.get("error", "Upstream model call failed")),
            stage=stage,
            details=details or None,
        ), int((time.perf_counter() - unit_start) * 1000)

    raw_response = str(model_result.get("text", ""))
    llm_ms += int((time.perf_counter() - llm_start) * 1000)
    _stage_log("model_request", "end", unit=unit, attempt="initial", ms=llm_ms)

    parse_norm_start = time.perf_counter()
    validated, parsed, error_response = _parse_and_normalize(raw_response, "initial")
    parse_norm_ms += int((time.perf_counter() - parse_norm_start) * 1000)
    if error_response is not None:
        return None, None, error_response, int((time.perf_counter() - unit_start) * 1000)

    # Retry once if schema-minimums are violated
    if parsed is not None and _too_empty(parsed):
        logger.warning("analyze_retry_schema_minimums")
        prompt2 = prompt + (
            "\n\nYour output was missing required structure elements.\n"
            "- structure.lines must be populated with ids L1..Ln.\n"
            "- If structure.detected == 'parallelism', structure.parallels must contain at least 2 groups.\n"
            "- If structure.detected != 'chiasm', structure.best_chiasm must be null.\n"
            "Return JSON only and comply with the schema exactly."
        )

        _stage_log("model_request", "start", unit=unit, attempt="retry_1")
        llm_start = time.perf_counter()
        try:
            model_result = await call_with_budget(prompt2)
        except asyncio.TimeoutError:
            logger.error("model_request_timeout", extra={"unit": unit, "attempt": "retry_1"})
            return None, None, _error_json(
                status_code=504,
                error="Upstream model call failed",
                stage="model_call",
                details="Analysis exceeded time limit on retry.",
            ), int((time.perf_counter() - unit_start) * 1000)
        except httpx.HTTPStatusError as exc:
            detail = _truncate_for_log(exc.response.text if exc.response is not None else str(exc))
            logger.error(
                "model_request_http_status_error",
                extra={"unit": unit, "attempt": "retry_1", "status_code": exc.response.status_code if exc.response else None, "details": detail},
            )
            return None, None, _error_json(
                status_code=502,
                error="Upstream model call failed",
                stage="model_call",
                details=detail,
            ), int((time.perf_counter() - unit_start) * 1000)
        except Exception as exc:
            logger.exception("model_request_failed", extra={"unit": unit, "attempt": "retry_1", "exception_type": type(exc).__name__})
            return None, None, _error_json(
                status_code=502,
                error="Upstream model call failed",
                stage="model_call",
                details=str(exc),
            ), int((time.perf_counter() - unit_start) * 1000)

        if not model_result.get("ok"):
            stage = str(model_result.get("stage", "model_call"))
            details = model_result.get("details", "")
            content_type = str(model_result.get("content_type", "unknown"))
            logger.error(
                "model_request_result_error",
                extra={"unit": unit, "attempt": "retry_1", "stage": stage, "content_type": content_type, "details": details},
            )
            return None, None, _error_json(
                status_code=502,
                error=str(model_result.get("error", "Upstream model call failed")),
                stage=stage,
                details=details or None,
            ), int((time.perf_counter() - unit_start) * 1000)

        raw_response = str(model_result.get("text", ""))
        llm_retry_ms = int((time.perf_counter() - llm_start) * 1000)
        llm_ms += llm_retry_ms
        _stage_log("model_request", "end", unit=unit, attempt="retry_1", ms=llm_retry_ms)

        parse_norm_start = time.perf_counter()
        validated, parsed, error_response = _parse_and_normalize(raw_response, "retry_1")
        parse_norm_ms += int((time.perf_counter() - parse_norm_start) * 1000)
        if error_response is not None:
            return None, None, error_response, int((time.perf_counter() - unit_start) * 1000)

    total_ms = int((time.perf_counter() - start_total) * 1000)
    logger.info(
        "analyze_timing",
        extra={
            "unit": unit,
            "llm_ms": llm_ms,
            "parse_norm_ms": parse_norm_ms,
            "total_ms": total_ms,
        },
    )
    duration_ms = int((time.perf_counter() - unit_start) * 1000)
    return validated, parsed, None, duration_ms


async def _analyze_impl(req: AnalyzeRequest) -> AnalysisResponse | JSONResponse:
    request_start = time.perf_counter()
    source_mode = req.source_mode
    if not source_mode:
        if req.text and req.text.strip() and not (req.reference and req.reference.strip()):
            source_mode = "custom_text"
        else:
            source_mode = "reference"

    response_meta: Dict[str, Any] = {"source_mode": source_mode}
    resolved_text = ""

    if source_mode == "custom_text":
        if not req.text or not req.text.strip():
            return _error_json(
                status_code=400,
                error="Passage text is required.",
                stage="validation",
                details="Provide custom passage text or switch to reference mode.",
            )
        resolved_text = req.text.strip()
    else:
        if not req.reference or not req.reference.strip():
            return _error_json(
                status_code=400,
                error="Reference is required.",
                stage="validation",
                details="Enter a reference like Genesis 1 or Philippians 2:6-11.",
            )
        try:
            passage = get_passage_asv(req.reference.strip())
            metadata = get_passage_metadata(req.reference.strip())
        except ScriptureLookupError as exc:
            return _error_json(
                status_code=exc.status_code,
                error=exc.error,
                stage="scripture_lookup",
                details=exc.details,
            )
        resolved_text = str(passage.get("text") or "").strip()
        response_meta.update(
            {
                "reference": str(passage.get("reference") or metadata.get("reference") or req.reference.strip()),
                "source_translation": str(passage.get("source_translation") or "ASV"),
                "source_mode": "reference",
            }
        )
        logger.info(
            "asv_reference_metadata",
            extra={
                "reference_normalized": metadata.get("reference"),
                "book_name": metadata.get("book_name"),
                "verse_count": metadata.get("verse_count"),
                "chapter_count": metadata.get("chapter_count"),
            },
        )

    if len(resolved_text) > MAX_ANALYZE_INPUT_CHARS:
        return _error_json(
            status_code=413,
            error="Passage too long for analysis in the current mode. Try a smaller section.",
            stage="validation",
            details=f"Please shorten the text (max {MAX_ANALYZE_INPUT_CHARS} characters).",
        )

    input_len = len(resolved_text)
    _stage_log("analyze_request", "start", input_chars=input_len, source_mode=source_mode)

    if input_len <= MAX_ANALYZE_CHARS_PER_CHUNK:
        validated, _parsed, error_response, _duration_ms = await _run_single_analysis(resolved_text, "single")
        if error_response is not None:
            return error_response
        if validated is None:
            return _error_json(
                status_code=500,
                error="Structured response normalization failed",
                stage="normalize_response",
                details="Single-pass analysis produced no validated response.",
            )
        _stage_log("final_response_return", "start", chunked=False)
        _stage_log(
            "final_response_return",
            "end",
            chunked=False,
            total_ms=int((time.perf_counter() - request_start) * 1000),
        )
        return validated.model_copy(update=response_meta)

    chunks = chunk_passage(resolved_text, MAX_ANALYZE_CHARS_PER_CHUNK, ANALYZE_CHUNK_OVERLAP_CHARS)
    _stage_log("chunking", "end", input_chars=input_len, chunk_count=len(chunks))
    logger.info(
        "chunking_summary",
        extra={
            "input_chars": input_len,
            "max_chunk_chars": MAX_ANALYZE_CHARS_PER_CHUNK,
            "overlap_chars": ANALYZE_CHUNK_OVERLAP_CHARS,
            "chunk_count": len(chunks),
        },
    )

    results: List[Dict[str, Any]] = []
    chunk_summaries: List[Dict[str, Any]] = []
    warnings: List[str] = []
    failed_chunks = 0
    chunk_total_start = time.perf_counter()

    for i, chunk in enumerate(chunks, start=1):
        _stage_log(
            "chunk_analysis",
            "start",
            chunk_id=chunk.id,
            chunk_index=i,
            chunk_count=len(chunks),
            chunk_chars=len(chunk.text),
        )
        validated, _parsed, error_response, duration_ms = await _run_single_analysis(chunk.text, f"chunk:{chunk.id}")
        if error_response is not None or validated is None:
            failed_chunks += 1
            stage = "analysis"
            if error_response is not None:
                try:
                    body = getattr(error_response, "body", b"")
                    if isinstance(body, (bytes, bytearray)):
                        payload = json.loads(body.decode("utf-8"))
                        stage = str(payload.get("stage") or stage)
                except Exception:
                    stage = stage
            warning = f"Chunk {i} failed during {stage}"
            warnings.append(warning)
            logger.warning(
                "chunk_analysis_failed",
                extra={
                    "chunk_id": chunk.id,
                    "chunk_index": i,
                    "duration_ms": duration_ms,
                    "stage": stage,
                },
            )
            continue

        payload = validated.model_dump(by_alias=True)
        results.append(payload)
        chunk_summaries.append(
            {
                "id": chunk.id,
                "overview_summary": validated.overview_summary,
                "confidence": validated.confidence,
            }
        )
        _stage_log("chunk_analysis", "end", chunk_id=chunk.id, chunk_index=i, duration_ms=duration_ms)

    total_chunk_ms = int((time.perf_counter() - chunk_total_start) * 1000)
    logger.info(
        "chunk_analysis_summary",
        extra={
            "chunk_count": len(chunks),
            "success_count": len(results),
            "failed_count": failed_chunks,
            "total_chunk_ms": total_chunk_ms,
        },
    )

    if not chunks:
        return _error_json(
            status_code=502,
            error="Chunking failed to produce any chunks",
            stage="chunking",
            details="No chunks were generated for this passage.",
        )

    failure_ratio = failed_chunks / max(1, len(chunks))
    if len(results) == 0 or failure_ratio > MAX_CHUNK_FAILURE_RATIO:
        return _error_json(
            status_code=502,
            error="Too many chunks failed during analysis",
            stage="chunk_analysis",
            details={
                "failed": failed_chunks,
                "total": len(chunks),
                "failure_ratio": round(failure_ratio, 3),
                "max_failure_ratio": MAX_CHUNK_FAILURE_RATIO,
            },
        )

    merged = merge_chunk_results(results)
    merged["chunked"] = True
    merged["chunk_count"] = len(chunks)
    merged["chunk_success_count"] = len(results)
    merged["chunk_failure_count"] = failed_chunks
    merged["chunk_summaries"] = chunk_summaries
    merged.update(response_meta)
    if warnings:
        merged["_warnings"] = warnings

    try:
        final = AnalysisResponse(**merged)
    except ValidationError as exc:
        logger.error(
            "chunk_merge_validation_failed",
            extra={"validation_errors": exc.errors(), "failed_count": failed_chunks, "chunk_count": len(chunks)},
        )
        return _error_json(
            status_code=500,
            error="Structured response normalization failed",
            stage="normalize_response",
            details="Chunk merge output failed response validation.",
        )

    _stage_log("final_response_return", "start", chunked=True)
    _stage_log(
        "final_response_return",
        "end",
        chunked=True,
        chunk_count=len(chunks),
        chunk_success_count=len(results),
        chunk_failure_count=failed_chunks,
        total_chunk_ms=total_chunk_ms,
        total_ms=int((time.perf_counter() - request_start) * 1000),
    )
    return final


# Keep your original endpoint
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)


# Add the UI-friendly endpoint
@app.post("/api/analyze", response_model=AnalysisResponse)
async def api_analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)
