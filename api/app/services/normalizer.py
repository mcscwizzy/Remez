from __future__ import annotations

from typing import Any, Dict, List


def _ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    # If model returned a string/dict/number, wrap it
    return [value]


def normalize_llm_output(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Coerce slightly-wrong LLM JSON into the AnalysisResponse schema.
    This keeps POC moving without fighting the model every time.
    """

    # Lists that models often return as string or dict
    for k in [
        "keywords",
        "themes",
        "cultural_worldview_notes",
        "motifs_and_patterns",
        "second_temple_bridge",
        "notable_alternatives",
        "application",
    ]:
        data[k] = [str(x) for x in _ensure_list(data.get(k))]

    # confidence: sometimes numeric
    conf = data.get("confidence")
    if isinstance(conf, (int, float)):
        # simple mapping
        if conf >= 0.8:
            data["confidence"] = "high"
        elif conf >= 0.5:
            data["confidence"] = "medium"
        else:
            data["confidence"] = "low"
    elif isinstance(conf, str):
        conf_l = conf.strip().lower()
        if conf_l not in {"high", "medium", "low"}:
            data["confidence"] = "medium"
        else:
            data["confidence"] = conf_l
    else:
        data["confidence"] = "medium"

    # key_terms: model sometimes returns list of strings
    key_terms = _ensure_list(data.get("key_terms"))
    normalized_terms = []
    for item in key_terms:
        if isinstance(item, dict):
            normalized_terms.append(
                {
                    "term": str(item.get("term", "")),
                    "language": item.get("language", "english"),
                    "gloss": str(item.get("gloss", "")),
                    "why_it_matters": str(item.get("why_it_matters", "")),
                }
            )
        else:
            # string fallback
            normalized_terms.append(
                {
                    "term": str(item),
                    "language": "english",
                    "gloss": "",
                    "why_it_matters": "",
                }
            )
    data["key_terms"] = normalized_terms

    # nt_parallels: model sometimes returns list of strings
    parallels = _ensure_list(data.get("nt_parallels"))
    normalized_parallels = []
    for item in parallels:
        if isinstance(item, dict):
            normalized_parallels.append(
                {
                    "reference": str(item.get("reference", "")),
                    "type": item.get("type", "thematic"),
                    "reason": str(item.get("reason", "")),
                }
            )
        else:
            normalized_parallels.append(
                {
                    "reference": str(item),
                    "type": "thematic",
                    "reason": "",
                }
            )
    data["nt_parallels"] = normalized_parallels

    # reference optional
    if "reference" not in data:
        data["reference"] = None

    # peshat_summary required
    if not isinstance(data.get("peshat_summary"), str):
        data["peshat_summary"] = str(data.get("peshat_summary", ""))

    return data