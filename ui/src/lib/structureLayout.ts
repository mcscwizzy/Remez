import type { UiAnalyzeResponse } from "../types/analyze";

export type ChiasmPair = {
  leftIds: string[];
  rightIds: string[];
  label?: string;
  anchorType?: string;
  evidence?: string[];
  why?: string;
};

export type ChiasmLayout = {
  pairs: ChiasmPair[];
  pivotIds: string[];
  confidence?: string;
};

export type ChiasmParseResult = {
  layout: ChiasmLayout | null;
  issues: string[];
};

const asArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string") as string[];
  }
  if (typeof value === "string") return [value];
  return [];
};

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

export function parseBestChiasm(best: UiAnalyzeResponse["structure"]["best_chiasm"]): ChiasmParseResult {
  if (!best || typeof best !== "object") {
    return { layout: null, issues: ["best_chiasm missing or not an object"] };
  }

  const record = best as Record<string, unknown>;
  const issues: string[] = [];

  const pairsRaw = record.pairs;
  const pairsArray = Array.isArray(pairsRaw) ? pairsRaw : [];
  if (!pairsArray.length) {
    issues.push("best_chiasm.pairs missing or empty");
  }

  const pairs: ChiasmPair[] = pairsArray
    .map((pair) => {
      if (!pair || typeof pair !== "object") return null;
      const p = pair as Record<string, unknown>;
      const leftIds = asArray(p.left_ids ?? p.leftIds);
      const rightIds = asArray(p.right_ids ?? p.rightIds);
      if (!leftIds.length || !rightIds.length) return null;
      return {
        leftIds,
        rightIds,
        label: asString(p.label),
        anchorType: asString(p.anchor_type ?? p.anchorType),
        evidence: Array.isArray(p.evidence) ? (p.evidence.filter((e) => typeof e === "string") as string[]) : undefined,
        why: asString(p.why)
      };
    })
    .filter((p): p is ChiasmPair => Boolean(p));

  if (!pairs.length) {
    issues.push("No valid pairs in best_chiasm.pairs");
  }

  const pivotIds = (() => {
    if (record.pivot_ids || record.pivotIds) return asArray(record.pivot_ids ?? record.pivotIds);
    const pivot = record.pivot;
    if (pivot && typeof pivot === "object") {
      const pivotRecord = pivot as Record<string, unknown>;
      return asArray(pivotRecord.line_id ?? pivotRecord.lineId);
    }
    return [];
  })();

  if (!pivotIds.length) {
    issues.push("Pivot line ids missing");
  }

  const confidence = asString(record.confidence);

  if (!pairs.length || !pivotIds.length) {
    return { layout: null, issues };
  }

  return {
    layout: {
      pairs,
      pivotIds,
      confidence
    },
    issues
  };
}
