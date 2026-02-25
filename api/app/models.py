from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class AnalyzeRequest(BaseModel):
    reference: Optional[str] = Field(
        default=None, description="Bible reference like 'Genesis 15:1-6'"
    )
    text: Optional[str] = Field(
        default=None, description="Raw passage text (if not using reference)"
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


class AnalysisResponse(BaseModel):
    reference: Optional[str] = None

    # Core outputs
    peshat_summary: str
    keywords: List[str]
    themes: List[str]

    # Heiser / cultural worldview sections
    cultural_worldview_notes: List[str]
    motifs_and_patterns: List[str]
    second_temple_bridge: List[str]

    # Text details (kept lightweight)
    key_terms: List[KeyTerm]

    # Cross-textual links
    nt_parallels: List[NTParallel]

    # Trust / humility
    confidence: Literal["high", "medium", "low"]
    notable_alternatives: List[str]

    # Optional “so what” (kept restrained)
    application: Optional[List[str]] = None