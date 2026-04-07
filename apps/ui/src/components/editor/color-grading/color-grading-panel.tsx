/**
 * Color Grading Panel with node-based pipeline visualization.
 *
 * Features:
 * - Visual node graph showing the color grading pipeline
 * - Add/remove/reorder nodes
 * - Expand nodes to edit parameters
 * - Global bypass toggle
 */

import type {
  ColorGrading,
  ColorSpace,
  PrimaryCorrection,
  ColorWheels,
  Curves,
  HslQualifier,
  LutReference,
  ColorGradingNode as CGNode,
} from "@tooscut/render-engine";

import {
  DEFAULT_PRIMARY_CORRECTION,
  DEFAULT_COLOR_GRADING,
  DEFAULT_COLOR_WHEELS,
  DEFAULT_HSL_QUALIFIER,
  DEFAULT_CURVES,
  DEFAULT_LUT_REFERENCE,
} from "@tooscut/render-engine";
import {
  Eye,
  EyeOff,
  Plus,
  ChevronDown,
  ChevronRight,
  Palette,
  CircleDot,
  Spline,
  Grid3X3,
  Crosshair,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";

import { Button } from "../../ui/button";
import { SearchableDropdown, type SearchableDropdownItem } from "../../ui/searchable-dropdown";
import { Separator } from "../../ui/separator";
import { Toggle } from "../../ui/toggle";
import { ColorWheelsProperties } from "./color-wheels-properties";
import { CstProperties } from "./cst-properties";
import { CurvesProperties } from "./curves-properties";
import { LutProperties } from "./lut-properties";
import { ColorGradingNodeGraph } from "./node-graph";
import { PrimaryCorrectionProperties } from "./primary-correction";
import { QualifierProperties } from "./qualifier-properties";

// ============================================================================
// Types
// ============================================================================

interface ColorGradingPanelProps {
  clipId: string;
  clipStartTime: number;
  colorGrading: ColorGrading | undefined;
  onColorGradingChange: (colorGrading: ColorGrading) => void;
}

// ============================================================================
// Node Type Config
// ============================================================================

interface NodeTypeConfig {
  type: CGNode["type"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  available: boolean;
}

const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: "Primary",
    label: "Primary Correction",
    icon: Palette,
    description: "Exposure, temperature, CDL",
    available: true,
  },
  {
    type: "ColorWheels",
    label: "Color Wheels",
    icon: CircleDot,
    description: "Lift, Gamma, Gain",
    available: true,
  },
  {
    type: "Curves",
    label: "Curves",
    icon: Spline,
    description: "RGB curves adjustment",
    available: true,
  },
  {
    type: "Lut",
    label: "LUT",
    icon: Grid3X3,
    description: "3D lookup table",
    available: true,
  },
  {
    type: "Qualifier",
    label: "HSL Qualifier",
    icon: Crosshair,
    description: "Secondary color keying",
    available: true,
  },
  {
    type: "ColorSpaceTransform",
    label: "Color Space",
    icon: Palette,
    description: "Convert color space",
    available: true,
  },
];

// ============================================================================
// Main Component
// ============================================================================

