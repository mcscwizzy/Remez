from fastapi import FastAPI, HTTPException
from .models import AnalyzeRequest, AnalysisResponse, KeyTerm, NTParallel
from .prompts import build_prompt
from .services.azure_foundry import call_azure_foundry
from .services.normalizer import normalize_llm_output
import json

app = FastAPI(title="Remez API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResponse) 
async def analyze(req: AnalyzeRequest):

    def too_empty(p: dict) -> bool:
        return (
            len(p.get("cultural_worldview_notes", [])) < 2
            or len(p.get("motifs_and_patterns", [])) < 2
            or len(p.get("second_temple_bridge", [])) < 1
            or len(p.get("nt_parallels", [])) < 1
        )

    if not req.reference and not req.text:
        raise HTTPException(status_code=400, detail="Provide either 'reference' or 'text'.")

    prompt = build_prompt(req.reference, req.text)

    raw_response = await call_azure_foundry(prompt)

    try:
        parsed = json.loads(raw_response)
        parsed = normalize_llm_output(parsed)

        if too_empty(parsed):
            # retry once with a stronger nudge
            prompt2 = prompt + "\n\nYou returned empty arrays. Retry and meet the minimum requirements."
            raw_response = await call_azure_foundry(prompt2)
            parsed = normalize_llm_output(json.loads(raw_response))

        return AnalysisResponse(**parsed)  

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Model did not return valid JSON.")

    return AnalysisResponse(**parsed)   
