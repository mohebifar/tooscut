/**
 * Node-based color grading graph using React Flow.
 *
 * Displays color grading nodes in a horizontal pipeline layout.
 * Each node can be expanded to show parameters, enabled/disabled,
 * or removed. Nodes can be reordered by dragging.
 */

import type { ColorGradingNode as CGNode } from "@tooscut/render-engine";
import type { Node, NodeProps, Edge } from "@xyflow/react";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Eye, EyeOff, Trash2, GripVertical } from "lucide-react";
import { useCallback, useMemo, useEffect, memo } from "react";

import { cn } from "../../../lib/utils";

// ============================================================================
// Types
// ============================================================================

interface NodeData extends Record<string, unknown> {
  node: CGNode;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onRemove: () => void;
  onSelect: () => void;
  isSelected: boolean;
}

type ColorGradingFlowNode = Node<NodeData, string>;

// ============================================================================
// Node Components
// ============================================================================

/**
 * Get a preview string for a node's current settings.
 */
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
    case "Curves":
      return "RGB Curves";
    case "Lut":
      return node.lut.lut_id || "No LUT";
    case "Qualifier":
      return "HSL Key";
    case "Window": {
      const shape = node.window.shape;
      if ("Circle" in shape) return "Circle";
      if ("Rectangle" in shape) return "Rectangle";
      if ("Polygon" in shape) return "Polygon";
      if ("Gradient" in shape) return "Gradient";
      return "Unknown";
    }
    default:
      return "Unknown";
  }
}

/**
 * Get the color theme for a node type.
 */
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
    case "Window":
      return { bg: "bg-cyan-950/50", border: "border-cyan-700/50", accent: "text-cyan-400" };
    default:
      return { bg: "bg-neutral-900", border: "border-neutral-700", accent: "text-neutral-400" };
  }
}

/**
 * Get the label for a node type.
 */
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
    case "Window":
      return "Window";
    default:
      return "Unknown";
  }
}

/**
 * Base node component for all color grading node types.
 */
const ColorGradingNodeComponent = memo(function ColorGradingNodeComponent({
  data,
  selected,
}: NodeProps<ColorGradingFlowNode>) {
  const { node, isFirst, isLast, onToggleEnabled, onRemove, onSelect, isSelected } = data;
  const theme = getNodeTheme(node.type);
  const preview = getNodePreview(node);
  const label = getNodeLabel(node);

  return (
    <>
      {/* Input handle */}
      {!isFirst && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-neutral-600 !bg-neutral-800"
        />
      )}

      {/* Node content */}
      <div
        className={cn(
          "group relative min-w-[140px] cursor-pointer rounded-lg border-2 transition-all",
          theme.bg,
          theme.border,
          node.enabled ? "opacity-100" : "opacity-50",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          selected && "shadow-lg shadow-primary/20",
        )}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical className="h-4 w-4 text-neutral-500" />
        </div>

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

      {/* Output handle */}
      {!isLast && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !rounded-full !border-2 !border-neutral-600 !bg-neutral-800"
        />
      )}
    </>
  );
});

// ============================================================================
// Node Types Registry
// ============================================================================

const nodeTypes = {
  colorGrading: ColorGradingNodeComponent,
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
  onReorderNodes: (fromIndex: number, toIndex: number) => void;
}

const NODE_WIDTH = 160;
const NODE_GAP = 60;

export function ColorGradingNodeGraph({
  nodes,
  selectedNodeId,
  onSelectNode,
  onToggleNodeEnabled,
  onRemoveNode,
  onReorderNodes,
}: ColorGradingNodeGraphProps) {
  // Convert color grading nodes to React Flow nodes
  const flowNodes = useMemo((): ColorGradingFlowNode[] => {
    return nodes.map((node, index) => ({
      id: node.id,
      type: "colorGrading",
      position: { x: index * (NODE_WIDTH + NODE_GAP), y: 0 },
      data: {
        node,
        index,
        isFirst: index === 0,
        isLast: index === nodes.length - 1,
        onToggleEnabled: (enabled: boolean) => onToggleNodeEnabled(node.id, enabled),
        onRemove: () => onRemoveNode(node.id),
        onSelect: () => onSelectNode(node.id),
        isSelected: node.id === selectedNodeId,
      },
      draggable: true,
    }));
  }, [nodes, selectedNodeId, onToggleNodeEnabled, onRemoveNode, onSelectNode]);

  // Create edges connecting nodes in sequence
  const flowEdges = useMemo((): Edge[] => {
    return nodes.slice(0, -1).map((node, index) => ({
      id: `edge-${node.id}-${nodes[index + 1].id}`,
      source: node.id,
      target: nodes[index + 1].id,
      type: "smoothstep",
      animated: nodes[index].enabled && nodes[index + 1].enabled,
      style: {
        stroke: nodes[index].enabled ? "#525252" : "#262626",
        strokeWidth: 2,
      },
    }));
  }, [nodes]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(flowNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync React Flow nodes when props change
  useEffect(() => {
    setRfNodes(flowNodes);
  }, [flowNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(flowEdges);
  }, [flowEdges, setRfEdges]);

  // Handle node drag end for reordering
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const currentIndex = nodes.findIndex((n) => n.id === node.id);
      if (currentIndex === -1) return;

      // Calculate new index based on x position
      const newIndex = Math.round(node.position.x / (NODE_WIDTH + NODE_GAP));
      const clampedIndex = Math.max(0, Math.min(nodes.length - 1, newIndex));

      if (clampedIndex !== currentIndex) {
        onReorderNodes(currentIndex, clampedIndex);
      }
    },
    [nodes, onReorderNodes],
  );

  // Handle click on background to deselect
  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50">
        <p className="text-sm text-neutral-500">No nodes in pipeline</p>
      </div>
    );
  }

  return (
    <div className="h-40 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900/50">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.5}
        maxZoom={1.5}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
      </ReactFlow>
    </div>
  );
}
