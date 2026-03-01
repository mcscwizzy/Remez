import { useMemo, useRef, useState } from "react";
import type { UiAnalyzeResponse } from "../types/analyze";
import { parseBestChiasm, parseChiasmCandidates } from "../lib/structureLayout";
import { toPng } from "html-to-image";

const SNIPPET_LIMIT = 80;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type Selection = {
  pairIndex?: number;
  isPivot?: boolean;
};

const hasPivot = (pivotIds: string[]) => pivotIds.length > 0;

export function ChiasmView({ data }: { data: UiAnalyzeResponse }) {
  const { structure } = data;
  const parsed = useMemo(() => parseBestChiasm(structure.best_chiasm), [structure.best_chiasm]);
  const candidates = useMemo(() => parseChiasmCandidates(structure.chiasm_candidates), [structure.chiasm_candidates]);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection>({});
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const lineText = useMemo(() => {
    const map = new Map<string, string>();
    structure.lines.forEach((line) => map.set(line.id, line.text));
    return map;
  }, [structure.lines]);

  const layout = parsed.layout;
  const activeCandidate = useMemo(() => {
    if (!candidates.length) return null;
    if (!candidateId) return candidates[0];
    return candidates.find((c) => c.id === candidateId) ?? candidates[0];
  }, [candidates, candidateId]);

  const showDetectedChiasm = structure.detected === "chiasm" && layout;
  const showCandidate = !showDetectedChiasm && activeCandidate;

  const activeLayout = showDetectedChiasm ? layout : activeCandidate;
  const selectedPair = activeLayout && selection.pairIndex !== undefined ? activeLayout.pairs[selection.pairIndex] : null;
  const selectedLineIds = useMemo(() => {
    if (!activeLayout) return new Set<string>();
    if (selection.isPivot) return new Set(activeLayout.pivotIds);
    if (selectedPair) return new Set([...selectedPair.leftIds, ...selectedPair.rightIds]);
    return new Set<string>();
  }, [activeLayout, selection.isPivot, selectedPair]);

  const relatedParallels = useMemo(() => {
    if (!selectedPair) return [];
    const pairIds = new Set([...selectedPair.leftIds, ...selectedPair.rightIds]);
    return structure.parallels.filter((group) => (group.line_ids ?? []).some((id) => pairIds.has(id)));
  }, [selectedPair, structure.parallels]);

  const evidence = useMemo(() => {
    if (!selectedPair) return null;
    const anchorType = selectedPair.anchorType ?? relatedParallels[0]?.anchor_type;
    const evidenceList = selectedPair.evidence ?? relatedParallels[0]?.evidence ?? [];
    const why = selectedPair.why ?? relatedParallels[0]?.why;
    return { anchorType, evidenceList, why };
  }, [selectedPair, relatedParallels]);

  const handleExport = async () => {
    if (!exportRef.current) {
      setExportError("Rendered diagram not found.");
      window.alert("Rendered diagram not found.");
      return;
    }
    setExportError(null);
    try {
      const safeRef = data.reference ? data.reference.replace(/[^A-Za-z0-9]+/g, "_") : "visual";
      const filename = `remez-${safeRef}.png`;
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
    } catch (err: any) {
      setExportError(err?.message ?? "Failed to export PNG.");
    }
  };

  if (structure.detected !== "chiasm" || !structure.best_chiasm) {
    if (!(activeCandidate && hasPivot(activeCandidate.pivotIds))) {
      return (
        <div className="text-sm text-gray-600">
          No chiasm detected. This passage is structured as {structure.detected || "unknown"}.
        </div>
      );
    }
  }

  if (structure.detected === "chiasm" && (!showDetectedChiasm || !hasPivot(layout?.pivotIds ?? []))) {
    return <div className="text-sm text-gray-600">Chiasm data incomplete (missing pivot).</div>;
  }

  if (!activeLayout) {
    return <div className="text-sm text-gray-600">No chiasm detected. This passage is structured as {structure.detected || "unknown"}.</div>;
  }

  // Dev note: Genesis 9:6 should yield a low-confidence micro-chiasm candidate.
  // Philippians 2:6–11 should yield at least one candidate and may detect a full chiasm.

  const levels = activeLayout.pairs;
  const pivotIds = activeLayout.pivotIds;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {showDetectedChiasm
            ? layout?.confidence
              ? `Confidence: ${layout.confidence}`
              : "Chiastic structure"
            : `Possible chiasm candidate${activeCandidate?.confidence ? ` (${activeCandidate.confidence})` : ""}`}
        </div>
        <div className="flex items-center gap-2">
          {showCandidate && candidates.length > 1 ? (
            <select
              className="rounded-lg border border-[color:var(--color-border)] bg-white/70 px-2 py-1 text-sm"
              value={activeCandidate?.id}
              onChange={(e) => setCandidateId(e.target.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.id}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={handleExport}
            className="rounded-lg border border-[color:var(--color-border)] bg-white/70 px-3 py-1 text-sm"
          >
            Download PNG
          </button>
        </div>
      </div>

      {exportError ? <div className="text-sm text-red-600">{exportError}</div> : null}

      {showCandidate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Possible chiasm candidate (low confidence). Review anchors before treating as definitive.
          {activeCandidate?.weaknesses?.length ? (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {activeCandidate.weaknesses.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div ref={exportRef} className="card card-edge p-4 space-y-3">
        {levels.map((pair, idx) => {
          const indent = idx * 24;
          const isSelected = selection.pairIndex === idx;
          const isDimmed = selectedLineIds.size ? !isSelected : false;
          return (
            <div
              key={`pair-${idx}`}
              className="grid grid-cols-2 gap-4 items-stretch"
              style={{ paddingLeft: `${indent}px`, paddingRight: `${indent}px`, opacity: isDimmed ? 0.4 : 1 }}
            >
              <Cell
                ids={pair.leftIds}
                lineText={lineText}
                active={isSelected}
                onClick={() => setSelection({ pairIndex: idx })}
                highlightSet={selectedLineIds}
              />
              <Cell
                ids={pair.rightIds}
                lineText={lineText}
                active={isSelected}
                onClick={() => setSelection({ pairIndex: idx })}
                highlightSet={selectedLineIds}
              />
            </div>
          );
        })}

        <div className="flex justify-center">
          <div
            className="w-full max-w-2xl border border-amber-200 bg-amber-50/70 rounded-xl p-3"
            style={{ opacity: selectedLineIds.size && !selection.isPivot ? 0.4 : 1 }}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-amber-900/80 mb-2 text-center">
              Center / Pivot (main emphasis)
            </div>
            <Cell
              ids={pivotIds}
              lineText={lineText}
              active={Boolean(selection.isPivot)}
              onClick={() => setSelection({ isPivot: true })}
              highlightSet={selectedLineIds}
              center
            />
          </div>
        </div>
      </div>

      <div className="card card-edge p-4 text-sm space-y-3">
        <div className="font-semibold">Selection</div>
        {selectedPair ? (
          <div>
            <div className="text-gray-500 text-xs">Pair</div>
            <div className="mt-2 space-y-2">
              <LineList label="Left" ids={selectedPair.leftIds} lineText={lineText} />
              <LineList label="Right" ids={selectedPair.rightIds} lineText={lineText} />
            </div>
          </div>
        ) : selection.isPivot ? (
          <div>
            <div className="text-gray-500 text-xs">Pivot</div>
            <LineList label="Pivot" ids={pivotIds} lineText={lineText} />
          </div>
        ) : (
          <div className="text-gray-600">Select a pair or the pivot to see details.</div>
        )}

        {selectedPair ? (
          <div className="pt-2 border-t">
            <div className="font-semibold">Evidence</div>
            <div className="text-gray-600 text-xs mt-1">
              {evidence?.anchorType ? `Anchor: ${evidence.anchorType}` : "Anchor: —"}
            </div>
            {evidence?.evidenceList?.length ? (
              <ul className="mt-2 list-disc pl-5 text-gray-700">
                {evidence.evidenceList.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-600 mt-2">No evidence available.</div>
            )}
            {evidence?.why ? <div className="text-gray-700 mt-2">{evidence.why}</div> : null}
            {showCandidate && activeCandidate?.weaknesses?.length ? (
              <div className="mt-3">
                <div className="text-gray-500 text-xs">Weaknesses</div>
                <ul className="mt-1 list-disc pl-5 text-gray-700">
                  {activeCandidate.weaknesses.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type CellProps = {
  ids: string[];
  lineText: Map<string, string>;
  active: boolean;
  onClick: () => void;
  highlightSet: Set<string>;
  center?: boolean;
};

const Cell = ({ ids, lineText, active, onClick, highlightSet, center }: CellProps) => {
  const isHighlighted = ids.some((id) => highlightSet.has(id));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-3 py-2 space-y-1 ${
        active || isHighlighted ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"
      }`}
    >
      {ids.map((id) => (
        <div key={id} className={`text-xs ${center ? "text-center" : ""}`}>
          <div className="font-semibold">{id}</div>
          <div className="text-gray-600">{truncate(lineText.get(id) ?? "")}</div>
        </div>
      ))}
    </button>
  );
};

const LineList = ({ label, ids, lineText }: { label: string; ids: string[]; lineText: Map<string, string> }) => {
  return (
    <div>
      <div className="text-gray-500 text-xs">{label}</div>
      <div className="space-y-1 mt-1">
        {ids.map((id) => (
          <div key={id} className="rounded-md border p-2 text-gray-700">
            <div className="font-medium">{id}</div>
            <div className="text-xs text-gray-600">{lineText.get(id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
