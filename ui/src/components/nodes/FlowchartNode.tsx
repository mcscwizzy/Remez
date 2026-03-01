type FlowchartNodeData = {
  title: string;
  range: string;
  excerpt: string;
  kind: "rect" | "diamond";
};

export function FlowchartNode({ data }: { data: FlowchartNodeData }) {
  const classes = data.kind === "diamond" ? "flowchart-node flowchart-node-diamond" : "flowchart-node";
  return (
    <div className={classes}>
      <div className="flowchart-node-title">{data.title}</div>
      <div className="flowchart-node-range">{data.range}</div>
      <div className="flowchart-node-excerpt">{data.excerpt}</div>
    </div>
  );
}
