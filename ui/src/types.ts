export type AnalyzeRequest = {
  reference?: string;   // scripture reference (primary input)
  text?: string;        // custom passage text (advanced mode)
  source_mode?: "reference" | "custom_text";
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
