import { useEffect, useMemo, useState } from "react";
import mermaid from "mermaid";
import type { UiAnalyzeResponse, UiStructureFrame } from "../types/analyze";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  flowchart: { htmlLabels: false }
});

type MermaidResult = {
  svg: string;
  error?: string;
  source: string;
};

const SNIPPET_LIMIT = 80;

const escapeMermaidLabel = (value: string): string => {
  // Mermaid labels are quoted, so we must escape quotes and collapse newlines.
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
};

const snippet = (value: string, limit = SNIPPET_LIMIT): string => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

const buildLineLabel = (id: string, text: string): string => {
  const clean = escapeMermaidLabel(snippet(text));
  return `${id}: ${clean}`;
};

const buildFlowGraph = (lines: Array<{ id: string; text: string }>): string => {
  const nodes = lines
    .map((line) => `  ${line.id}["${buildLineLabel(line.id, line.text)}"]`)
    .join("\n");

  const edges = lines
    .map((line, idx) => {
      if (idx === lines.length - 1) return null;
      const next = lines[idx + 1];
      return `  ${line.id} --> ${next.id}`;
    })
    .filter(Boolean)
    .join("\n");

  return `flowchart TD\n${nodes}\n${edges}`.trim();
};

const buildParallelGraph = (lines: Array<{ id: string; text: string }>, parallels: UiAnalyzeResponse["structure"]["parallels"]): string => {
  const nodes = lines
    .map((line) => `  ${line.id}["${buildLineLabel(line.id, line.text)}"]`)
    .join("\n");

  const edgeLines: string[] = [];
  parallels.forEach((group) => {
    const ids = group.line_ids ?? [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        edgeLines.push(`  ${ids[i]} -.-> ${ids[j]}`);
        edgeLines.push(`  ${ids[j]} -.-> ${ids[i]}`);
      }
    }
  });

  return `flowchart TD\n${nodes}\n${edgeLines.join("\n")}`.trim();
};

const buildFrameGraph = (
  lines: Array<{ id: string; text: string }>,
  frame?: UiStructureFrame | null
): string => {
  const nodes = lines
    .map((line) => `  ${line.id}["${buildLineLabel(line.id, line.text)}"]`)
    .join("\n");

  if (!frame) {
    return `flowchart TD\n${nodes}`.trim();
  }

  const edge = `  ${frame.left_id} ---|frame| ${frame.right_id}`;
  return `flowchart TD\n${nodes}\n${edge}`.trim();
};

const MermaidDiagram = ({ title, source }: { title: string; source: string }) => {
  const [result, setResult] = useState<MermaidResult>({ svg: "", source });

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const { svg } = await mermaid.render(`m-${Math.random().toString(36).slice(2)}`, source);
        if (!cancelled) {
          setResult({ svg, source });
        }
      } catch (err: any) {
        if (!cancelled) {
          setResult({ svg: "", error: err?.message ?? "Failed to render Mermaid diagram.", source });
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="font-semibold">{title}</div>
      {result.error ? (
        <div className="space-y-2">
          <div className="text-sm text-red-600">{result.error}</div>
          <pre className="text-xs rounded-lg border p-3 overflow-auto bg-gray-50">{result.source}</pre>
        </div>
      ) : (
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: result.svg }} />
      )}
    </div>
  );
};

export function VisualPanel({ data }: { data: UiAnalyzeResponse }) {
  const structure = data.structure;

  const lines = useMemo(() => structure.lines ?? [], [structure.lines]);
  const parallels = useMemo(() => structure.parallels ?? [], [structure.parallels]);

  if (!lines.length) {
    return <div className="text-sm text-gray-600">No structure data available.</div>;
  }

  const flowGraph = buildFlowGraph(lines);
  const parallelGraph = buildParallelGraph(lines, parallels);
  const frameGraph = buildFrameGraph(lines, structure.frame ?? null);

  return (
    <div className="space-y-4">
      <MermaidDiagram title="Narrative Flow" source={flowGraph} />

      {parallels.length ? (
        <MermaidDiagram title="Parallelism Map" source={parallelGraph} />
      ) : (
        <div className="rounded-xl border p-4 text-sm text-gray-600">No parallels detected.</div>
      )}

      {structure.frame ? (
        <MermaidDiagram title="Frame Map" source={frameGraph} />
      ) : (
        <div className="rounded-xl border p-4 text-sm text-gray-600">No frame detected.</div>
      )}
    </div>
  );
}
