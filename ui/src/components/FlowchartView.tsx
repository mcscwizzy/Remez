import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import dagre from "dagre";
import type { UiAnalyzeResponse } from "../types/analyze";
import "reactflow/dist/style.css";
import { FlowchartNode } from "./nodes/FlowchartNode";

const SNIPPET_LIMIT = 80;
const NODE_WIDTH = 300;
const NODE_HEIGHT = 140;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type Block = {
  id: string;
  lineIds: string[];
  title: string;
  kind: "rect" | "diamond";
  anchorTypes: string[];
};

const isQuestion = (text: string) => /\b(how long|why|who|what|where|how)\b/.test(text);
const hasTurn = (text: string) => /\b(therefore|for this reason|nevertheless|but now|yet)\b/.test(text);

const pickTitle = (index: number, text: string) => {
  if (hasTurn(text)) return "Turn / Verdict";
  if (isQuestion(text)) return "Question";
  return `Block ${index + 1}`;
};

const layoutFlowchart = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 110,
    marginx: 20,
    marginy: 20
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const { x, y } = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 }
    };
  });
};

const buildLayoutEdges = (blocks: Block[], parallels: UiAnalyzeResponse["structure"]["parallels"]) => {
  const layoutEdges: Edge[] = [];
  for (let i = 0; i < blocks.length - 1; i += 1) {
    layoutEdges.push({
      id: `flow-${blocks[i].id}-${blocks[i + 1].id}`,
      source: blocks[i].id,
      target: blocks[i + 1].id
    });
  }

  parallels.forEach((group, idx) => {
    const ids = group.line_ids ?? [];
    const involved = blocks.filter((b) => b.lineIds.some((id) => ids.includes(id)));
    if (involved.length < 2) return;
    layoutEdges.push({
      id: `par-${idx}`,
      source: involved[0].id,
      target: involved[involved.length - 1].id
    });
  });

  return layoutEdges;
};

