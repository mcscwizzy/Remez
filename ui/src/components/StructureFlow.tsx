import { useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import type { UiAnalyzeResponse } from "../types/analyze";
import "reactflow/dist/style.css";
import { toPng } from "html-to-image";
import { ParallelLaneEdge } from "./edges/ParallelLaneEdge";

const X_POSITION = 250;
const Y_SPACING = 120;
const LINE_Y_OFFSET = 160;
const SNIPPET_LIMIT = 80;
const NODE_WIDTH = 320;
const NODE_HEIGHT = 74;
const SUMMARY_Y = 0;
const SUMMARY_X = [100, 320, 540, 760];
const LANE_OFFSET = 140;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type StructureFlowProps = {
  data: UiAnalyzeResponse;
};

type ParallelGroup = UiAnalyzeResponse["structure"]["parallels"][number];
type SummaryKey = "premise" | "threat" | "rescue" | "result";

export function StructureFlow({ data }: StructureFlowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<SummaryKey | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const structure = data.structure;
  const lines = structure?.lines ?? [];
  const parallels = structure?.parallels ?? [];
  const frame = structure?.frame ?? null;

  const frameIds = useMemo(() => {
    if (!frame) return new Set<string>();
    return new Set([frame.left_id, frame.right_id]);
  }, [frame]);

  const lineIdSet = useMemo(() => new Set(lines.map((line) => line.id)), [lines]);

  const parallelLookup = useMemo(() => {
    const map = new Map<string, ParallelGroup[]>();
    parallels.forEach((group) => {
      (group.line_ids ?? []).forEach((id) => {
        const list = map.get(id) ?? [];
        list.push(group);
        map.set(id, list);
      });
    });
    return map;
  }, [parallels]);

  const relatedNodeIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const related = new Set<string>([selectedId]);
    const groups = parallelLookup.get(selectedId) ?? [];
    groups.forEach((group) => {
      (group.line_ids ?? []).forEach((id) => related.add(id));
    });
    return related;
  }, [selectedId, parallelLookup]);

  const summaryMap = useMemo<{
    premise: string[];
    threat: string[];
    rescue: string[];
    result: string[];
    lineText: Map<string, string>;
    labels: Record<SummaryKey, string>;
  }>(() => {
    const lineText = new Map(lines.map((line) => [line.id, line.text]));
    const threatWords = [
      "flood",
      "torrent",
      "raging",
      "swallow",
      "swallowed",
      "teeth",
      "enemy",
      "enemies",
      "death",
      "fear",
      "snare",
      "overwhelmed",
      "waters"
    ];
    const praiseWords = ["blessed", "praise", "thanks", "hallelujah"];
    const deliveranceWords = ["escaped", "delivered", "saved", "rescued", "broke", "broken", "help"];
    const confessionWords = [
      "our help is",
      "in the name of",
      "maker of heaven",
      "maker of earth",
      "the lord is"
    ];
    const questionWords = [
      "why",
      "how long",
      "what will you give me",
      "i have no",
      "lament",
      "tears"
    ];
    const promiseWords = ["shall", "will", "i will", "covenant", "offspring", "bless", "promise"];

    const countMatches = (text: string, keywords: string[]) =>
      keywords.reduce((sum, word) => (text.includes(word) ? sum + 1 : sum), 0);

    const scored = lines.map((line) => {
      const text = line.text.toLowerCase();
      return {
        id: line.id,
        threat: countMatches(text, threatWords),
        rescue: countMatches(text, deliveranceWords),
        praise: countMatches(text, praiseWords),
        confession: countMatches(text, confessionWords),
        question: countMatches(text, questionWords),
        promise: countMatches(text, promiseWords),
        opening: text.includes("song of") || text.includes("let israel say")
      };
    });

    const premise = new Set<string>();
    const threat = new Set<string>();
    const rescue = new Set<string>();
    const result = new Set<string>();

    if (lines[0]) premise.add(lines[0].id);
    if (lines[1]) premise.add(lines[1].id);
    if (frame?.left_id) premise.add(frame.left_id);

    if (lines.length >= 2) {
      result.add(lines[lines.length - 1].id);
      result.add(lines[Math.max(0, lines.length - 2)].id);
    }
    if (frame?.right_id) result.add(frame.right_id);

    scored.forEach((item) => {
      if (item.threat) threat.add(item.id);
      if (item.rescue) rescue.add(item.id);
    });

    const addFromParallels = (target: Set<string>, keywords: string[]) => {
      parallels.forEach((group) => {
        const why = (group.why ?? "").toLowerCase();
        const evidence = (group.evidence ?? []).join(" ").toLowerCase();
        if (keywords.some((w) => why.includes(w) || evidence.includes(w))) {
          (group.line_ids ?? []).forEach((id) => target.add(id));
        }
      });
    };

    addFromParallels(threat, threatWords);
    addFromParallels(rescue, deliveranceWords);

    if (!threat.size && lines.length) {
      const midStart = Math.floor(lines.length / 3);
      const midEnd = Math.floor((lines.length * 2) / 3);
      lines.slice(midStart, Math.max(midStart + 1, midEnd)).forEach((line) => threat.add(line.id));
    }

    if (!rescue.size && parallels.length) {
      const lastGroup = [...parallels].reverse().find((g) => (g.line_ids ?? []).length >= 3);
      if (lastGroup) (lastGroup.line_ids ?? []).forEach((id) => rescue.add(id));
    }

    const labelFor = (key: SummaryKey) => {
      const ids =
        key === "premise" ? premise : key === "threat" ? threat : key === "rescue" ? rescue : result;
      const texts = Array.from(ids)
        .map((id) => (lineText.get(id) ?? "").toLowerCase())
        .join(" ");
      const scores = {
        threat: countMatches(texts, threatWords),
        rescue: countMatches(texts, deliveranceWords),
        praise: countMatches(texts, praiseWords),
        confession: countMatches(texts, confessionWords),
        question: countMatches(texts, questionWords),
        promise: countMatches(texts, promiseWords),
        opening: texts.includes("song of") || texts.includes("let israel say")
      };

      if (key === "premise") {
        if (scores.opening) return "Opening";
        if (texts.includes("let israel say")) return "Communal Confession";
        return "Setup";
      }
      if (key === "threat") {
        if (scores.threat >= 1) return "Peril Imagery";
        if (scores.question >= 1) return "Complaint / Question";
        return "Tension";
      }
      if (key === "rescue") {
        if (scores.promise >= 1) return "Promise";
        if (scores.rescue >= 1) return "Deliverance";
        return "Turn";
      }
      if (key === "result") {
        if (scores.confession >= 1) return "Confession";
        if (scores.praise >= 1) return "Praise";
        if (texts.includes("believed")) return "Faith Response";
        return "Resolution";
      }
      return "Resolution";
    };

    return {
      premise: Array.from(premise).filter((id) => lineText.has(id)),
      threat: Array.from(threat).filter((id) => lineText.has(id)),
      rescue: Array.from(rescue).filter((id) => lineText.has(id)),
      result: Array.from(result).filter((id) => lineText.has(id)),
      lineText,
      labels: {
        premise: labelFor("premise"),
        threat: labelFor("threat"),
        rescue: labelFor("rescue"),
        result: labelFor("result")
      }
    };
  }, [lines, frame, parallels]);

  const highlightedNodeIds = useMemo(() => {
    if (selectedSummary) {
      return new Set(summaryMap[selectedSummary]);
    }
    if (selectedId) {
      return relatedNodeIds;
    }
    return new Set<string>();
  }, [selectedSummary, summaryMap, selectedId, relatedNodeIds]);

  const baseNodes = useMemo<Node[]>(() => {
    return lines.map((line, idx) => {
      const isFrame = frameIds.has(line.id);
      const label = `${line.id}: ${truncate(line.text)}`;
      const isDimmed = highlightedNodeIds.size ? !highlightedNodeIds.has(line.id) : false;

      return {
        id: line.id,
        position: { x: X_POSITION, y: LINE_Y_OFFSET + idx * Y_SPACING },
        data: {
          label: (
            <div title={line.text} className="text-xs leading-snug">
              {label}
            </div>
          )
        },
        style: {
          border: `2px solid ${isFrame ? "#cfae2a" : "#e5e7eb"}`,
          background: "#ffffff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          padding: "10px 12px",
          borderRadius: "10px",
          opacity: isDimmed ? 0.3 : 1,
          width: NODE_WIDTH
        },
        draggable: false
      };
    });
  }, [lines, frameIds, highlightedNodeIds]);

  const summaryNodes = useMemo<Node[]>(() => {
      const labels: Array<{ key: SummaryKey; title: string }> = [
        { key: "premise", title: summaryMap.labels.premise },
        { key: "threat", title: summaryMap.labels.threat },
        { key: "rescue", title: summaryMap.labels.rescue },
        { key: "result", title: summaryMap.labels.result }
      ];
    return labels.map((item, idx) => {
      const ids = summaryMap[item.key];
      const subtext = ids.length ? ids.join(", ") : "—";
      const isDimmed = highlightedNodeIds.size ? !ids.some((id) => highlightedNodeIds.has(id)) : false;
      return {
        id: `summary-${item.key}`,
        position: { x: SUMMARY_X[idx], y: SUMMARY_Y },
        data: {
          label: (
            <div className="summary-node" title={ids.map((id) => summaryMap.lineText.get(id)).join("\n")}>
              <div className="summary-node-title">{item.title}</div>
              <div className="summary-node-subtext">{subtext}</div>
            </div>
          )
        },
        style: {
          width: 170,
          opacity: isDimmed ? 0.4 : 1
        },
        draggable: false
      };
    });
  }, [summaryMap, highlightedNodeIds]);

  const nodes = useMemo<Node[]>(() => {
    return [...summaryNodes, ...baseNodes];
  }, [summaryNodes, baseNodes]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    for (let i = 0; i < lines.length - 1; i += 1) {
      const source = lines[i];
      const target = lines[i + 1];
      result.push({
        id: `seq-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        type: "smoothstep",
        style: { stroke: "#1f2937", strokeWidth: 2 }
      });
    }

    parallels.forEach((group, groupIdx) => {
      const ids = (group.line_ids ?? []).filter((id) => lineIdSet.has(id));
      if (ids.length === 2) {
        result.push({
          id: `par-${groupIdx}-${ids[0]}-${ids[1]}`,
          source: ids[0],
          target: ids[1],
          type: "smoothstep",
          label: `${group.id ?? `P${groupIdx + 1}`} • ${group.anchor_type ?? "parallel"}`,
          style: { stroke: "#3b82f6", strokeWidth: 1.25, strokeDasharray: "6 4" }
        });
        return;
      }
      if (ids.length >= 3) {
        const offset = (groupIdx % 2 === 0 ? -1 : 1) * LANE_OFFSET;
        for (let i = 0; i < ids.length - 1; i += 1) {
          result.push({
            id: `lane-${groupIdx}-${ids[i]}-${ids[i + 1]}`,
            source: ids[i],
            target: ids[i + 1],
            type: "parallelLane",
            data: { xOffset: offset },
            label: i === 0 ? `${group.id ?? `P${groupIdx + 1}`} • ${group.anchor_type ?? "parallel"}` : undefined,
            style: { stroke: "#5b2c2c", strokeWidth: 1.1, strokeDasharray: "4 4" }
          });
        }
      }
    });

    if (frame && lineIdSet.has(frame.left_id) && lineIdSet.has(frame.right_id)) {
      result.push({
        id: `frame-${frame.left_id}-${frame.right_id}`,
        source: frame.left_id,
        target: frame.right_id,
        type: "smoothstep",
        label: "Inclusio / Frame",
        style: { stroke: "#cfae2a", strokeWidth: 3 }
      });
    }

    if (selectedId || selectedSummary) {
      return result.map((edge) => {
        const isActive =
          (selectedId && (edge.source === selectedId || edge.target === selectedId)) ||
          (selectedSummary &&
            highlightedNodeIds.has(edge.source) &&
            highlightedNodeIds.has(edge.target));
        return {
          ...edge,
          style: {
            ...(edge.style ?? {}),
            opacity: isActive ? 1 : 0.2
          }
        };
      });
    }

    return result;
  }, [lines, parallels, frame, selectedId, selectedSummary, lineIdSet, highlightedNodeIds]);

  const selectedLine = useMemo(() => lines.find((line) => line.id === selectedId) ?? null, [lines, selectedId]);
  const selectedParallels = useMemo(
    () => (selectedId ? parallelLookup.get(selectedId) ?? [] : []),
    [parallelLookup, selectedId]
  );

  if (!lines.length) {
    return <div className="text-sm text-gray-600">No structure data available.</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 card card-edge">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--color-border)]">
          <div className="text-sm text-gray-600">Structure View</div>
          <button
            type="button"
            onClick={async () => {
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
            }}
            className="rounded-lg border border-[color:var(--color-border)] bg-white/70 px-3 py-1 text-sm"
          >
            Download PNG
          </button>
        </div>
        {exportError ? <div className="px-4 py-2 text-sm text-red-600">{exportError}</div> : null}
        <div ref={exportRef} className="h-[680px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              if (node.id.startsWith("summary-")) {
                setSelectedSummary(node.id.replace("summary-", "") as SummaryKey);
                setSelectedId(null);
                return;
              }
              setSelectedSummary(null);
              setSelectedId(node.id);
            }}
            edgeTypes={{ parallelLane: ParallelLaneEdge }}
          >
            <Background color="#e5e7eb" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <aside className="lg:w-80 rounded-xl border p-4 bg-white text-sm space-y-3">
        <div className="font-semibold">Selection</div>
        <div className="pt-2 border-t">
          <div className="font-semibold">Narrative Lane</div>
          {selectedSummary ? (
            <div className="mt-2 space-y-2">
              {summaryMap[selectedSummary].map((id) => (
                <div key={id} className="rounded-md border p-2 text-gray-700">
                  <div className="font-medium">{id}</div>
                  <div className="text-xs text-gray-600">{summaryMap.lineText.get(id)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-600 mt-2">Click a narrative lane node to see mapped lines.</div>
          )}
        </div>
        {selectedLine ? (
          <>
            <div>
              <div className="text-gray-500 text-xs">Line</div>
              <div className="font-medium">{selectedLine.id}</div>
              <div className="mt-1 text-gray-700">{selectedLine.text}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Parallels</div>
              {selectedParallels.length ? (
                <div className="space-y-2">
                  {selectedParallels.map((group) => (
                    <div key={group.id} className="rounded-lg border p-2">
                      <div className="font-medium">{group.id}</div>
                      {group.line_ids?.length ? (
                        <div className="text-gray-600 text-xs">Lines: {group.line_ids.join(", ")}</div>
                      ) : null}
                      {group.why ? <div className="text-gray-700 mt-1">{group.why}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-600">No parallel notes.</div>
              )}
            </div>
          </>
        ) : (
          <div className="text-gray-600">Click a node to inspect its details.</div>
        )}
      </aside>
    </div>
  );
}
