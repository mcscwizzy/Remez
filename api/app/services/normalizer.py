# api/app/services/normalizer.py

from __future__ import annotations

from typing import Any, Dict, List


def _ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _as_confidence(value: Any) -> str:
    if isinstance(value, (int, float)):
        if value >= 0.8:
            return "high"
        if value >= 0.5:
            return "medium"
        return "low"
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"high", "medium", "low"}:
            return v
    return "medium"


def _split_line_range(s: str) -> List[str]:
    """
    Converts "L3-L4" into ["L3","L4"] (inclusive) when possible.
    If parsing fails, returns [s].
    """
    s = s.strip()
    if "-" not in s:
        return [s]

    left, right = [x.strip() for x in s.split("-", 1)]
    if not (left.startswith("L") and right.startswith("L")):
        return [s]

    try:
        a = int(left[1:])
        b = int(right[1:])
    except ValueError:
        return [s]

    if a <= b:
        return [f"L{i}" for i in range(a, b + 1)]
    return [f"L{i}" for i in range(a, b - 1, -1)]


def _normalize_key_terms(data: Dict[str, Any]) -> None:
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
            normalized_terms.append(
                {"term": str(item), "language": "english", "gloss": "", "why_it_matters": ""}
            )
    data["key_terms"] = normalized_terms


def _normalize_nt_parallels(data: Dict[str, Any]) -> None:
    parallels = _ensure_list(data.get("nt_parallels"))
    normalized = []
    for item in parallels:
        if isinstance(item, dict):
            normalized.append(
                {
                    "reference": str(item.get("reference", "")),
                    "type": item.get("type", "thematic"),
                    "reason": str(item.get("reason", "")),
                }
            )
        else:
            normalized.append({"reference": str(item), "type": "thematic", "reason": ""})
    data["nt_parallels"] = normalized


