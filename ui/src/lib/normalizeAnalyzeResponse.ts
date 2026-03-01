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

  const worldview =
    asArray<string>(api.hebraic_worldview_notes).length > 0
      ? asArray<string>(api.hebraic_worldview_notes)
      : asArray<string>(api.cultural_worldview_notes);

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

    notes: {
      keywords: asArray<string>(api.keywords, []),
      themes: asArray<string>(api.themes, []),

      worldview,
      motifs: asArray<string>(api.motifs_and_patterns, []),
      secondTemple: asArray<string>(api.second_temple_bridge, []),

      keyTerms: asArray(api.key_terms, []),
      ntParallels: asArray(api.nt_parallels, []),

      alternatives: asArray<string>(api.notable_alternatives, []),
      application: asArray<string>(api.application, [])
    },

    // reserved for later; backend can start emitting this when ready
    visualizations: (api as any).visualizations,

    raw: api
  };
}
