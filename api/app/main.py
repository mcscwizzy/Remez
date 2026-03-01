# api/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AnalyzeRequest, AnalysisResponse
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry
from .services.normalizer import normalize_llm_output
import json
import os

app = FastAPI(title="Remez API", version="0.2.1")

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

    prompt = build_prompt(req.text)

    raw_response = await call_azure_foundry(prompt)

    try:
        parsed = normalize_llm_output(json.loads(raw_response))

        # Retry once if schema-minimums are violated
        if _too_empty(parsed):
            prompt2 = prompt + (
                "\n\nYour output was missing required structure elements.\n"
                "- structure.lines must be populated with ids L1..Ln.\n"
                "- If structure.detected == 'parallelism', structure.parallels must contain at least 2 groups.\n"
                "- If structure.detected != 'chiasm', structure.best_chiasm must be null.\n"
                "Return JSON only and comply with the schema exactly."
            )
            raw_response = await call_azure_foundry(prompt2)
            parsed = normalize_llm_output(json.loads(raw_response))

        return AnalysisResponse(**parsed)

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