export function FlowchartView({ data }: { data: UiAnalyzeResponse }) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const lines = data.structure.lines;
  const parallels = data.structure.parallels;

  const blocks = useMemo<Block[]>(() => {
    if (!lines.length) return [];

    const blocks: Block[] = [];
    const groups = parallels
      .map((g, idx) => ({
        id: g.id ?? `P${idx + 1}`,
        lineIds: g.line_ids ?? [],
        anchor: g.anchor_type
      }))
      .filter((g) => g.lineIds.length > 0);

    let start = 0;
    while (start < lines.length) {
      let end = Math.min(start + 1, lines.length - 1);
      const lineId = lines[start].id;
      const group = groups.find((g) => g.lineIds.includes(lineId));
      if (group) {
        const indexes = group.lineIds
          .map((id) => lines.findIndex((l) => l.id === id))
          .filter((idx) => idx >= 0);
        if (indexes.length) {
          end = Math.max(...indexes);
        }
      }

      const rangeLines = lines.slice(start, end + 1);
      const text = rangeLines.map((l) => l.text).join(" ").toLowerCase();
      const title = pickTitle(blocks.length, text);
      const kind = hasTurn(text) || isQuestion(text) ? "diamond" : "rect";

      blocks.push({
        id: `block-${start}-${end}`,
        lineIds: rangeLines.map((l) => l.id),
        title,
        kind,
        anchorTypes: group?.anchor ? [group.anchor] : []
      });

      start = end + 1;
    }

    const merged: Block[] = [];
    for (const block of blocks) {
      const last = merged[merged.length - 1];
      if (last && last.lineIds.length < 2) {
        last.lineIds.push(...block.lineIds);
        last.anchorTypes = Array.from(new Set([...last.anchorTypes, ...block.anchorTypes]));
      } else {
        merged.push({ ...block });
      }
    }

    while (merged.length > 8) {
      let smallestIdx = 0;
      for (let i = 1; i < merged.length; i += 1) {
        if (merged[i].lineIds.length < merged[smallestIdx].lineIds.length) {
          smallestIdx = i;
        }
      }
      const mergeTarget = Math.min(smallestIdx, merged.length - 2);
      const left = merged[mergeTarget];
      const right = merged[mergeTarget + 1];
      const combined: Block = {
        id: `${left.id}-${right.id}`,
        lineIds: [...left.lineIds, ...right.lineIds],
        title: left.title,
        kind: left.kind,
        anchorTypes: Array.from(new Set([...left.anchorTypes, ...right.anchorTypes]))
      };
      merged.splice(mergeTarget, 2, combined);
    }

    return merged.map((block, idx) => ({
      ...block,
      title: block.title.startsWith("Block") ? `Block ${idx + 1}` : block.title
    }));
  }, [lines, parallels]);

  const edges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    for (let i = 0; i < blocks.length - 1; i += 1) {
      edges.push({
        id: `flow-${blocks[i].id}-${blocks[i + 1].id}`,
        source: blocks[i].id,
        target: blocks[i + 1].id,
        type: "smoothstep",
        style: { stroke: "#1f2937", strokeWidth: 2 }
      });
    }

    parallels.forEach((group, idx) => {
      const ids = group.line_ids ?? [];
      const involved = blocks.filter((b) => b.lineIds.some((id) => ids.includes(id)));
      if (involved.length < 2) return;
      edges.push({
        id: `par-${idx}`,
        source: involved[0].id,
        target: involved[involved.length - 1].id,
        type: "bezier",
        label: `${group.id ?? `P${idx + 1}`}${group.anchor_type ? ` (${group.anchor_type})` : ""}`,
        style: { stroke: "#5b2c2c", strokeWidth: 1.2, strokeDasharray: "6 4" },
        labelStyle: { fontSize: 10, fill: "#5b2c2c" }
      });
    });

    return edges;
  }, [blocks, parallels]);

  const nodes = useMemo<Node[]>(() => {
    const rawNodes = blocks.map((block, idx) => {
      const range = `${block.lineIds[0]}–${block.lineIds[block.lineIds.length - 1]}`;
      const excerpts = block.lineIds
        .map((id) => lines.find((l) => l.id === id)?.text || "")
        .filter(Boolean)
        .map((t) => truncate(t))
        .slice(0, 2);
      const excerptText = excerpts.join(" ");

      return {
        id: block.id,
        position: { x: 300, y: idx * 170 },
        data: { title: block.title, range, excerpt: excerptText, kind: block.kind },
        type: "flowchart",
        draggable: false,
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          opacity: selectedBlockId && selectedBlockId !== block.id ? 0.3 : 1
        }
      };
    });

    return layoutFlowchart(rawNodes, buildLayoutEdges(blocks, parallels));
  }, [blocks, lines, parallels, selectedBlockId]);

  const selectedBlock = useMemo(() => blocks.find((block) => block.id === selectedBlockId) ?? null, [blocks, selectedBlockId]);

  const selectedLines = useMemo(() => {
    if (!selectedBlock) return [];
    return selectedBlock.lineIds
      .map((id) => lines.find((line) => line.id === id))
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
  }, [lines, selectedBlock]);

  if (!lines.length) return <div className="text-sm text-gray-600">No structure data available.</div>;

  return (
    <div className="card card-edge p-4 flowchart-layout">
      <div className="flowchart-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => setSelectedBlockId(node.id)}
          nodeTypes={{ flowchart: FlowchartNode }}
        >
          <Background color="#e5e7eb" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="flowchart-panel">
        {!selectedBlock ? (
          <div className="flowchart-panel-empty">Select a block to view the full text and details.</div>
        ) : (
          <div className="flowchart-panel-content">
            <div className="flowchart-panel-title">{selectedBlock.title}</div>
            <div className="flowchart-panel-range">
              {selectedBlock.lineIds[0]}–{selectedBlock.lineIds[selectedBlock.lineIds.length - 1]}
            </div>
            {selectedBlock.anchorTypes.length > 0 && (
              <div className="flowchart-panel-anchors">Anchor: {selectedBlock.anchorTypes.join(", ")}</div>
            )}
            <div className="flowchart-panel-lines">
              {selectedLines.map((line) => (
                <div key={line.id} className="flowchart-panel-line">
                  <span className="flowchart-panel-line-id">{line.id}</span>
                  <span className="flowchart-panel-line-text">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
