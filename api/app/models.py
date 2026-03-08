# api/app/models.py

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class AnalyzeRequest(BaseModel):
    text: Optional[str] = Field(
        default=None,
        description="Raw passage text supplied by the user",
    )
    reference: Optional[str] = Field(
        default=None,
        description="Scripture reference (e.g., Genesis 1 or Philippians 2:6-11)",
    )
    source_mode: Optional[Literal["reference", "custom_text"]] = Field(
        default=None,
        description="Input mode selector for reference lookup vs custom text",
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


class StructureFrame(BaseModel):
    left_id: str
    right_id: str
    evidence: List[str] = Field(default_factory=list)


class ParallelGroup(BaseModel):
    id: str
    line_ids: List[str] = Field(default_factory=list)
    anchor_type: Literal["lexical", "formula", "keyword", "inversion", "thematic"]
    evidence: List[str] = Field(default_factory=list)
    why: str


class ChiasmPivot(BaseModel):
    line_id: str
    why: str


class ChiasmPair(BaseModel):
    label: str
    left_ids: List[str] = Field(default_factory=list)
    right_ids: List[str] = Field(default_factory=list)
    anchor_type: Literal["lexical", "formula", "keyword", "inversion", "thematic"]
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
    pattern: str
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
    detected: Literal["chiasm", "parallelism", "none", "composite"]
    confidence: Literal["high", "medium", "low"]

    lines: List[StructureLine] = Field(default_factory=list)

    frame: Optional[StructureFrame] = None

    parallels: List[ParallelGroup] = Field(default_factory=list)

    chiasm_candidates: List[ChiasmCandidate] = Field(default_factory=list)

    best_chiasm: Optional[BestChiasm] = None

    cautions: List[str] = Field(default_factory=list)


# -------- Narrative Flow Models --------

class NarrativeBeat(BaseModel):
    id: str
    label: Literal["Beat", "Speech", "Action", "Turn", "Evaluation", "Petition", "Verdict"]
    line_ids: List[str] = Field(default_factory=list)
    summary: str


class NarrativeScene(BaseModel):
    id: str
    title: str
    line_ids: List[str] = Field(default_factory=list)
    beats: List[NarrativeBeat] = Field(default_factory=list)


class NarrativeFlowResult(BaseModel):
    scenes: List[NarrativeScene] = Field(default_factory=list)


# -------- Chunk Metadata --------

class ChunkSummary(BaseModel):
    id: str
    overview_summary: str
    confidence: Literal["high", "medium", "low"]


# -------- Main Analysis Response --------

class AnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reference: Optional[str] = None
    source_translation: Optional[str] = None
    source_mode: Optional[Literal["reference", "custom_text"]] = None

    structure: StructureResult
    narrative_flow: NarrativeFlowResult

    overview_summary: str
    literary_notes: Optional[List[str]] = None
    keywords: List[str] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)

    cultural_worldview_notes: List[str] = Field(default_factory=list)
    motifs_and_patterns: List[str] = Field(default_factory=list)
    second_temple_bridge: List[str] = Field(default_factory=list)

    key_terms: List[KeyTerm] = Field(default_factory=list)

    nt_parallels: List[NTParallel] = Field(default_factory=list)

    confidence: Literal["high", "medium", "low"]
    notable_alternatives: List[str] = Field(default_factory=list)

    application: List[str] = Field(default_factory=list)

    chunked: bool = False
    chunk_count: Optional[int] = None
    chunk_success_count: Optional[int] = None
    chunk_failure_count: Optional[int] = None
    chunk_summaries: List[ChunkSummary] = Field(default_factory=list)
    chapter_flow_summary: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list, alias="_warnings", serialization_alias="_warnings")
