import type { TextStyle, TextBox, Color } from "@tooscut/render-engine";

import { Type, Heading1, Heading2, MessageSquare } from "lucide-react";

interface TextTemplate {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  style: TextStyle;
  box: TextBox;
  defaultDuration: number;
}

const WHITE: Color = [1, 1, 1, 1];

const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: "title",
    name: "Title",
    icon: Heading1,
    text: "Title",
    style: {
      font_family: "Inter",
      font_size: 72,
      font_weight: 700,
      italic: false,
      color: WHITE,
      text_align: "Center",
      vertical_align: "Middle",
      line_height: 1.2,
      letter_spacing: 0,
    },
    box: { x: 10, y: 40, width: 80, height: 20 },
    defaultDuration: 5,
  },
  {
    id: "subtitle",
    name: "Subtitle",
    icon: Heading2,
    text: "Subtitle",
    style: {
      font_family: "Inter",
      font_size: 48,
      font_weight: 400,
      italic: false,
      color: WHITE,
      text_align: "Center",
      vertical_align: "Middle",
      line_height: 1.2,
      letter_spacing: 0,
    },
    box: { x: 15, y: 42, width: 70, height: 16 },
    defaultDuration: 5,
  },
  {
    id: "lower-third",
    name: "Lower Third",
    icon: MessageSquare,
    text: "Lower Third",
    style: {
      font_family: "Inter",
      font_size: 36,
      font_weight: 700,
      italic: false,
      color: WHITE,
      text_align: "Left",
      vertical_align: "Middle",
      line_height: 1.2,
      letter_spacing: 0,
      background_color: [0, 0, 0, 0.7],
      background_padding: 16,
      background_border_radius: 4,
    },
    box: { x: 5, y: 82, width: 40, height: 8 },
    defaultDuration: 5,
  },
  {
    id: "caption",
    name: "Caption",
    icon: Type,
    text: "Caption text",
    style: {
      font_family: "Inter",
      font_size: 24,
      font_weight: 400,
      italic: false,
      color: WHITE,
      text_align: "Center",
      vertical_align: "Bottom",
      line_height: 1.4,
      letter_spacing: 0,
    },
    box: { x: 20, y: 88, width: 60, height: 8 },
    defaultDuration: 5,
  },
];

function TextTemplateCard({ template }: { template: TextTemplate }) {
  const Icon = template.icon;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-text-template",
      JSON.stringify({
        text: template.text,
        style: template.style,
        box: template.box,
        defaultDuration: template.defaultDuration,
        name: template.name,
      }),
    );
    // Encode duration in MIME type so dragOver can read it (data values are inaccessible during dragOver)
    e.dataTransfer.setData(`application/x-asset-duration-${template.defaultDuration}`, "");
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="group cursor-grab rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-primary/5 active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{template.name}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {template.style.font_size}px {template.style.font_weight >= 700 ? "Bold" : "Regular"}
      </div>
    </div>
  );
}

export function TextPanel() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Drag a text preset onto the timeline</p>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_TEMPLATES.map((template) => (
          <TextTemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
