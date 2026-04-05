/**
 * Node-based color grading graph using React Flow.
 *
 * Features:
 * - Fixed Input/Output terminal nodes (non-deletable)
 * - All grading nodes have both input and output handles
 * - User can connect/reconnect nodes by dragging edges
 * - Edge connections determine processing order
 */

import type { ColorGradingNode as CGNode } from "@tooscut/render-engine";
import type { Node, NodeProps, Edge, Connection, OnConnect } from "@xyflow/react";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useCallback, useMemo, useEffect, useRef, memo } from "react";

import { cn } from "../../../lib/utils";

// ============================================================================
// Constants
// ============================================================================

const NODE_WIDTH = 160;
const NODE_GAP = 60;
const INPUT_NODE_ID = "__input__";
const OUTPUT_NODE_ID = "__output__";

// ============================================================================
// Types
// ============================================================================

interface GradingNodeData extends Record<string, unknown> {
  node: CGNode;
  onToggleEnabled: (enabled: boolean) => void;
  onRemove: () => void;
  onSelect: () => void;
  isSelected: boolean;
}

interface TerminalNodeData extends Record<string, unknown> {
  label: string;
  type: "input" | "output";
}

type GradingFlowNode = Node<GradingNodeData, "colorGrading">;
type TerminalFlowNode = Node<TerminalNodeData, "terminal">;
type AnyFlowNode = GradingFlowNode | TerminalFlowNode;

// ============================================================================
// Node Preview / Theme / Label helpers
// ============================================================================

function getNodePreview(node: CGNode): string {
  switch (node.type) {
    case "Primary": {
      const c = node.correction;
      const parts: string[] = [];
      if (c.exposure !== 0) parts.push(`Exp ${c.exposure > 0 ? "+" : ""}${c.exposure.toFixed(1)}`);
      if (c.temperature !== 0) parts.push(`Temp ${c.temperature > 0 ? "+" : ""}${c.temperature}`);
      if (c.saturation !== 1) parts.push(`Sat ${Math.round(c.saturation * 100)}%`);
      return parts.length > 0 ? parts.slice(0, 2).join(" · ") : "Default";
    }
    case "ColorWheels": {
      const w = node.wheels;
      const hasLift = w.lift.distance > 0.01 || Math.abs(w.lift_luminance) > 0.01;
      const hasGamma = w.gamma.distance > 0.01 || Math.abs(w.gamma_luminance) > 0.01;
      const hasGain = w.gain.distance > 0.01 || Math.abs(w.gain_luminance) > 0.01;
      const active = [hasLift && "L", hasGamma && "G", hasGain && "Gn"].filter(Boolean);
      return active.length > 0 ? active.join(" · ") : "Default";
    }
    case "Curves": {
      const cu = node.curves;
      const isIdentity = (c: { points: { x: number; y: number }[] }) =>
        c.points.every((p) => Math.abs(p.x - p.y) < 0.01);
      const totalPts =
        cu.master.points.length +
        cu.red.points.length +
        cu.green.points.length +
        cu.blue.points.length;
      const allIdentity =
        isIdentity(cu.master) && isIdentity(cu.red) && isIdentity(cu.green) && isIdentity(cu.blue);
      return allIdentity ? "Identity" : `${totalPts} pts`;
    }
    case "Lut":
      return node.lut.lut_id || "No LUT";
    case "Qualifier":
      return "HSL Key";
    case "ColorSpaceTransform":
      return `${node.from_space} → ${node.to_space}`;
    default:
      return "Unknown";
  }
}

function getNodeTheme(type: CGNode["type"]): { bg: string; border: string; accent: string } {
  switch (type) {
    case "Primary":
      return { bg: "bg-orange-950/50", border: "border-orange-700/50", accent: "text-orange-400" };
    case "ColorWheels":
      return { bg: "bg-purple-950/50", border: "border-purple-700/50", accent: "text-purple-400" };
    case "Curves":
      return { bg: "bg-blue-950/50", border: "border-blue-700/50", accent: "text-blue-400" };
    case "Lut":
      return { bg: "bg-green-950/50", border: "border-green-700/50", accent: "text-green-400" };
    case "Qualifier":
      return { bg: "bg-pink-950/50", border: "border-pink-700/50", accent: "text-pink-400" };
    case "ColorSpaceTransform":
      return { bg: "bg-sky-950/50", border: "border-sky-700/50", accent: "text-sky-400" };
    default:
      return { bg: "bg-neutral-900", border: "border-neutral-700", accent: "text-neutral-400" };
  }
}

