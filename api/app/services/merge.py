from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List


STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "through",
    "over",
    "under",
    "when",
    "where",
    "then",
    "their",
    "there",
    "about",
    "chapter",
    "passage",
}


def _clean(item: Any) -> str:
    return str(item or "").strip()


def _tokenize(value: str) -> List[str]:
    return [t for t in re.findall(r"[a-zA-Z']+", value.lower()) if t and t not in STOPWORDS]


def _semantic_key(value: str) -> str:
    tokens = _tokenize(value)
    if not tokens:
        return value.lower()
    return " ".join(sorted(set(tokens[:6])))


def _pick_confidence(values: List[str]) -> str:
    rank = {"low": 0, "medium": 1, "high": 2}
    normalized = [v.lower() for v in values if isinstance(v, str) and v.lower() in rank]
    if not normalized:
        return "medium"
    return min(normalized, key=lambda x: rank[x])


def _merge_ranked_text_lists(values: List[str], cap: int) -> List[str]:
    buckets: Dict[str, Dict[str, Any]] = {}
    for val in values:
        text = _clean(val)
        if not text:
            continue
        key = _semantic_key(text)
        if key not in buckets:
            buckets[key] = {"count": 0, "best": text}
        buckets[key]["count"] += 1
        if len(text) > len(buckets[key]["best"]):
            buckets[key]["best"] = text

    ranked = sorted(buckets.values(), key=lambda x: (x["count"], len(x["best"])), reverse=True)
    return [x["best"] for x in ranked[:cap]]


def _merge_keywords(results: List[Dict[str, Any]], cap: int = 12) -> List[str]:
    counter: Counter[str] = Counter()
    canonical: Dict[str, str] = {}
    for result in results:
        for raw in (result.get("keywords") or []):
            keyword = _clean(raw)
            if not keyword:
                continue
            key = keyword.lower()
            counter[key] += 1
            canonical[key] = keyword
    ranked = sorted(counter.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)
    return [canonical[k] for k, _ in ranked[:cap]]


def _merge_nt_parallels(results: List[Dict[str, Any]], cap: int = 5) -> List[Dict[str, str]]:
    by_ref: Dict[str, Dict[str, str]] = {}
    for result in results:
        for item in (result.get("nt_parallels") or []):
            if not isinstance(item, dict):
                continue
            ref = _clean(item.get("reference"))
            if not ref:
                continue
            key = ref.lower()
            reason = _clean(item.get("reason"))
            record = {
                "reference": ref,
                "type": _clean(item.get("type")) or "thematic",
                "reason": reason,
            }
            if key not in by_ref or len(reason) > len(by_ref[key].get("reason", "")):
                by_ref[key] = record
    ranked = sorted(by_ref.values(), key=lambda x: len(x.get("reason", "")), reverse=True)
    return ranked[:cap]


def _synthesize_overview(chunk_summaries: List[str], themes: List[str], motifs: List[str]) -> str:
    summary_text = " ".join([_clean(x) for x in chunk_summaries if _clean(x)])
    summary_text = re.sub(r"\s+", " ", summary_text).strip()
    if not summary_text:
        summary_text = "This chapter unfolds in multiple connected movements."
    anchors: List[str] = []
    if themes:
        anchors.append("Themes: " + "; ".join(themes[:3]) + ".")
    if motifs:
        anchors.append("Recurring motifs: " + "; ".join(motifs[:3]) + ".")
    if anchors:
        return summary_text + " " + " ".join(anchors)
    return summary_text


def _synthesize_literary_notes(chunk_notes: List[str], chunk_summaries: List[str], cap: int = 5) -> List[str]:
    base = _merge_ranked_text_lists(chunk_notes, cap=max(cap, 3))
    if len(base) < 3:
        # Backfill from chunk summaries so this stays chapter-level and readable.
        base.extend(_merge_ranked_text_lists(chunk_summaries, cap=cap))
    shaped: List[str] = []
    for note in base:
        text = _clean(note)
        if not text:
            continue
        if len(text) > 220:
            text = text[:219].rstrip() + "…"
        if not re.search(r"[.!?]$", text):
            text += "."
        shaped.append(text)
        if len(shaped) >= cap:
            break
    return shaped[: max(3, min(cap, len(shaped)))] if shaped else []


