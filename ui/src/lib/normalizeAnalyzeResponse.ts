// src/lib/normalizeAnalyzeResponse.ts
import type { ApiAnalyzeResponse, UiAnalyzeResponse } from "../types/analyze";

const asArray = <T>(v: unknown, fallback: T[] = []): T[] => {
  return Array.isArray(v) ? (v as T[]) : fallback;
};

const asString = (v: unknown, fallback = ""): string => {
  return typeof v === "string" ? v : fallback;
};

export function normalizeAnalyzeResponse(api: ApiAnalyzeResponse): UiAnalyzeResponse {
  const structure = api.structure ?? {};

  return {
    layers: {
      overview: { content: asString(api.overview_summary) }
    },

    structure: {
      detected: asString(structure.detected, "unknown"),
      confidence: structure.confidence,

      lines: asArray(structure.lines, []),
      parallels: asArray(structure.parallels, []).map((p: any, idx: number) => ({
        id: asString(p?.id, `P${idx + 1}`),
        ...p
      })),

      frame: (structure.frame as any) ?? null,
      cautions: asArray<string>(structure.cautions, []),

      chiasm_candidates: asArray(structure.chiasm_candidates, []),
      best_chiasm: (structure.best_chiasm as any) ?? null
    },

    literary_notes: asArray<string>(api.literary_notes, []),
    keywords: asArray<string>(api.keywords, []),
    themes: asArray<string>(api.themes, []),
    cultural_worldview_notes: asArray<string>(api.cultural_worldview_notes, []),
    motifs_and_patterns: asArray<string>(api.motifs_and_patterns, []),
    second_temple_bridge: asArray<string>(api.second_temple_bridge, []),
    nt_parallels: asArray(api.nt_parallels, []),
    notable_alternatives: asArray<string>(api.notable_alternatives, []),
    key_terms: asArray(api.key_terms, []),

    // reserved for later; backend can start emitting this when ready
    visualizations: (api as any).visualizations,

    raw: api
  };
}
