from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    reference: Optional[str] = Field(
        default=None,
        description="Bible reference like 'Genesis 15:1-6'"
    )
    text: Optional[str] = Field(
        default=None,
        description="Raw passage text (if not using reference)"
    )
    profile: Literal["heiser"] = Field(default="heiser")


class NTParallel(BaseModel):
    reference: str
    type: Literal["explicit", "thematic", "typology"]
    reason: str


class KeyTerm(BaseModel):
    term: str
    language: Literal["hebrew", "greek", "aramaic", "english"]
    gloss: str
    why_it_matters: str


# -------- Structure / Chiasm Models --------

class StructureLine(BaseModel):
    id: str  # "L1", "L2", ...
    text: str


class ChiasmPivot(BaseModel):
    line_id: str
    why: str


class ChiasmPair(BaseModel):
    label: str  # "A", "B", "C", etc.
    left: str   # line_id
    right: str  # line_id
    evidence: List[str] = Field(default_factory=list)


class ScoreBreakdown(BaseModel):
    pair_count_strength: float
    lexical_anchor_strength: float
    semantic_anchor_strength: float
    pivot_strength: float
    noise_penalty: float
    total: float


class ChiasmCandidate(BaseModel):
    id: str
    pattern: str  # e.g. "A B C X C' B' A'"
    pivot: ChiasmPivot
    pairs: List[ChiasmPair] = Field(default_factory=list)
    score_breakdown: ScoreBreakdown
    notes: List[str] = Field(default_factory=list)


class BestChiasm(BaseModel):
    candidate_id: str
    pattern: str
    pivot: ChiasmPivot
    pairs: List[ChiasmPair] = Field(default_factory=list)
    score_total: float


class StructureResult(BaseModel):
    detected: Literal["chiasm", "parallelism", "none"]
    confidence: Literal["high", "medium", "low"]

    # Always required: segmentation should always be present
    lines: List[StructureLine] = Field(default_factory=list)

    # 0–2 candidates max (prompt governs this; model just supports it)
    chiasm_candidates: List[ChiasmCandidate] = Field(default_factory=list)

    # Must be null unless detected == "chiasm"
    best_chiasm: Optional[BestChiasm] = None

    cautions: List[str] = Field(default_factory=list)


# -------- Main Analysis Response --------

class AnalysisResponse(BaseModel):
    reference: Optional[str] = None

    # NEW: structure block added
    structure: StructureResult

    # Core outputs
    peshat_summary: str
    keywords: List[str] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)

    # Heiser / cultural worldview sections
    cultural_worldview_notes: List[str] = Field(default_factory=list)
    motifs_and_patterns: List[str] = Field(default_factory=list)
    second_temple_bridge: List[str] = Field(default_factory=list)

    # Text details (kept lightweight)
    key_terms: List[KeyTerm] = Field(default_factory=list)

    # Cross-textual links
    nt_parallels: List[NTParallel] = Field(default_factory=list)

    # Trust / humility
    confidence: Literal["high", "medium", "low"]
    notable_alternatives: List[str] = Field(default_factory=list)

    # Optional “so what” (but prompt wants at least 1, so not Optional anymore)
    application: List[str] = Field(default_factory=list)
