// src/lib/normalizeAnalyzeResponse.ts
import type { ApiAnalyzeResponse, UiAnalyzeResponse } from "../types/analyze";

const asArray = <T>(v: unknown, fallback: T[] = []): T[] => {
  return Array.isArray(v) ? (v as T[]) : fallback;
};

const asString = (v: unknown, fallback = ""): string => {
  return typeof v === "string" ? v : fallback;
};

const NARRATIVE_LABELS = new Set(["Beat", "Speech", "Action", "Turn", "Evaluation", "Petition", "Verdict"]);
type NarrativeLabel = "Beat" | "Speech" | "Action" | "Turn" | "Evaluation" | "Petition" | "Verdict";

const toNarrativeLabel = (value: string): NarrativeLabel => {
  return NARRATIVE_LABELS.has(value) ? (value as NarrativeLabel) : "Beat";
};

export function normalizeAnalyzeResponse(api: ApiAnalyzeResponse): UiAnalyzeResponse {
  const structure = api.structure ?? {};
  const lines = asArray<{ id: string; text: string }>(structure.lines, []);
  const validIds = new Set(lines.map((line) => line.id));

  const normalizedScenes = asArray(api.narrative_flow?.scenes, []).map((scene: any, sceneIdx: number) => {
    const beats = asArray(scene?.beats, []).map((beat: any, beatIdx: number) => {
      const label = asString(beat?.label, "Beat");
      const line_ids = asArray<string>(beat?.line_ids, []).filter((id) => validIds.has(id));
      return {
        id: asString(beat?.id, `S${sceneIdx + 1}B${beatIdx + 1}`),
        label: toNarrativeLabel(label),
        line_ids,
        summary: asString(beat?.summary, "Text advances in this movement.")
      };
    });

    const sceneLineIds = beats.flatMap((beat) => beat.line_ids);
    const dedupSceneLineIds = Array.from(new Set(sceneLineIds));
    return {
      id: asString(scene?.id, `S${sceneIdx + 1}`),
      title: asString(scene?.title, `Scene ${sceneIdx + 1}`),
      line_ids: dedupSceneLineIds.length
        ? dedupSceneLineIds
        : asArray<string>(scene?.line_ids, []).filter((id) => validIds.has(id)),
      beats
    };
  });

  const fallbackNarrativeFlow = (() => {
    if (!lines.length) return { scenes: [] };
    return {
      scenes: [
        {
          id: "S1",
          title: "Scene 1",
          line_ids: lines.map((line) => line.id),
          beats: lines.map((line, idx) => ({
            id: `S1B${idx + 1}`,
            label: "Beat" as const,
            line_ids: [line.id],
            summary: line.text
          }))
        }
      ]
    };
  })();

  return {
    layers: {
      overview: { content: asString(api.overview_summary) }
    },

    reference: asString(api.reference) || undefined,
    source_translation: asString(api.source_translation) || undefined,
    source_mode: (api.source_mode as any) ?? undefined,

    structure: {
      detected: asString(structure.detected, "unknown"),
      confidence: structure.confidence,

      lines,
      parallels: asArray(structure.parallels, []).map((p: any, idx: number) => ({
        id: asString(p?.id, `P${idx + 1}`),
        ...p
      })),

      frame: (structure.frame as any) ?? null,
      cautions: asArray<string>(structure.cautions, []),

      chiasm_candidates: asArray(structure.chiasm_candidates, []),
      best_chiasm: (structure.best_chiasm as any) ?? null
    },
    narrative_flow: normalizedScenes.length ? { scenes: normalizedScenes } : fallbackNarrativeFlow,

    literary_notes: asArray<string>(api.literary_notes, []),
    keywords: asArray<string>(api.keywords, []),
    themes: asArray<string>(api.themes, []),
    cultural_worldview_notes: asArray<string>(api.cultural_worldview_notes, []),
    motifs_and_patterns: asArray<string>(api.motifs_and_patterns, []),
    second_temple_bridge: asArray<string>(api.second_temple_bridge, []),
    nt_parallels: asArray(api.nt_parallels, []),
    notable_alternatives: asArray<string>(api.notable_alternatives, []),
    key_terms: asArray(api.key_terms, []),
    chunked: Boolean(api.chunked),
    chunk_count: typeof api.chunk_count === "number" ? api.chunk_count : undefined,
    chunk_success_count: typeof api.chunk_success_count === "number" ? api.chunk_success_count : undefined,
    chunk_failure_count: typeof api.chunk_failure_count === "number" ? api.chunk_failure_count : undefined,
    chunk_summaries: asArray(api.chunk_summaries, []),
    chapter_flow_summary: asArray<string>(api.chapter_flow_summary, []),
    warnings: asArray<string>(api._warnings, []),

    // reserved for later; backend can start emitting this when ready
    visualizations: (api as any).visualizations,

    raw: api
  };
}