def _normalize_structure(data: Dict[str, Any]) -> None:
    s = data.get("structure")
    if not isinstance(s, dict):
        s = {}
        data["structure"] = s

    # detected/confidence
    detected = s.get("detected", "none")
    if detected not in {"chiasm", "parallelism", "none"}:
        detected = "none"
    s["detected"] = detected
    s["confidence"] = _as_confidence(s.get("confidence"))

    # lines
    lines = _ensure_list(s.get("lines"))
    normalized_lines = []
    for item in lines:
        if isinstance(item, dict):
            normalized_lines.append(
                {"id": str(item.get("id", "")), "text": str(item.get("text", ""))}
            )
        else:
            normalized_lines.append({"id": "", "text": str(item)})
    s["lines"] = normalized_lines

    valid_ids = {ln["id"] for ln in normalized_lines if ln.get("id")}

    # frame
    frame = s.get("frame")
    if isinstance(frame, dict):
        f = {
            "left_id": str(frame.get("left_id", "")),
            "right_id": str(frame.get("right_id", "")),
            "evidence": [str(x) for x in _ensure_list(frame.get("evidence"))],
        }
        s["frame"] = f if f["left_id"] and f["right_id"] else None
    else:
        s["frame"] = None

    # cautions
    s["cautions"] = [str(x) for x in _ensure_list(s.get("cautions"))]

    # parallels (always create the key)
    parallels = _ensure_list(s.get("parallels"))
    normalized_parallels = []
    for g in parallels:
        if not isinstance(g, dict):
            continue

        line_ids = [str(x) for x in _ensure_list(g.get("line_ids"))]
        if valid_ids:
            line_ids = [x for x in line_ids if x in valid_ids]

        anchor_type = g.get("anchor_type", "thematic")
        if anchor_type not in {"lexical", "formula", "keyword", "inversion", "thematic"}:
            anchor_type = "thematic"

        normalized_parallels.append(
            {
                "id": str(g.get("id", "")),
                "line_ids": line_ids,
                "anchor_type": anchor_type,
                "evidence": [str(x) for x in _ensure_list(g.get("evidence"))],
                "why": str(g.get("why", "")),
            }
        )
    s["parallels"] = normalized_parallels

    # candidates
    candidates = _ensure_list(s.get("chiasm_candidates"))
    normalized_candidates = []
    for c in candidates:
        if not isinstance(c, dict):
            continue

        pivot = c.get("pivot") if isinstance(c.get("pivot"), dict) else {}
        pivot_id = str(pivot.get("line_id", ""))
        pivot_why = str(pivot.get("why", ""))

        pairs = _ensure_list(c.get("pairs"))
        normalized_pairs = []
        for p in pairs:
            if not isinstance(p, dict):
                continue

            if "left_ids" in p or "right_ids" in p:
                left_ids = [str(x) for x in _ensure_list(p.get("left_ids"))]
                right_ids = [str(x) for x in _ensure_list(p.get("right_ids"))]
            else:
                left_raw = p.get("left", "")
                right_raw = p.get("right", "")
                left_ids = _split_line_range(left_raw) if isinstance(left_raw, str) else [str(x) for x in _ensure_list(left_raw)]
                right_ids = _split_line_range(right_raw) if isinstance(right_raw, str) else [str(x) for x in _ensure_list(right_raw)]

            if valid_ids:
                left_ids = [x for x in left_ids if x in valid_ids]
                right_ids = [x for x in right_ids if x in valid_ids]

            anchor_type = p.get("anchor_type", "thematic")
            if anchor_type not in {"lexical", "formula", "keyword", "inversion", "thematic"}:
                anchor_type = "thematic"

            evidence = [str(x) for x in _ensure_list(p.get("evidence"))]

            # Pivot exclusivity
            if pivot_id:
                removed = False
                if pivot_id in left_ids:
                    left_ids = [x for x in left_ids if x != pivot_id]
                    removed = True
                if pivot_id in right_ids:
                    right_ids = [x for x in right_ids if x != pivot_id]
                    removed = True
                if removed:
                    s["cautions"].append(
                        f"Normalizer removed pivot line {pivot_id} from a pair to enforce pivot exclusivity."
                    )

            normalized_pairs.append(
                {
                    "label": str(p.get("label", "")),
                    "left_ids": left_ids,
                    "right_ids": right_ids,
                    "anchor_type": anchor_type,
                    "evidence": evidence,
                }
            )

        score = c.get("score_breakdown") if isinstance(c.get("score_breakdown"), dict) else {}

        def _num(x: Any, default: float = 0.0) -> float:
            try:
                return float(x)
            except Exception:
                return default

        score_breakdown = {
            "pair_count_strength": _num(score.get("pair_count_strength")),
            "lexical_anchor_strength": _num(score.get("lexical_anchor_strength")),
            "semantic_anchor_strength": _num(score.get("semantic_anchor_strength")),
            "pivot_strength": _num(score.get("pivot_strength")),
            "noise_penalty": _num(score.get("noise_penalty")),
            "total": _num(score.get("total")),
        }

        normalized_candidates.append(
            {
                "id": str(c.get("id", "")),
                "pattern": str(c.get("pattern", "")),
                "pivot": {"line_id": pivot_id, "why": pivot_why},
                "pairs": normalized_pairs,
                "score_breakdown": score_breakdown,
                "notes": [str(x) for x in _ensure_list(c.get("notes"))],
            }
        )

    s["chiasm_candidates"] = normalized_candidates

    # best_chiasm
    best = s.get("best_chiasm")
    if isinstance(best, dict):
        pivot = best.get("pivot") if isinstance(best.get("pivot"), dict) else {}
        pivot_id = str(pivot.get("line_id", ""))
        pivot_why = str(pivot.get("why", ""))

        pairs = _ensure_list(best.get("pairs"))
        normalized_pairs = []
        for p in pairs:
            if not isinstance(p, dict):
                continue

            left_ids = [str(x) for x in _ensure_list(p.get("left_ids"))]
            right_ids = [str(x) for x in _ensure_list(p.get("right_ids"))]

            if not left_ids and "left" in p:
                left_raw = p.get("left", "")
                left_ids = _split_line_range(left_raw) if isinstance(left_raw, str) else [str(x) for x in _ensure_list(left_raw)]
            if not right_ids and "right" in p:
                right_raw = p.get("right", "")
                right_ids = _split_line_range(right_raw) if isinstance(right_raw, str) else [str(x) for x in _ensure_list(right_raw)]

            if valid_ids:
                left_ids = [x for x in left_ids if x in valid_ids]
                right_ids = [x for x in right_ids if x in valid_ids]

            anchor_type = p.get("anchor_type", "thematic")
            if anchor_type not in {"lexical", "formula", "keyword", "inversion", "thematic"}:
                anchor_type = "thematic"

            evidence = [str(x) for x in _ensure_list(p.get("evidence"))]

            # Pivot exclusivity
            if pivot_id:
                left_ids = [x for x in left_ids if x != pivot_id]
                right_ids = [x for x in right_ids if x != pivot_id]

            normalized_pairs.append(
                {
                    "label": str(p.get("label", "")),
                    "left_ids": left_ids,
                    "right_ids": right_ids,
                    "anchor_type": anchor_type,
                    "evidence": evidence,
                }
            )

        try:
            score_total = float(best.get("score_total", 0.0) or 0.0)
        except Exception:
            score_total = 0.0

        s["best_chiasm"] = {
            "candidate_id": str(best.get("candidate_id", "")),
            "pattern": str(best.get("pattern", "")),
            "pivot": {"line_id": pivot_id, "why": pivot_why},
            "pairs": normalized_pairs,
            "score_total": score_total,
        }
    else:
        s["best_chiasm"] = None

    # Invariant: if not chiasm, best_chiasm must be null
    if s["detected"] != "chiasm":
        s["best_chiasm"] = None

    # If none, keep parallels empty (noise control)
    if s["detected"] == "none":
        s["parallels"] = []


def normalize_llm_output(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Coerce slightly-wrong LLM JSON into the AnalysisResponse schema.
    """
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

    data["confidence"] = _as_confidence(data.get("confidence"))

    if "reference" not in data:
        data["reference"] = None

    if not isinstance(data.get("peshat_summary"), str):
        data["peshat_summary"] = str(data.get("peshat_summary", ""))

    _normalize_key_terms(data)
    _normalize_nt_parallels(data)
    _normalize_structure(data)

    return data
