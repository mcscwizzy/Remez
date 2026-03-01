import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import type { UiAnalyzeResponse } from "../types/analyze";
import "reactflow/dist/style.css";
import { FlowchartNode } from "./nodes/FlowchartNode";

const SNIPPET_LIMIT = 80;

const truncate = (value: string, limit = SNIPPET_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

type Block = {
  id: string;
  lineIds: string[];
  title: string;
  kind: "rect" | "diamond";
};

const isQuestion = (text: string) => /\b(how long|why|who|what|where|how)\b/.test(text);
const hasTurn = (text: string) => /\b(therefore|for this reason|nevertheless|but now|yet)\b/.test(text);
const hasAppeal = (text: string) => /\b(blessed|arise|judge|deliver|help)\b/.test(text);
const hasImperative = (text: string) => /\b(give|protect|deliver|save|help|arise|judge)\b/.test(text);

const pickTitle = (lines: string[], anchorType?: string) => {
  const text = lines.join(" ").toLowerCase();
  if (anchorType && ["lexical", "formula"].includes(anchorType)) return "Refrain / Formula";
  if (isQuestion(text)) return "Rhetorical Question";
  if (hasTurn(text)) return "Turn / Verdict";
  if (hasAppeal(text)) return "Appeal / Conclusion";
  if (hasImperative(text)) return "Commands";
  return "Statement";
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
      const excerpt = rangeLines.map((l) => truncate(l.text)).slice(0, 3);
      const title = pickTitle(rangeLines.map((l) => l.text), group?.anchor);
      const kind = isQuestion(rangeLines.map((l) => l.text).join(" ").toLowerCase()) || hasTurn(rangeLines.map((l) => l.text).join(" ").toLowerCase()) ? "diamond" : "rect";

      blocks.push({
        id: `block-${start}-${end}`,
        lineIds: rangeLines.map((l) => l.id),
        title,
        kind
      });

      start = end + 1;
    }

    // merge adjacent small blocks
    const merged: Block[] = [];
    for (const block of blocks) {
      const last = merged[merged.length - 1];
      if (last && last.lineIds.length < 2) {
        last.lineIds.push(...block.lineIds);
        last.title = last.title === "Statement" ? block.title : last.title;
      } else {
        merged.push({ ...block });
      }
    }
    return merged;
  }, [lines, parallels]);

  const nodes = useMemo<Node[]>(() => {
    return blocks.map((block, idx) => {
      const range = `${block.lineIds[0]}–${block.lineIds[block.lineIds.length - 1]}`;
      const excerpts = block.lineIds
        .map((id) => lines.find((l) => l.id === id)?.text || "")
        .filter(Boolean)
        .map((t) => truncate(t))
        .slice(0, 3);

      return {
        id: block.id,
        position: { x: 300, y: idx * 170 },
        data: { title: block.title, range, excerpts, kind: block.kind },
        type: "flowchart",
        draggable: false,
        style: {
          width: 320,
          opacity: selectedBlockId && selectedBlockId !== block.id ? 0.3 : 1
        }
      };
    });
  }, [blocks, lines, selectedBlockId]);

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
        label: `${group.id ?? `P${idx + 1}`} (${group.anchor_type ?? "parallel"})`,
        style: { stroke: "#5b2c2c", strokeWidth: 1.2, strokeDasharray: "6 4" }
      });
    });

    return edges;
  }, [blocks, parallels]);

  if (!lines.length) return <div className="text-sm text-gray-600">No structure data available.</div>;

  return (
    <div className="card card-edge p-4">
      <div className="h-[640px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => setSelectedBlockId(node.id)}
          nodeTypes={{ flowchart: FlowchartNode }}
        >
          <Background color="#e5e7eb" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
