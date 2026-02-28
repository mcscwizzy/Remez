// src/types/analyze.ts

export type ConfidenceLabel = "low" | "medium" | "high" | string;

export type LayerId = "overview";

export interface ApiAnalyzeResponse {
  reference?: string;

  // Current backend fields (based on your sample)
  structure?: ApiStructure;

  overview_summary?: string;

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

  // Keep raw passthrough safe
  [k: string]: unknown;
}

export interface ApiStructure {
  detected?: string; // e.g. "parallelism" | "chiasm" ...
  confidence?: ConfidenceLabel;

  lines?: Array<{ id: string; text: string }>;
  frame?: ApiStructureFrame | null;

  parallels?: ApiParallel[];

  chiasm_candidates?: unknown[];
  best_chiasm?: unknown;

  cautions?: string[];
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

// ------------------------------
// UI VIEW MODEL (stable contract)
// ------------------------------

export interface UiAnalyzeResponse {
  reference: string;

  layers: Record<LayerId, { content: string }>;

  structure: UiStructure;

  notes: UiNotes;

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
  chiasm_candidates: unknown[];
  best_chiasm: unknown | null;
}

export interface UiStructureFrame {
  left_id: string;
  right_id: string;
  evidence?: string[];
}

export interface UiNotes {
  keywords: string[];
  themes: string[];

  worldview: string[]; // normalized worldview notes
  motifs: string[];
  secondTemple: string[];

  keyTerms: ApiKeyTerm[];

  ntParallels: ApiNtParallel[];

  alternatives: string[];
  application: string[];
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
