export type RemezMode = "peshat" | "remez" | "derash" | "sod";

export type AnalyzeRequest = {
  reference?: string;   // e.g. "Genesis 15:1-6"
  text?: string;        // if user pastes text instead
  mode?: RemezMode;
  includeChiasm?: boolean;
  includeHebraicNotes?: boolean;
  includeNTParallels?: boolean;
};

export type ChiasmHit = {
  label: string;              // e.g. "A / A'"
  startVerse?: string;
  endVerse?: string;
  notes?: string;
};

export type AnalyzeResponse = {
  reference?: string;
  peshat_summary?: string;
  remez_summary?: string;
  derash_summary?: string;
  sod_summary?: string;

  keywords?: string[];
  themes?: string[];
  hebraic_worldview_notes?: string[];
  nt_parallels?: string[];

  chiasm?: {
    detected: boolean;
    confidence?: number; // 0-1
    hits?: ChiasmHit[];
    reasoning?: string;
  };

  // keep it flexible while you iterate server-side
  raw?: unknown;
};
