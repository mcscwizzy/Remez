# api/app/main.py

from fastapi import FastAPI, HTTPException
from .models import AnalyzeRequest, AnalysisResponse
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry
from .services.normalizer import normalize_llm_output
import json

app = FastAPI(title="Remez API", version="0.2.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest):
    def too_empty(p: dict) -> bool:
        structure = p.get("structure") or {}
        if not isinstance(structure, dict):
            return True

        lines = structure.get("lines", [])
        detected = structure.get("detected", "none")
        parallels = structure.get("parallels", [])

        missing_parallels = (detected == "parallelism" and len(parallels) < 2)

        return (
            len(lines) < 2
            or missing_parallels
            or len(p.get("cultural_worldview_notes", [])) < 2
            or len(p.get("motifs_and_patterns", [])) < 2
            or len(p.get("second_temple_bridge", [])) < 1
            or len(p.get("nt_parallels", [])) < 1
        )

    if not req.reference and not req.text:
        raise HTTPException(status_code=400, detail="Provide either 'reference' or 'text'.")

    prompt = build_prompt(req.reference, req.text)
    raw_response = await call_azure_foundry(prompt)

    try:
        parsed = normalize_llm_output(json.loads(raw_response))

        if too_empty(parsed):
            prompt2 = prompt + (
                "\n\nYour output was missing required structure elements.\n"
                "- structure.lines must be populated with ids L1..Ln.\n"
                "- If structure.detected == 'parallelism', structure.parallels must contain at least 2 groups.\n"
                "- If structure.detected != 'chiasm', structure.best_chiasm must be null.\n"
                "Retry and comply with the schema exactly."
            )
            raw_response = await call_azure_foundry(prompt2)
            parsed = normalize_llm_output(json.loads(raw_response))

        return AnalysisResponse(**parsed)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Model did not return valid JSON.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse model output: {str(e)}")