function getNodeLabel(node: CGNode): string {
  if (node.label) return node.label;
  switch (node.type) {
    case "Primary":
      return "Primary";
    case "ColorWheels":
      return "Wheels";
    case "Curves":
      return "Curves";
    case "Lut":
      return "LUT";
    case "Qualifier":
      return "Qualifier";
    case "ColorSpaceTransform":
      return "CST";
    default:
      return "Unknown";
  }
}

// ============================================================================
// Terminal Node Component (Input / Output)
// ============================================================================

const TerminalNodeComponent = memo(function TerminalNodeComponent({
  data,
}: NodeProps<TerminalFlowNode>) {
  const isInput = data.type === "input";
  return (
    <>
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="h-3! w-3! rounded-full! border-2! border-neutral-500! bg-neutral-700!"
        />
      )}
      <div className="flex items-center rounded-md border-2 border-neutral-600 bg-neutral-800 px-4 py-2">
        <span className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">
          {data.label}
        </span>
      </div>
      {isInput && (
        <Handle
          type="source"
          position={Position.Right}
          className="h-3! w-3! rounded-full! border-2! border-neutral-500! bg-neutral-700!"
        />
      )}
    </>
  );
});

// ============================================================================
// Grading Node Component
// ============================================================================

const ColorGradingNodeComponent = memo(function ColorGradingNodeComponent({
  data,
  selected,
}: NodeProps<GradingFlowNode>) {
  const { node, onToggleEnabled, onRemove, onSelect, isSelected } = data;
  const theme = getNodeTheme(node.type);
  const preview = getNodePreview(node);
  const label = getNodeLabel(node);

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="h-3! w-3! rounded-full! border-2! border-neutral-600! bg-neutral-800!"
      />

      <div
        className={cn(
          "group relative min-w-35 cursor-pointer rounded-lg border-2 transition-all",
          theme.bg,
          theme.border,
          node.enabled ? "opacity-100" : "opacity-50",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          selected && "shadow-lg shadow-primary/20",
        )}
        onClick={onSelect}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-700/50 px-3 py-2">
          <span className={cn("text-xs font-semibold tracking-wide uppercase", theme.accent)}>
            {label}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnabled(!node.enabled);
              }}
              className={cn(
                "rounded p-1 transition-colors hover:bg-white/10",
                node.enabled ? "text-white" : "text-neutral-500",
              )}
              title={node.enabled ? "Disable" : "Enable"}
            >
              {node.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-red-400"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="px-3 py-2">
          <p className="text-xs text-neutral-400">{preview}</p>
        </div>

        {/* Mix indicator */}
        {node.mix < 1 && (
          <div className="border-t border-neutral-700/50 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500">Mix</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-700">
                <div
                  className={cn("h-full rounded-full", theme.accent.replace("text-", "bg-"))}
                  style={{ width: `${node.mix * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-500">{Math.round(node.mix * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="h-3! w-3! rounded-full! border-2! border-neutral-600! bg-neutral-800!"
      />
    </>
  );
});

// ============================================================================
// Node Types Registry
// ============================================================================

const nodeTypes = {
  colorGrading: ColorGradingNodeComponent,
  terminal: TerminalNodeComponent,
};

// ============================================================================
// Main Component
// ============================================================================

interface ColorGradingNodeGraphProps {
  nodes: CGNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onToggleNodeEnabled: (nodeId: string, enabled: boolean) => void;
  onRemoveNode: (nodeId: string) => void;
  onReorderNodes: (nodeIds: string[]) => void;
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void;
}

export function ColorGradingNodeGraph(props: ColorGradingNodeGraphProps) {
  return (
    <ReactFlowProvider>
      <ColorGradingNodeGraphInner {...props} />
    </ReactFlowProvider>
  );
}

/**
 * Derive processing order from edges by walking the graph from Input → Output.
 * Returns an array of grading node IDs in the connected order.
 */
function deriveOrderFromEdges(edges: Edge[], gradingNodeIds: Set<string>): string[] {
  // Build adjacency: source → target
  const adj = new Map<string, string>();
  for (const edge of edges) {
    adj.set(edge.source, edge.target);
  }

  // Walk from Input
  const order: string[] = [];
  let current = adj.get(INPUT_NODE_ID);
  const visited = new Set<string>();
  while (current && current !== OUTPUT_NODE_ID && !visited.has(current)) {
    visited.add(current);
    if (gradingNodeIds.has(current)) {
      order.push(current);
    }
    current = adj.get(current);
  }

  return order;
}

function ColorGradingNodeGraphInner({
  nodes,
  selectedNodeId,
  onSelectNode,
  onToggleNodeEnabled,
  onRemoveNode,
  onReorderNodes,
  onUpdateNodePosition,
}: ColorGradingNodeGraphProps) {
  const { fitView } = useReactFlow();
  const prevNodeCountRef = useRef(nodes.length);

  // Build flow nodes: Input terminal + grading nodes + Output terminal
  const flowNodes = useMemo((): AnyFlowNode[] => {
    const result: AnyFlowNode[] = [];

    // Input terminal
    result.push({
      id: INPUT_NODE_ID,
      type: "terminal",
      position: { x: -NODE_WIDTH - NODE_GAP, y: 10 },
      data: { label: "Input", type: "input" },
      draggable: false,
      selectable: false,
      deletable: false,
    });

    // Grading nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const defaultPos = { x: i * (NODE_WIDTH + NODE_GAP), y: 0 };
      const pos = node.position ?? defaultPos;
      result.push({
        id: node.id,
        type: "colorGrading",
        position: { x: pos.x, y: pos.y },
        data: {
          node,
          onToggleEnabled: (enabled: boolean) => onToggleNodeEnabled(node.id, enabled),
          onRemove: () => onRemoveNode(node.id),
          onSelect: () => onSelectNode(node.id),
          isSelected: node.id === selectedNodeId,
        },
        draggable: true,
        deletable: false,
      });
    }

    // Output terminal
    result.push({
      id: OUTPUT_NODE_ID,
      type: "terminal",
      position: { x: nodes.length * (NODE_WIDTH + NODE_GAP), y: 10 },
      data: { label: "Output", type: "output" },
      draggable: false,
      selectable: false,
      deletable: false,
    });

    return result;
  }, [nodes, selectedNodeId, onToggleNodeEnabled, onRemoveNode, onSelectNode]);

  // Create edges: Input → node[0] → node[1] → ... → Output
  const flowEdges = useMemo((): Edge[] => {
    const chain = [INPUT_NODE_ID, ...nodes.map((n) => n.id), OUTPUT_NODE_ID];
    return chain.slice(0, -1).map((source, i) => {
      const target = chain[i + 1];
      const sourceEnabled =
        source === INPUT_NODE_ID || (nodes.find((n) => n.id === source)?.enabled ?? true);
      const targetEnabled =
        target === OUTPUT_NODE_ID || (nodes.find((n) => n.id === target)?.enabled ?? true);
      return {
        id: `edge-${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: sourceEnabled && targetEnabled,
        style: {
          stroke: sourceEnabled ? "#525252" : "#262626",
          strokeWidth: 2,
        },
      };
    });
  }, [nodes]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(flowNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync React Flow state when source data changes
  useEffect(() => {
    setRfNodes(flowNodes);
  }, [flowNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(flowEdges);
  }, [flowEdges, setRfEdges]);

  // Fit view when nodes are added or removed
  useEffect(() => {
    if (nodes.length !== prevNodeCountRef.current) {
      prevNodeCountRef.current = nodes.length;
      requestAnimationFrame(() => void fitView({ padding: 0.3 }));
    }
  }, [nodes.length, fitView]);

  // Handle new connections
  const gradingNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Add the new edge, removing any existing edge from the same source
      setRfEdges((eds) => {
        const filtered = eds.filter(
          (e) => e.source !== connection.source && e.target !== connection.target,
        );
        const newEdges = addEdge(
          { ...connection, type: "smoothstep", style: { stroke: "#525252", strokeWidth: 2 } },
          filtered,
        );
        // Derive new order from the updated edges
        const newOrder = deriveOrderFromEdges(newEdges, gradingNodeIds);
        if (newOrder.length > 0) {
          onReorderNodes(newOrder);
        }
        return newEdges;
      });
    },
    [setRfEdges, gradingNodeIds, onReorderNodes],
  );

  // Persist position to store on drag end
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id !== INPUT_NODE_ID && node.id !== OUTPUT_NODE_ID) {
        onUpdateNodePosition(node.id, node.position.x, node.position.y);
      }
    },
    [onUpdateNodePosition],
  );

  // Handle click on background to deselect
  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="h-52 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900/50">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.5}
        maxZoom={1.5}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
      </ReactFlow>
    </div>
  );
}
