import { getBezierPath, type EdgeProps } from "reactflow";

type LaneEdgeData = {
  xOffset?: number;
};

export function ParallelLaneEdge(props: EdgeProps<LaneEdgeData>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style } = props;
  const offset = data?.xOffset ?? 0;

  const [edgePath] = getBezierPath({
    sourceX: sourceX + offset,
    sourceY,
    sourcePosition,
    targetX: targetX + offset,
    targetY,
    targetPosition
  });

  return (
    <path
      id={props.id}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
      style={style}
    />
  );
}
