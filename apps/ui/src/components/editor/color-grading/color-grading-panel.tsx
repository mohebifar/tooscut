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
  PrimaryCorrection,
  ColorWheels,
  ColorGradingNode as CGNode,
} from "@tooscut/render-engine";

import {
  DEFAULT_PRIMARY_CORRECTION,
  DEFAULT_COLOR_GRADING,
  DEFAULT_COLOR_WHEELS,
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
  Square,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";

import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Separator } from "../../ui/separator";
import { Toggle } from "../../ui/toggle";
import { ColorWheelsProperties } from "./color-wheels-properties";
import { ColorGradingNodeGraph } from "./node-graph";
import { PrimaryCorrectionProperties } from "./primary-correction";

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
    available: false,
  },
  {
    type: "Lut",
    label: "LUT",
    icon: Grid3X3,
    description: "3D lookup table",
    available: false,
  },
  {
    type: "Qualifier",
    label: "HSL Qualifier",
    icon: Crosshair,
    description: "Secondary color keying",
    available: false,
  },
  {
    type: "Window",
    label: "Power Window",
    icon: Square,
    description: "Regional mask",
    available: false,
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
        default:
          return;
      }

      const newNodes = [...grading.nodes, newNode];
      onColorGradingChange({ ...grading, nodes: newNodes });
      setSelectedNodeId(newNode.id);
    },
    [grading, onColorGradingChange],
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
  const handleReorderNodes = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newNodes = [...grading.nodes];
      const [removed] = newNodes.splice(fromIndex, 1);
      newNodes.splice(toIndex, 0, removed);
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

      {/* Node Graph */}
      <ColorGradingNodeGraph
        nodes={grading.nodes}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onToggleNodeEnabled={handleToggleNodeEnabled}
        onRemoveNode={handleRemoveNode}
        onReorderNodes={handleReorderNodes}
      />

      {/* Add Node */}
      <AddNodeMenu onAddNode={handleAddNode} />

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

function AddNodeMenu({ onAddNode }: AddNodeMenuProps) {
  const [open, setOpen] = useState(false);

  const handleAdd = (type: CGNode["type"]) => {
    onAddNode(type);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Node
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="space-y-1">
          {NODE_TYPE_CONFIGS.map((config) => {
            const Icon = config.icon;
            return (
              <button
                key={config.type}
                type="button"
                onClick={() => config.available && handleAdd(config.type)}
                disabled={!config.available}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
                {!config.available && (
                  <span className="text-[10px] text-muted-foreground">Soon</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
}

function NodeParameterEditor({
  clipId,
  clipStartTime,
  node,
  onUpdatePrimary,
  onUpdateColorWheels,
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
      case "Window":
        return "Power Window";
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
        <div className="pl-6">
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
            <p className="text-sm text-muted-foreground">Curves editor coming soon</p>
          )}
          {node.type === "Lut" && (
            <p className="text-sm text-muted-foreground">LUT browser coming soon</p>
          )}
          {node.type === "Qualifier" && (
            <p className="text-sm text-muted-foreground">HSL Qualifier coming soon</p>
          )}
          {node.type === "Window" && (
            <p className="text-sm text-muted-foreground">Power Window coming soon</p>
          )}
        </div>
      )}
    </div>
  );
}
