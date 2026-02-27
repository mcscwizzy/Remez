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
        lines = structure.get("lines", []) if isinstance(structure, dict) else []

        return (
            len(lines) < 2
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
                "\n\nYou returned output that was too empty or missing structure segmentation.\n"
                "Retry and meet minimum requirements. Ensure structure.lines is populated with ids L1..Ln.\n"
                "If structure.detected != 'chiasm', structure.best_chiasm must be null."
            )
            raw_response = await call_azure_foundry(prompt2)
            parsed = normalize_llm_output(json.loads(raw_response))

        return AnalysisResponse(**parsed)

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Model did not return valid JSON.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse model output: {str(e)}")
