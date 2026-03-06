# api/app/main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from .models import AnalyzeRequest, AnalysisResponse
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry, UpstreamModelContentError
from .services.normalizer import normalize_llm_output
import json
import os
import time
import uuid
import asyncio
import logging
import httpx
from typing import Any, Dict

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

MAX_WALL_TIME_SEC = float(os.getenv("MAX_WALL_TIME_SEC", "240"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "12000"))
RAW_LOG_CHARS = int(os.getenv("RAW_LOG_CHARS", "3000"))


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


def _error_json(status_code: int, error: str, stage: str, details: str | None = None) -> JSONResponse:
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


async def _analyze_impl(req: AnalyzeRequest) -> AnalysisResponse | JSONResponse:
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Passage text is required.")
    if len(req.text) > MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Passage too long. Please shorten the text (max {MAX_INPUT_CHARS} characters).",
        )

    _stage_log("prompt_build", "start")
    prompt = build_prompt(req.text)
    _stage_log("prompt_build", "end", chars=len(prompt))

    start_total = time.perf_counter()

    async def call_with_budget(prompt_text: str) -> str:
        remaining = max(1.0, MAX_WALL_TIME_SEC - (time.perf_counter() - start_total))
        return await asyncio.wait_for(call_azure_foundry(prompt_text), timeout=remaining)

    llm_ms = 0
    parse_norm_ms = 0

    _stage_log("model_request", "start", attempt="initial")
    llm_start = time.perf_counter()
    try:
        raw_response = await call_with_budget(prompt)
    except asyncio.TimeoutError:
        logger.error("model_request_timeout", extra={"attempt": "initial"})
        return _error_json(
            status_code=504,
            error="Upstream model call failed",
            stage="model_call",
            details="Analysis exceeded time limit.",
        )
    except httpx.HTTPStatusError as exc:
        detail = _truncate_for_log(exc.response.text if exc.response is not None else str(exc))
        logger.error(
            "model_request_http_status_error",
            extra={"attempt": "initial", "status_code": exc.response.status_code if exc.response else None, "details": detail},
        )
        return _error_json(
            status_code=502,
            error="Upstream model call failed",
            stage="model_call",
            details=detail,
        )
    except UpstreamModelContentError as exc:
        logger.error(
            "extract_model_text_failed",
            extra={"attempt": "initial", "details": exc.details},
        )
        return _error_json(
            status_code=502,
            error=exc.error,
            stage=exc.stage,
            details=exc.details,
        )
    except Exception as exc:
        logger.exception("model_request_failed", extra={"attempt": "initial", "exception_type": type(exc).__name__})
        return _error_json(
            status_code=502,
            error="Upstream model call failed",
            stage="model_call",
            details=str(exc),
        )
    llm_ms += int((time.perf_counter() - llm_start) * 1000)
    _stage_log("model_request", "end", attempt="initial", ms=llm_ms)

    parse_norm_start = time.perf_counter()
    validated, parsed, error_response = _parse_and_normalize(raw_response, "initial")
    parse_norm_ms += int((time.perf_counter() - parse_norm_start) * 1000)
    if error_response is not None:
        return error_response

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

        _stage_log("model_request", "start", attempt="retry_1")
        llm_start = time.perf_counter()
        try:
            raw_response = await call_with_budget(prompt2)
        except asyncio.TimeoutError:
            logger.error("model_request_timeout", extra={"attempt": "retry_1"})
            return _error_json(
                status_code=504,
                error="Upstream model call failed",
                stage="model_call",
                details="Analysis exceeded time limit on retry.",
            )
        except httpx.HTTPStatusError as exc:
            detail = _truncate_for_log(exc.response.text if exc.response is not None else str(exc))
            logger.error(
                "model_request_http_status_error",
                extra={"attempt": "retry_1", "status_code": exc.response.status_code if exc.response else None, "details": detail},
            )
            return _error_json(
                status_code=502,
                error="Upstream model call failed",
                stage="model_call",
                details=detail,
            )
        except UpstreamModelContentError as exc:
            logger.error(
                "extract_model_text_failed",
                extra={"attempt": "retry_1", "details": exc.details},
            )
            return _error_json(
                status_code=502,
                error=exc.error,
                stage=exc.stage,
                details=exc.details,
            )
        except Exception as exc:
            logger.exception("model_request_failed", extra={"attempt": "retry_1", "exception_type": type(exc).__name__})
            return _error_json(
                status_code=502,
                error="Upstream model call failed",
                stage="model_call",
                details=str(exc),
            )
        llm_retry_ms = int((time.perf_counter() - llm_start) * 1000)
        llm_ms += llm_retry_ms
        _stage_log("model_request", "end", attempt="retry_1", ms=llm_retry_ms)

        parse_norm_start = time.perf_counter()
        validated, parsed, error_response = _parse_and_normalize(raw_response, "retry_1")
        parse_norm_ms += int((time.perf_counter() - parse_norm_start) * 1000)
        if error_response is not None:
            return error_response

    total_ms = int((time.perf_counter() - start_total) * 1000)
    logger.info(
        "analyze_timing",
        extra={
            "llm_ms": llm_ms,
            "parse_norm_ms": parse_norm_ms,
            "total_ms": total_ms,
        },
    )

    _stage_log("final_response_return", "start")
    _stage_log("final_response_return", "end", total_ms=total_ms)
    return validated


# Keep your original endpoint
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)


# Add the UI-friendly endpoint
@app.post("/api/analyze", response_model=AnalysisResponse)
async def api_analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)