export function ColorGradingPanel({
  clipId,
  clipStartTime,
  colorGrading,
  onColorGradingChange,
}: ColorGradingPanelProps) {
  // Use default if no color grading exists
  const grading = colorGrading ?? DEFAULT_COLOR_GRADING;

  // Track selected node for parameter editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Get the selected node
  const selectedNode = useMemo(
    () => grading.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [grading.nodes, selectedNodeId],
  );

  // Update a CST node
  const handleUpdateCstNode = useCallback(
    (updates: { from_space?: ColorSpace; to_space?: ColorSpace }) => {
      if (!selectedNode || selectedNode.type !== "ColorSpaceTransform") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "ColorSpaceTransform") {
          return { ...node, ...updates };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Toggle bypass
  const handleBypassToggle = useCallback(
    (bypass: boolean) => {
      onColorGradingChange({ ...grading, bypass });
    },
    [grading, onColorGradingChange],
  );

  // Add a new node
  const handleAddNode = useCallback(
    (type: CGNode["type"]) => {
      let newNode: CGNode;

      switch (type) {
        case "Primary":
          newNode = {
            type: "Primary",
            id: `primary-${Date.now()}`,
            enabled: true,
            mix: 1,
            correction: { ...DEFAULT_PRIMARY_CORRECTION },
          };
          break;
        case "ColorWheels":
          newNode = {
            type: "ColorWheels",
            id: `colorwheels-${Date.now()}`,
            enabled: true,
            mix: 1,
            wheels: { ...DEFAULT_COLOR_WHEELS },
          };
          break;
        case "Curves":
          newNode = {
            type: "Curves",
            id: `curves-${Date.now()}`,
            enabled: true,
            mix: 1,
            curves: { ...DEFAULT_CURVES },
          };
          break;
        case "Lut":
          newNode = {
            type: "Lut",
            id: `lut-${Date.now()}`,
            enabled: true,
            mix: 1,
            lut: { ...DEFAULT_LUT_REFERENCE },
          };
          break;
        case "Qualifier":
          newNode = {
            type: "Qualifier",
            id: `qualifier-${Date.now()}`,
            enabled: true,
            mix: 1,
            qualifier: { ...DEFAULT_HSL_QUALIFIER },
            correction: { ...DEFAULT_PRIMARY_CORRECTION },
          };
          break;
        case "ColorSpaceTransform":
          newNode = {
            type: "ColorSpaceTransform",
            id: `cst-${Date.now()}`,
            enabled: true,
            mix: 1,
            from_space: "SLog3",
            to_space: "Srgb",
          };
          break;
        default:
          return;
      }

      // Insert after the selected node, or at the end if nothing selected
      const newNodes = [...grading.nodes];
      const selectedIndex = selectedNodeId
        ? newNodes.findIndex((n) => n.id === selectedNodeId)
        : -1;
      const insertAt = selectedIndex !== -1 ? selectedIndex + 1 : newNodes.length;
      newNodes.splice(insertAt, 0, newNode);

      onColorGradingChange({ ...grading, nodes: newNodes });
      setSelectedNodeId(newNode.id);
    },
    [grading, onColorGradingChange, selectedNodeId],
  );

  // Toggle node enabled state
  const handleToggleNodeEnabled = useCallback(
    (nodeId: string, enabled: boolean) => {
      const newNodes = grading.nodes.map((node) =>
        node.id === nodeId ? { ...node, enabled } : node,
      );
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange],
  );

  // Remove a node
  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      const newNodes = grading.nodes.filter((node) => node.id !== nodeId);
      onColorGradingChange({ ...grading, nodes: newNodes });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [grading, onColorGradingChange, selectedNodeId],
  );

  // Reorder nodes
  // Reorder nodes based on connection order (array of node IDs)
  const handleReorderNodes = useCallback(
    (nodeIds: string[]) => {
      const nodeMap = new Map(grading.nodes.map((n) => [n.id, n]));
      const reordered = nodeIds
        .map((id) => nodeMap.get(id))
        .filter(Boolean) as typeof grading.nodes;
      // Append any disconnected nodes at the end
      const reorderedIds = new Set(nodeIds);
      for (const node of grading.nodes) {
        if (!reorderedIds.has(node.id)) {
          reordered.push(node);
        }
      }
      onColorGradingChange({ ...grading, nodes: reordered });
    },
    [grading, onColorGradingChange],
  );

  // Update node position (persisted to store)
  const handleUpdateNodePosition = useCallback(
    (nodeId: string, x: number, y: number) => {
      const newNodes = grading.nodes.map((node) =>
        node.id === nodeId ? { ...node, position: { x, y } } : node,
      );
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange],
  );

  // Update a primary correction node
  const handleUpdatePrimaryNode = useCallback(
    (key: keyof PrimaryCorrection, value: number | [number, number, number]) => {
      if (!selectedNode || selectedNode.type !== "Primary") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "Primary") {
          return {
            ...node,
            correction: {
              ...node.correction,
              [key]: value,
            },
          };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Update a color wheels node
  const handleUpdateColorWheelsNode = useCallback(
    (updates: Partial<ColorWheels>) => {
      if (!selectedNode || selectedNode.type !== "ColorWheels") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "ColorWheels") {
          return {
            ...node,
            wheels: {
              ...node.wheels,
              ...updates,
            },
          };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Update a curves node
  const handleUpdateCurvesNode = useCallback(
    (updatedCurves: Curves) => {
      if (!selectedNode || selectedNode.type !== "Curves") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "Curves") {
          return { ...node, curves: updatedCurves };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Update a LUT node
  const handleUpdateLutNode = useCallback(
    (updates: Partial<LutReference>) => {
      if (!selectedNode || selectedNode.type !== "Lut") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "Lut") {
          return {
            ...node,
            lut: {
              ...node.lut,
              ...updates,
            },
          };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Update a qualifier node's qualifier params
  const handleUpdateQualifierNode = useCallback(
    (key: keyof HslQualifier, value: number | boolean) => {
      if (!selectedNode || selectedNode.type !== "Qualifier") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "Qualifier") {
          return {
            ...node,
            qualifier: {
              ...node.qualifier,
              [key]: value,
            },
          };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Update a qualifier node's correction params
  const handleUpdateQualifierCorrection = useCallback(
    (key: keyof PrimaryCorrection, value: number | [number, number, number]) => {
      if (!selectedNode || selectedNode.type !== "Qualifier") return;

      const newNodes = grading.nodes.map((node) => {
        if (node.id === selectedNode.id && node.type === "Qualifier") {
          return {
            ...node,
            correction: {
              ...node.correction,
              [key]: value,
            },
          };
        }
        return node;
      });
      onColorGradingChange({ ...grading, nodes: newNodes });
    },
    [grading, onColorGradingChange, selectedNode],
  );

  // Check if we have any active corrections
  const hasActiveCorrections = useMemo(() => grading.nodes.some((n) => n.enabled), [grading.nodes]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Color Grading</h3>
          {hasActiveCorrections && !grading.bypass && (
            <span className="h-2 w-2 rounded-full bg-green-500" title="Active" />
          )}
        </div>
        <Toggle
          size="sm"
          pressed={grading.bypass}
          onPressedChange={handleBypassToggle}
          title="Bypass all color grading"
          className="h-7 gap-1.5 px-2 text-xs data-[state=on]:bg-yellow-500/20 data-[state=on]:text-yellow-500"
        >
          {grading.bypass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {grading.bypass ? "Bypassed" : "Bypass"}
        </Toggle>
      </div>

      <div className="relative">
        {/* Node Graph */}
        <ColorGradingNodeGraph
          nodes={grading.nodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onToggleNodeEnabled={handleToggleNodeEnabled}
          onRemoveNode={handleRemoveNode}
          onReorderNodes={handleReorderNodes}
          onUpdateNodePosition={handleUpdateNodePosition}
        />

        <div className="absolute right-2 bottom-2">
          {/* Add Node */}
          <AddNodeMenu onAddNode={handleAddNode} />
        </div>
      </div>

      {/* Selected Node Parameters */}
      {selectedNode && (
        <>
          <Separator />
          <NodeParameterEditor
            clipId={clipId}
            clipStartTime={clipStartTime}
            node={selectedNode}
            onUpdatePrimary={handleUpdatePrimaryNode}
            onUpdateColorWheels={handleUpdateColorWheelsNode}
            onUpdateCurves={handleUpdateCurvesNode}
            onUpdateCst={handleUpdateCstNode}
            onUpdateLut={handleUpdateLutNode}
            onUpdateQualifier={handleUpdateQualifierNode}
            onUpdateQualifierCorrection={handleUpdateQualifierCorrection}
          />
        </>
      )}

      {/* Empty state hint */}
      {grading.nodes.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Click "Add Node" to start building your color grading pipeline
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Add Node Menu
// ============================================================================

interface AddNodeMenuProps {
  onAddNode: (type: CGNode["type"]) => void;
}

const addNodeItems: SearchableDropdownItem[] = NODE_TYPE_CONFIGS.map((config) => ({
  key: config.type,
  label: config.label,
  description: config.description,
  disabled: !config.available,
  icon: config.icon,
  trailing: !config.available ? (
    <span className="text-[10px] text-muted-foreground">Soon</span>
  ) : undefined,
}));

function AddNodeMenu({ onAddNode }: AddNodeMenuProps) {
  return (
    <SearchableDropdown
      items={addNodeItems}
      onSelect={(key) => onAddNode(key as CGNode["type"])}
      placeholder="Search nodes..."
      align="start"
    >
      <Button variant="outline" size="sm" className="w-full">
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Node
      </Button>
    </SearchableDropdown>
  );
}

// ============================================================================
// Node Parameter Editor
// ============================================================================

interface NodeParameterEditorProps {
  clipId: string;
  clipStartTime: number;
  node: CGNode;
  onUpdatePrimary: (key: keyof PrimaryCorrection, value: number | [number, number, number]) => void;
  onUpdateColorWheels: (updates: Partial<ColorWheels>) => void;
  onUpdateCurves: (curves: Curves) => void;
  onUpdateCst: (updates: { from_space?: ColorSpace; to_space?: ColorSpace }) => void;
  onUpdateLut: (updates: Partial<LutReference>) => void;
  onUpdateQualifier: (key: keyof HslQualifier, value: number | boolean) => void;
  onUpdateQualifierCorrection: (
    key: keyof PrimaryCorrection,
    value: number | [number, number, number],
  ) => void;
}

// ============================================================================
// Node Parameter Editor
// ============================================================================

function NodeParameterEditor({
  clipId,
  clipStartTime,
  node,
  onUpdatePrimary,
  onUpdateColorWheels,
  onUpdateCurves,
  onUpdateCst,
  onUpdateLut,
  onUpdateQualifier,
  onUpdateQualifierCorrection,
}: NodeParameterEditorProps) {
  const [expanded, setExpanded] = useState(true);

  const nodeLabel = useMemo(() => {
    switch (node.type) {
      case "Primary":
        return "Primary Correction";
      case "ColorWheels":
        return "Color Wheels";
      case "Curves":
        return "Curves";
      case "Lut":
        return "LUT";
      case "Qualifier":
        return "HSL Qualifier";
      case "ColorSpaceTransform":
        return "Color Space Transform";
      default:
        return "Unknown";
    }
  }, [node.type]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{nodeLabel}</span>
        {!node.enabled && <span className="ml-auto text-xs text-muted-foreground">(Disabled)</span>}
      </button>

      {/* Parameters */}
      {expanded && (
        <div className="pl-2">
          {node.type === "Primary" && (
            <PrimaryCorrectionProperties
              clipId={clipId}
              clipStartTime={clipStartTime}
              correction={node.correction}
              onCorrectionChange={onUpdatePrimary}
            />
          )}
          {node.type === "ColorWheels" && (
            <ColorWheelsProperties
              clipId={clipId}
              clipStartTime={clipStartTime}
              wheels={node.wheels}
              onWheelsChange={onUpdateColorWheels}
            />
          )}
          {node.type === "Curves" && (
            <CurvesProperties curves={node.curves} onCurvesChange={onUpdateCurves} />
          )}
          {node.type === "Lut" && <LutProperties lut={node.lut} onChange={onUpdateLut} />}
          {node.type === "Qualifier" && (
            <QualifierProperties
              clipId={clipId}
              clipStartTime={clipStartTime}
              qualifier={node.qualifier}
              correction={node.correction}
              onQualifierChange={onUpdateQualifier}
              onCorrectionChange={onUpdateQualifierCorrection}
            />
          )}
          {node.type === "ColorSpaceTransform" && (
            <CstProperties
              fromSpace={node.from_space}
              toSpace={node.to_space}
              onChange={onUpdateCst}
            />
          )}
        </div>
      )}
    </div>
  );
}
