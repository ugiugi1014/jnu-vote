// 플로우차트: 이번 단계에 관여하는 노드만 밝게, 데이터가 오가는 연결에는 점이 이동한다
import { useMemo } from "react";
import { ReactFlow, Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const NODE_INFO = {
  student: { title: "학생 브라우저", sub: "secret · 투표 증명 생성" },
  server: { title: "서버", sub: "재학 확인 · relay · 개표" },
  chain: { title: "블록체인", sub: "명단 · 암호문 · 증명 검증" },
};

function ActorNode({ data }) {
  return (
    <div className={`hiw-node ${data.active ? "active" : ""}`}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Bottom} id="bt" />
      <div className="hiw-node-title">{data.title}</div>
      <div className="hiw-node-sub">{data.sub}</div>
    </div>
  );
}

function PacketEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} className={data.active ? "hiw-edge active" : "hiw-edge"} />
      {data.active && (
        <circle r="6" className="hiw-packet">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {data.active && data.label && (
        <EdgeLabelRenderer>
          <div className="hiw-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { actor: ActorNode };
const edgeTypes = { packet: PacketEdge };

const BASE_EDGES = [
  { id: "student-server", source: "student", target: "server", sourceHandle: "r", targetHandle: "l" },
  { id: "server-chain", source: "server", target: "chain", sourceHandle: "r", targetHandle: "l" },
  { id: "chain-student", source: "chain", target: "student", sourceHandle: "b", targetHandle: "bt" },
];

export default function FlowDiagram({ step }) {
  const nodes = useMemo(() => [
    { id: "student", position: { x: 0, y: 120 } },
    { id: "server", position: { x: 340, y: 0 } },
    { id: "chain", position: { x: 680, y: 120 } },
  ].map((n) => ({
    ...n, type: "actor", draggable: false, selectable: false,
    data: { ...NODE_INFO[n.id], active: step.nodes.includes(n.id) },
  })), [step]);

  const edges = useMemo(() => BASE_EDGES.map((e) => {
    const on = step.edges.find((x) => x.id === e.id);
    return { ...e, type: "packet", data: { active: !!on, label: on?.label } };
  }), [step]);

  return (
    <div className="hiw-flow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.05 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
