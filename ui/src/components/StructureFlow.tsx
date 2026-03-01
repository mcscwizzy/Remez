import { useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import type { UiAnalyzeResponse } from "../types/analyze";
import "reactflow/dist/style.css";
import { toPng } from "html-to-image";
import { ClusterNode } from "./nodes/ClusterNode";

const X_POSITION = 250;
const Y_SPACING = 120;
const SNIPPET_LIMIT = 80;
const NODE_WIDTH = 320;
const NODE_HEIGHT = 74;
const CLUSTER_PADDING = 26;

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
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
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

  const clusterGroups = useMemo(() => {
    return parallels
      .map((group, idx) => ({
        id: group.id ?? `P${idx + 1}`,
        anchor: group.anchor_type ?? "parallel",
        why: group.why,
        lineIds: (group.line_ids ?? []).filter((id) => lineIdSet.has(id))
      }))
      .filter((group) => group.lineIds.length >= 3);
  }, [parallels, lineIdSet]);

  const clusterLookup = useMemo(() => {
    const map = new Map<string, string[]>();
    clusterGroups.forEach((group) => {
      group.lineIds.forEach((lineId) => {
        const list = map.get(lineId) ?? [];
        list.push(group.id);
        map.set(lineId, list);
      });
    });
    return map;
  }, [clusterGroups]);

  const highlightedClusterIds = useMemo(() => {
    if (selectedClusterId) return new Set([selectedClusterId]);
    if (!selectedId) return new Set<string>();
    const ids = clusterLookup.get(selectedId) ?? [];
    return new Set(ids);
  }, [selectedClusterId, selectedId, clusterLookup]);

  const highlightedNodeIds = useMemo(() => {
    if (selectedClusterId) {
      const group = clusterGroups.find((g) => g.id === selectedClusterId);
      return new Set(group ? group.lineIds : []);
    }
    if (selectedId) {
      return relatedNodeIds;
    }
    return new Set<string>();
  }, [selectedClusterId, selectedId, clusterGroups, relatedNodeIds]);

  const baseNodes = useMemo<Node[]>(() => {
    return lines.map((line, idx) => {
      const isFrame = frameIds.has(line.id);
      const label = `${line.id}: ${truncate(line.text)}`;
      const isDimmed = highlightedNodeIds.size ? !highlightedNodeIds.has(line.id) : false;

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
          opacity: isDimmed ? 0.3 : 1,
          width: NODE_WIDTH
        },
        draggable: false
      };
    });
  }, [lines, frameIds, highlightedNodeIds]);

  const clusterNodes = useMemo<Node[]>(() => {
    if (!clusterGroups.length) return [];
    return clusterGroups.map((group) => {
      const members = group.lineIds
        .map((id) => baseNodes.find((node) => node.id === id))
        .filter((node): node is Node => Boolean(node));
      if (!members.length) {
        return {
          id: `cluster-${group.id}`,
          type: "cluster",
          position: { x: X_POSITION - CLUSTER_PADDING, y: 0 },
          data: { label: `${group.id} • ${group.anchor}` },
          style: { width: NODE_WIDTH + CLUSTER_PADDING * 2, height: NODE_HEIGHT },
          draggable: false
        };
      }

      const minY = Math.min(...members.map((node) => node.position.y));
      const maxY = Math.max(...members.map((node) => node.position.y));
      const minX = X_POSITION;
      const height = maxY - minY + NODE_HEIGHT + CLUSTER_PADDING * 2;
      const width = NODE_WIDTH + CLUSTER_PADDING * 2;
      const isDimmed =
        selectedId || selectedClusterId
          ? !highlightedClusterIds.has(group.id) && selectedClusterId !== group.id
            ? true
            : false
          : false;

      return {
        id: `cluster-${group.id}`,
        type: "cluster",
        position: { x: minX - CLUSTER_PADDING, y: minY - CLUSTER_PADDING },
        data: {
          label: `${group.id} • ${group.anchor}`,
          summary: group.why ? truncate(group.why, 90) : undefined
        },
        style: {
          width,
          height,
          opacity: isDimmed ? 0.3 : 1,
          zIndex: 0
        },
        draggable: false,
        selectable: true
      };
    });
  }, [clusterGroups, baseNodes, selectedId, selectedClusterId, highlightedClusterIds]);

  const nodes = useMemo<Node[]>(() => {
    return [...clusterNodes, ...baseNodes.map((node) => ({ ...node, zIndex: 1 }))];
  }, [clusterNodes, baseNodes]);

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
      if (ids.length !== 2) return;
      result.push({
        id: `par-${groupIdx}-${ids[0]}-${ids[1]}`,
        source: ids[0],
        target: ids[1],
        type: "straight",
        style: { stroke: "#3b82f6", strokeWidth: 1.5, strokeDasharray: "6 4" }
      });
      result.push({
        id: `par-${groupIdx}-${ids[1]}-${ids[0]}`,
        source: ids[1],
        target: ids[0],
        type: "straight",
        style: { stroke: "#3b82f6", strokeWidth: 1.5, strokeDasharray: "6 4" }
      });
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

    if (selectedId || selectedClusterId) {
      return result.map((edge) => {
        const isActive =
          (selectedId && (edge.source === selectedId || edge.target === selectedId)) ||
          (selectedClusterId &&
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
  }, [lines, parallels, frame, selectedId, selectedClusterId, lineIdSet, highlightedNodeIds]);

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
        <div ref={exportRef} className="h-[560px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              if (node.type === "cluster") {
                setSelectedClusterId(node.id.replace("cluster-", ""));
                setSelectedId(null);
              } else {
                setSelectedClusterId(null);
                setSelectedId(node.id);
              }
            }}
            nodeTypes={{ cluster: ClusterNode }}
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
