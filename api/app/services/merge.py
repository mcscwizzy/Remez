from __future__ import annotations

from typing import Any, Dict, List


def _dedupe_str(items: List[str], cap: int | None = None) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in items:
        item = str(raw).strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if cap is not None and len(out) >= cap:
            break
    return out


def _aggregate_confidence(confidences: List[str]) -> str:
    rank = {"low": 0, "medium": 1, "high": 2}
    normalized = [c.lower() for c in confidences if isinstance(c, str) and c.lower() in rank]
    if not normalized:
        return "medium"
    return min(normalized, key=lambda c: rank[c])


def _merge_overview(parts: List[str]) -> str:
    cleaned = [p.strip() for p in parts if isinstance(p, str) and p.strip()]
    if not cleaned:
        return "Chunked analysis completed, but overview content was sparse across chunks."
    if len(cleaned) <= 3:
        return " ".join(cleaned)
    midpoint = len(cleaned) // 2
    return " ".join(cleaned[:midpoint]) + "\n\n" + " ".join(cleaned[midpoint:])


def merge_chunk_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not results:
        return {}

    overviews = [str(r.get("overview_summary", "")).strip() for r in results]
    literary_notes = _dedupe_str([x for r in results for x in (r.get("literary_notes") or [])], cap=5)
    keywords = _dedupe_str([x for r in results for x in (r.get("keywords") or [])], cap=12)
    themes = _dedupe_str([x for r in results for x in (r.get("themes") or [])], cap=8)
    worldview = _dedupe_str([x for r in results for x in (r.get("cultural_worldview_notes") or [])], cap=6)
    motifs = _dedupe_str([x for r in results for x in (r.get("motifs_and_patterns") or [])], cap=6)
    temple = _dedupe_str([x for r in results for x in (r.get("second_temple_bridge") or [])], cap=4)
    alternatives = _dedupe_str([x for r in results for x in (r.get("notable_alternatives") or [])], cap=4)
    applications = _dedupe_str([x for r in results for x in (r.get("application") or [])], cap=2)

    nt_by_ref: Dict[str, Dict[str, Any]] = {}
    for r in results:
        for item in (r.get("nt_parallels") or []):
            if not isinstance(item, dict):
                continue
            ref = str(item.get("reference", "")).strip()
            if not ref:
                continue
            key = ref.lower()
            if key in nt_by_ref:
                continue
            nt_by_ref[key] = {
                "reference": ref,
                "type": str(item.get("type", "thematic") or "thematic"),
                "reason": str(item.get("reason", "")),
            }
            if len(nt_by_ref) >= 5:
                break
        if len(nt_by_ref) >= 5:
            break

    key_terms = []
    key_term_seen = set()
    for r in results:
        for item in (r.get("key_terms") or []):
            if not isinstance(item, dict):
                continue
            term = str(item.get("term", "")).strip()
            if not term:
                continue
            lang = str(item.get("language", "english")).strip().lower() or "english"
            dedupe_key = f"{term.lower()}::{lang}"
            if dedupe_key in key_term_seen:
                continue
            key_term_seen.add(dedupe_key)
            key_terms.append(
                {
                    "term": term,
                    "language": lang,
                    "gloss": str(item.get("gloss", "")),
                    "why_it_matters": str(item.get("why_it_matters", "")),
                }
            )
            if len(key_terms) >= 8:
                break
        if len(key_terms) >= 8:
            break

    confidences = [str(r.get("confidence", "")).strip() for r in results]

    return {
        "structure": {
            "detected": "composite",
            "confidence": "medium",
            "lines": [],
            "frame": None,
            "parallels": [],
            "chiasm_candidates": [],
            "best_chiasm": None,
            "cautions": [
                "This analysis was chunked. Structural relationships may be local to each chunk rather than global across the entire chapter."
            ],
        },
        "narrative_flow": {"scenes": []},
        "overview_summary": _merge_overview(overviews),
        "literary_notes": literary_notes[: max(3, min(5, len(literary_notes)))] if literary_notes else [],
        "keywords": keywords,
        "themes": themes,
        "cultural_worldview_notes": worldview,
        "motifs_and_patterns": motifs,
        "second_temple_bridge": temple,
        "key_terms": key_terms,
        "nt_parallels": list(nt_by_ref.values()),
        "confidence": _aggregate_confidence(confidences),
        "notable_alternatives": alternatives,
        "application": applications,
    }
