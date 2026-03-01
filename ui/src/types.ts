export type AnalyzeRequest = {
  text?: string;        // pasted passage text (required in UI)
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