def _synthesize_chapter_flow(chunk_summaries: List[str]) -> List[str]:
    bullets: List[str] = []
    cleaned = [_clean(x) for x in chunk_summaries if _clean(x)]
    if not cleaned:
        return ["Opening movement establishes the chapter direction."]

    size = min(6, max(3, len(cleaned)))
    # Preserve ordered progression: sample evenly across chunk sequence.
    step = max(1, len(cleaned) // size)
    selected = cleaned[::step][:size]

    for idx, summary in enumerate(selected, start=1):
        text = re.sub(r"\s+", " ", summary).strip()
        if len(text) > 110:
            text = text[:109].rstrip() + "…"
        if not text:
            continue
        label = "Opening" if idx == 1 else "Closing" if idx == len(selected) else f"Movement {idx}"
        bullets.append(f"{label}: {text}")
    return bullets[:6]


def merge_chunk_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not results:
        return {}

    chunk_overviews = [_clean(r.get("overview_summary")) for r in results]
    chunk_themes = [x for r in results for x in (r.get("themes") or [])]
    chunk_motifs = [x for r in results for x in (r.get("motifs_and_patterns") or [])]
    chunk_notes = [x for r in results for x in (r.get("literary_notes") or [])]
    chunk_keywords = [x for r in results for x in (r.get("keywords") or [])]
    chunk_apps = [x for r in results for x in (r.get("application") or [])]

    themes = _merge_ranked_text_lists(chunk_themes, cap=8)
    motifs = _merge_ranked_text_lists(chunk_motifs, cap=6)
    worldview = _merge_ranked_text_lists(
        [x for r in results for x in (r.get("cultural_worldview_notes") or [])], cap=6
    )
    temple = _merge_ranked_text_lists(
        [x for r in results for x in (r.get("second_temple_bridge") or [])], cap=4
    )
    alternatives = _merge_ranked_text_lists(
        [x for r in results for x in (r.get("notable_alternatives") or [])], cap=4
    )
    applications = _merge_ranked_text_lists(chunk_apps, cap=2)
    keywords = _merge_keywords(results, cap=12)
    nt_parallels = _merge_nt_parallels(results, cap=5)

    key_terms: List[Dict[str, str]] = []
    seen_terms = set()
    for result in results:
        for item in (result.get("key_terms") or []):
            if not isinstance(item, dict):
                continue
            term = _clean(item.get("term"))
            language = (_clean(item.get("language")) or "english").lower()
            if not term:
                continue
            dedupe = f"{term.lower()}::{language}"
            if dedupe in seen_terms:
                continue
            seen_terms.add(dedupe)
            key_terms.append(
                {
                    "term": term,
                    "language": language,
                    "gloss": _clean(item.get("gloss")),
                    "why_it_matters": _clean(item.get("why_it_matters")),
                }
            )
            if len(key_terms) >= 8:
                break
        if len(key_terms) >= 8:
            break

    overview_summary = _synthesize_overview(chunk_overviews, themes, motifs)
    literary_notes = _synthesize_literary_notes(chunk_notes, chunk_overviews, cap=5)
    chapter_flow_summary = _synthesize_chapter_flow(chunk_overviews)

    confidence = _pick_confidence([_clean(r.get("confidence")) for r in results])

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
                "This passage was analyzed in chunks. Structural findings are strongest within local sections unless a larger pattern is explicitly synthesized later."
            ],
        },
        "narrative_flow": {"scenes": []},
        "overview_summary": overview_summary,
        "literary_notes": literary_notes,
        "keywords": keywords,
        "themes": themes,
        "cultural_worldview_notes": worldview,
        "motifs_and_patterns": motifs,
        "second_temple_bridge": temple,
        "key_terms": key_terms,
        "nt_parallels": nt_parallels,
        "confidence": confidence,
        "notable_alternatives": alternatives,
        "application": applications[:2],
        "chapter_flow_summary": chapter_flow_summary,
    }
