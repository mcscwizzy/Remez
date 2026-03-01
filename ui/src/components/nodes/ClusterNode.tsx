type ClusterNodeData = {
  label: string;
  summary?: string;
};

export function ClusterNode({ data }: { data: ClusterNodeData }) {
  return (
    <div className="cluster-node">
      <div className="cluster-node-label">{data.label}</div>
      {data.summary ? <div className="cluster-node-summary">{data.summary}</div> : null}
    </div>
  );
}
