export type RemezMode = "overview";

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
