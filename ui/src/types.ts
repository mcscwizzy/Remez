export type AnalyzeRequest = {
  reference?: string;   // optional label, e.g. "Genesis 15:1-6"
  translation?: string; // optional translation label, e.g. "NIV"
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
