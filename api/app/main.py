# api/app/main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from .models import AnalyzeRequest, AnalysisResponse
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry
from .services.normalizer import normalize_llm_output
import json
import os
import time
import uuid
import asyncio
import logging

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

    lines = structure.get("lines", [])
    detected = structure.get("detected", "none")
    parallels = structure.get("parallels", [])

    # Enforce Option A: parallelism MUST include at least 2 parallel groups
    missing_parallels = (detected == "parallelism" and len(parallels) < 2)

    return (
        len(lines) < 2
        or missing_parallels
        or len(p.get("cultural_worldview_notes", [])) < 2
        or len(p.get("motifs_and_patterns", [])) < 2
        or len(p.get("second_temple_bridge", [])) < 1
        or len(p.get("nt_parallels", [])) < 1
    )


async def _analyze_impl(req: AnalyzeRequest) -> AnalysisResponse:
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Passage text is required.")
    if len(req.text) > MAX_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Passage too long. Please shorten the text (max {MAX_INPUT_CHARS} characters).",
        )

    prompt = build_prompt(req.text)

    start_total = time.perf_counter()

    async def call_with_budget(prompt_text: str) -> str:
        remaining = max(1.0, MAX_WALL_TIME_SEC - (time.perf_counter() - start_total))
        return await asyncio.wait_for(call_azure_foundry(prompt_text), timeout=remaining)

    try:
        llm_start = time.perf_counter()
        raw_response = await call_with_budget(prompt)
        llm_ms = int((time.perf_counter() - llm_start) * 1000)

        parse_start = time.perf_counter()
        parsed = normalize_llm_output(json.loads(raw_response))
        parse_ms = int((time.perf_counter() - parse_start) * 1000)

        # Retry once if schema-minimums are violated
        if _too_empty(parsed):
            logger.warning("analyze_retry_schema_minimums")
            prompt2 = prompt + (
                "\n\nYour output was missing required structure elements.\n"
                "- structure.lines must be populated with ids L1..Ln.\n"
                "- If structure.detected == 'parallelism', structure.parallels must contain at least 2 groups.\n"
                "- If structure.detected != 'chiasm', structure.best_chiasm must be null.\n"
                "Return JSON only and comply with the schema exactly."
            )
            llm_start = time.perf_counter()
            raw_response = await call_with_budget(prompt2)
            llm_ms = int((time.perf_counter() - llm_start) * 1000)

            parse_start = time.perf_counter()
            parsed = normalize_llm_output(json.loads(raw_response))
            parse_ms = int((time.perf_counter() - parse_start) * 1000)

        total_ms = int((time.perf_counter() - start_total) * 1000)
        logger.info(
            "analyze_timing",
            extra={
                "llm_ms": llm_ms,
                "parse_ms": parse_ms,
                "total_ms": total_ms,
            },
        )

        return AnalysisResponse(**parsed)

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis exceeded time limit. Try a shorter passage.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Model did not return valid JSON.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse model output: {str(e)}")


# Keep your original endpoint
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)


# Add the UI-friendly endpoint
@app.post("/api/analyze", response_model=AnalysisResponse)
async def api_analyze(req: AnalyzeRequest):
    return await _analyze_impl(req)
