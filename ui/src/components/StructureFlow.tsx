import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import type { UiAnalyzeResponse } from "../types/analyze";
import "reactflow/dist/style.css";

const X_POSITION = 250;
const Y_SPACING = 120;
const SNIPPET_LIMIT = 80;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type StructureFlowProps = {
  data: UiAnalyzeResponse;
};

type ParallelGroup = UiAnalyzeResponse["structure"]["parallels"][number];

export function StructureFlow({ data }: StructureFlowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const nodes = useMemo<Node[]>(() => {
    return lines.map((line, idx) => {
      const isFrame = frameIds.has(line.id);
      const label = `${line.id}: ${truncate(line.text)}`;
      const isDimmed = selectedId ? !relatedNodeIds.has(line.id) : false;

      return {
        id: line.id,
        position: { x: X_POSITION, y: idx * Y_SPACING },
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
          opacity: isDimmed ? 0.3 : 1
        }
      };
    });
  }, [lines, frameIds, selectedId, relatedNodeIds]);

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
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          result.push({
            id: `par-${groupIdx}-${ids[i]}-${ids[j]}`,
            source: ids[i],
            target: ids[j],
            type: "straight",
            style: { stroke: "#3b82f6", strokeWidth: 1.5, strokeDasharray: "6 4" }
          });
          result.push({
            id: `par-${groupIdx}-${ids[j]}-${ids[i]}`,
            source: ids[j],
            target: ids[i],
            type: "straight",
            style: { stroke: "#3b82f6", strokeWidth: 1.5, strokeDasharray: "6 4" }
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
        label: "frame",
        style: { stroke: "#cfae2a", strokeWidth: 3 }
      });
    }

    if (selectedId) {
      return result.map((edge) => {
        const isActive = edge.source === selectedId || edge.target === selectedId;
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
  }, [lines, parallels, frame, selectedId, lineIdSet]);

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
      <div className="flex-1 rounded-xl border bg-white">
        <div className="h-[560px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => setSelectedId(node.id)}
          >
            <Background color="#e5e7eb" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <aside className="lg:w-80 rounded-xl border p-4 bg-white text-sm space-y-3">
        <div className="font-semibold">Selection</div>
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
