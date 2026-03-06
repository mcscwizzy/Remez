// src/types/analyze.ts

export type ConfidenceLabel = "low" | "medium" | "high" | string;

export type LayerId = "overview";

export interface ApiAnalyzeResponse {
  // Current backend fields (based on your sample)
  structure?: ApiStructure;
  narrative_flow?: ApiNarrativeFlow;

  overview_summary?: string;
  literary_notes?: string[];

  keywords?: string[];
  themes?: string[];

  cultural_worldview_notes?: string[];
  hebraic_worldview_notes?: string[]; // allow either name

  motifs_and_patterns?: string[];
  second_temple_bridge?: string[];

  key_terms?: ApiKeyTerm[];

  nt_parallels?: ApiNtParallel[];

  application?: string[];

  confidence?: ConfidenceLabel;

  notable_alternatives?: string[];
  chunked?: boolean;
  chunk_count?: number;
  chunk_summaries?: ApiChunkSummary[];
  chapter_flow_summary?: string[];
  _warnings?: string[];

  // Keep raw passthrough safe
  [k: string]: unknown;
}

export interface ApiStructure {
  detected?: string; // e.g. "parallelism" | "chiasm" ...
  confidence?: ConfidenceLabel;

  lines?: Array<{ id: string; text: string }>;
  frame?: ApiStructureFrame | null;

  parallels?: ApiParallel[];

  chiasm_candidates?: ApiChiasmCandidate[];
  best_chiasm?: ApiBestChiasm | null;

  cautions?: string[];
}

export interface ApiChiasmCandidate {
  id: string;
  confidence?: ConfidenceLabel;
  pivot_ids?: string[] | string;
  pairs?: Array<{
    left_ids?: string[] | string;
    right_ids?: string[] | string;
    anchor_type?: string;
    evidence?: string[];
    label?: string;
    why?: string;
  }>;
  rationale?: string;
  weaknesses?: string[];
}

export interface ApiBestChiasm {
  candidate_id?: string;
  pattern?: string;
  pivot?: { line_id?: string; why?: string };
  pivot_ids?: string[] | string;
  pairs?: Array<{
    left_ids?: string[] | string;
    right_ids?: string[] | string;
    anchor_type?: string;
    evidence?: string[];
    label?: string;
    why?: string;
  }>;
  confidence?: ConfidenceLabel;
}

export interface ApiStructureFrame {
  left_id: string;
  right_id: string;
  evidence?: string[];
}

export interface ApiParallel {
  id?: string;
  line_ids?: string[];
  anchor_type?: string;
  evidence?: string[];
  why?: string;
}

export interface ApiNarrativeFlow {
  scenes?: ApiNarrativeScene[];
}

export interface ApiNarrativeScene {
  id?: string;
  title?: string;
  line_ids?: string[];
  beats?: ApiNarrativeBeat[];
}

export interface ApiNarrativeBeat {
  id?: string;
  label?: "Beat" | "Speech" | "Action" | "Turn" | "Evaluation" | "Petition" | "Verdict" | string;
  line_ids?: string[];
  summary?: string;
}

export interface ApiKeyTerm {
  term: string;
  language?: string; // "hebrew"
  gloss?: string;
  why_it_matters?: string;
}

export interface ApiNtParallel {
  reference: string;
  type?: string; // explicit/thematic
  reason?: string;
}

export interface ApiChunkSummary {
  id: string;
  overview_summary: string;
  confidence: ConfidenceLabel;
}

// ------------------------------
// UI VIEW MODEL (stable contract)
// ------------------------------

export interface UiAnalyzeResponse {
  layers: Record<LayerId, { content: string }>;

  structure: UiStructure;
  narrative_flow: UiNarrativeFlow;

  literary_notes?: string[];
  keywords?: string[];
  themes?: string[];
  cultural_worldview_notes?: string[];
  motifs_and_patterns?: string[];
  second_temple_bridge?: string[];
  nt_parallels?: ApiNtParallel[];
  notable_alternatives?: string[];
  key_terms?: ApiKeyTerm[];
  chunked?: boolean;
  chunk_count?: number;
  chunk_summaries?: ApiChunkSummary[];
  chapter_flow_summary?: string[];
  warnings?: string[];

  // Optional visualization payloads for later
  visualizations?: UiVisualizations;

  // Always keep raw for debugging and Raw tab
  raw: unknown;
}

export interface UiStructure {
  detected: string; // "parallelism" etc
  confidence?: ConfidenceLabel;

  lines: Array<{ id: string; text: string }>;
  parallels: Array<Required<Pick<ApiParallel, "id">> & ApiParallel>;

  frame?: UiStructureFrame | null;
  cautions: string[];

  // Chiasm-ready slots (for later)
  chiasm_candidates: ApiChiasmCandidate[];
  best_chiasm: ApiBestChiasm | null;
}

export interface UiStructureFrame {
  left_id: string;
  right_id: string;
  evidence?: string[];
}

export interface UiNarrativeFlow {
  scenes: UiNarrativeScene[];
}

export interface UiNarrativeScene {
  id: string;
  title: string;
  line_ids: string[];
  beats: UiNarrativeBeat[];
}

export interface UiNarrativeBeat {
  id: string;
  label: "Beat" | "Speech" | "Action" | "Turn" | "Evaluation" | "Petition" | "Verdict";
  line_ids: string[];
  summary: string;
}

export interface UiVisualizations {
  // Simple, generic graph structure you can feed into D3/ReactFlow/etc later
  graph?: {
    nodes: Array<{
      id: string;
      label: string;
      kind?: string; // "verse" | "motif" | "promise" | etc
      meta?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      from: string;
      to: string;
      label?: string;
      kind?: string; // "parallel" | "cause" | "theme" ...
      meta?: Record<string, unknown>;
    }>;
  };

  // If you later choose Mermaid, store it too
  mermaid?: {
    id: string;
    code: string;
  }[];
}
