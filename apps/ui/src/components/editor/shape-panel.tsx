import type {
  ShapeType,
  ShapeStyle,
  ShapeBox,
  LineStyle,
  LineBox,
  Color,
} from "@tooscut/render-engine";
import { Square, Circle, Triangle, Minus, MoveRight } from "lucide-react";

interface ShapeTemplate {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  shape: ShapeType;
  style: ShapeStyle;
  box: ShapeBox;
  defaultDuration: number;
}

interface LineTemplate {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  style: LineStyle;
  box: LineBox;
  defaultDuration: number;
}

const WHITE: Color = [1, 1, 1, 1];

const SHAPE_TEMPLATES: ShapeTemplate[] = [
  {
    id: "rectangle",
    name: "Rectangle",
    icon: Square,
    shape: "Rectangle",
    style: {
      fill: WHITE,
      stroke: undefined,
      stroke_width: 0,
      corner_radius: 0,
    },
    box: { x: 30, y: 25, width: 40, height: 50 },
    defaultDuration: 5,
  },
  {
    id: "ellipse",
    name: "Ellipse",
    icon: Circle,
    shape: "Ellipse",
    style: {
      fill: WHITE,
      stroke: undefined,
      stroke_width: 0,
      corner_radius: 0,
    },
    box: { x: 30, y: 15, width: 40, height: 70 },
    defaultDuration: 5,
  },
  {
    id: "polygon",
    name: "Polygon",
    icon: Triangle,
    shape: "Polygon",
    style: {
      fill: WHITE,
      stroke: undefined,
      stroke_width: 0,
      corner_radius: 0,
      sides: 6,
    },
    box: { x: 30, y: 15, width: 40, height: 70 },
    defaultDuration: 5,
  },
];

const LINE_TEMPLATES: LineTemplate[] = [
  {
    id: "line",
    name: "Line",
    icon: Minus,
    style: {
      stroke: WHITE,
      stroke_width: 2,
      stroke_style: "Solid",
      start_head: { type: "None", size: 10 },
      end_head: { type: "None", size: 10 },
    },
    box: { x1: 25, y1: 50, x2: 75, y2: 50 },
    defaultDuration: 5,
  },
  {
    id: "arrow",
    name: "Arrow",
    icon: MoveRight,
    style: {
      stroke: WHITE,
      stroke_width: 2,
      stroke_style: "Solid",
      start_head: { type: "None", size: 10 },
      end_head: { type: "Arrow", size: 10 },
    },
    box: { x1: 25, y1: 50, x2: 75, y2: 50 },
    defaultDuration: 5,
  },
];

function TemplateCard({
  name,
  icon: Icon,
  subtitle,
  onDragStart,
}: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="group rounded-md border border-border bg-background p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-primary/5 transition-colors"
      draggable
      onDragStart={onDragStart}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{name}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function ShapeTemplateCard({ template }: { template: ShapeTemplate }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-shape-template",
      JSON.stringify({
        shape: template.shape,
        style: template.style,
        box: template.box,
        defaultDuration: template.defaultDuration,
        name: template.name,
      }),
    );
    e.dataTransfer.setData(`application/x-asset-duration-${template.defaultDuration}`, "");
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <TemplateCard
      name={template.name}
      icon={template.icon}
      subtitle={template.shape}
      onDragStart={handleDragStart}
    />
  );
}

function LineTemplateCard({ template }: { template: LineTemplate }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-line-template",
      JSON.stringify({
        style: template.style,
        box: template.box,
        defaultDuration: template.defaultDuration,
        name: template.name,
      }),
    );
    e.dataTransfer.setData(`application/x-asset-duration-${template.defaultDuration}`, "");
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <TemplateCard
      name={template.name}
      icon={template.icon}
      subtitle="Line"
      onDragStart={handleDragStart}
    />
  );
}

export function ShapePanel() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Drag a shape preset onto the timeline</p>
      <div className="grid grid-cols-2 gap-2">
        {SHAPE_TEMPLATES.map((template) => (
          <ShapeTemplateCard key={template.id} template={template} />
        ))}
        {LINE_TEMPLATES.map((template) => (
          <LineTemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
