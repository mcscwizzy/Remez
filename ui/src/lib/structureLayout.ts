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

const parsePairs = (pairsRaw: unknown): { pairs: ChiasmPair[]; issues: string[] } => {
  const issues: string[] = [];
  const pairsArray = Array.isArray(pairsRaw) ? pairsRaw : [];
  if (!pairsArray.length) {
    issues.push("pairs missing or empty");
  }

  const pairs: ChiasmPair[] = [];
  pairsArray.forEach((pair) => {
    if (!pair || typeof pair !== "object") return;
    const p = pair as Record<string, unknown>;
    const leftIds = asArray(p.left_ids ?? p.leftIds);
    const rightIds = asArray(p.right_ids ?? p.rightIds);
    if (!leftIds.length || !rightIds.length) return;
    pairs.push({
      leftIds,
      rightIds,
      label: asString(p.label),
      anchorType: asString(p.anchor_type ?? p.anchorType),
      evidence: Array.isArray(p.evidence) ? (p.evidence.filter((e) => typeof e === "string") as string[]) : undefined,
      why: asString(p.why)
    });
  });

  if (!pairs.length) {
    issues.push("No valid pairs");
  }

  return { pairs, issues };
};

const parsePivotIds = (record: Record<string, unknown>): string[] => {
  if (record.pivot_ids || record.pivotIds) return asArray(record.pivot_ids ?? record.pivotIds);
  const pivot = record.pivot;
  if (pivot && typeof pivot === "object") {
    const pivotRecord = pivot as Record<string, unknown>;
    return asArray(pivotRecord.line_id ?? pivotRecord.lineId);
  }
  return [];
};

export function parseBestChiasm(best: UiAnalyzeResponse["structure"]["best_chiasm"]): ChiasmParseResult {
  if (!best || typeof best !== "object") {
    return { layout: null, issues: ["best_chiasm missing or not an object"] };
  }

  const record = best as Record<string, unknown>;
  const issues: string[] = [];

  const { pairs, issues: pairIssues } = parsePairs(record.pairs);
  issues.push(...pairIssues.map((i) => `best_chiasm.${i}`));

  const pivotIds = parsePivotIds(record);
  if (!pivotIds.length) {
    issues.push("best_chiasm pivot line ids missing");
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

export function parseChiasmCandidates(
  candidates: UiAnalyzeResponse["structure"]["chiasm_candidates"]
): Array<ChiasmLayout & { id: string; rationale?: string; weaknesses?: string[] }> {
  if (!Array.isArray(candidates)) return [];
  const result: Array<ChiasmLayout & { id: string; rationale?: string; weaknesses?: string[] }> = [];

  candidates.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as unknown as Record<string, unknown>;
    const id = asString(record.id);
    const { pairs } = parsePairs(record.pairs);
    const pivotIds = parsePivotIds(record);
    if (!id || !pairs.length || !pivotIds.length) return;
    result.push({
      id,
      pairs,
      pivotIds,
      confidence: asString(record.confidence),
      rationale: asString(record.rationale),
      weaknesses: Array.isArray(record.weaknesses)
        ? (record.weaknesses.filter((w) => typeof w === "string") as string[])
        : undefined
    });
  });

  return result;
}
