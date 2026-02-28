import { useMemo, useRef, useState } from "react";
import type { UiAnalyzeResponse } from "../types/analyze";
import { parseBestChiasm } from "../lib/structureLayout";
import { toSvg } from "html-to-image";

const SNIPPET_LIMIT = 80;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type Selection = {
  pairIndex?: number;
  isPivot?: boolean;
};

export function ChiasmView({ data }: { data: UiAnalyzeResponse }) {
  const { structure } = data;
  const parsed = useMemo(() => parseBestChiasm(structure.best_chiasm), [structure.best_chiasm]);

  const [selection, setSelection] = useState<Selection>({});
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const lineText = useMemo(() => {
    const map = new Map<string, string>();
    structure.lines.forEach((line) => map.set(line.id, line.text));
    return map;
  }, [structure.lines]);

  const layout = parsed.layout;
  const showChiasm = structure.detected === "chiasm" && layout;

  const selectedPair = layout && selection.pairIndex !== undefined ? layout.pairs[selection.pairIndex] : null;
  const selectedLineIds = useMemo(() => {
    if (!layout) return new Set<string>();
    if (selection.isPivot) return new Set(layout.pivotIds);
    if (selectedPair) return new Set([...selectedPair.leftIds, ...selectedPair.rightIds]);
    return new Set<string>();
  }, [layout, selection.isPivot, selectedPair]);

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
    if (!exportRef.current) return;
    setExportError(null);
    try {
      const dataUrl = await toSvg(exportRef.current, { cacheBust: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "chiasm-diagram.svg";
      link.click();
    } catch (err: any) {
      setExportError(err?.message ?? "Failed to export SVG.");
    }
  };

  if (structure.detected !== "chiasm" || !structure.best_chiasm) {
    return <div className="text-sm text-gray-600">No chiasm detected for this passage.</div>;
  }

  if (!showChiasm) {
    return (
      <div className="text-sm text-gray-600">
        Chiasm data incomplete. {parsed.issues.length ? parsed.issues.join(" ") : ""}
      </div>
    );
  }

  const levels = layout.pairs;
  const pivotIds = layout.pivotIds;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {layout.confidence ? `Confidence: ${layout.confidence}` : "Chiastic structure"}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border px-3 py-1 text-sm"
        >
          Download SVG
        </button>
      </div>

      {exportError ? <div className="text-sm text-red-600">{exportError}</div> : null}

      <div ref={exportRef} className="rounded-xl border bg-white p-4 space-y-3">
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
            className="w-full max-w-2xl"
            style={{ opacity: selectedLineIds.size && !selection.isPivot ? 0.4 : 1 }}
          >
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

      <div className="rounded-xl border p-4 bg-white text-sm space-y-3">
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
