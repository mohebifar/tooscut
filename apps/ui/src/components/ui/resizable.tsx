import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "../../lib/utils";

function ResizablePanelGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      orientation={orientation}
      className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
  orientation?: "horizontal" | "vertical";
}) {
  const isVertical = orientation === "vertical";

  return (
    <Separator
      className={cn(
        // Base styles
        "relative flex shrink-0 items-center justify-center transition-colors",
        "hover:bg-primary/30 active:bg-primary/50",
        // Orientation-specific styles
        isVertical
          ? [
              // Vertical separator (horizontal resize bar - resizes up/down)
              "h-1.5 w-full cursor-row-resize bg-border/50",
              "before:absolute before:inset-x-0 before:top-1/2 before:h-3 before:w-full before:-translate-y-1/2 before:content-['']",
            ]
          : [
              // Horizontal separator (vertical resize bar - resizes left/right)
              "h-full w-1.5 cursor-col-resize bg-border/50",
              "before:absolute before:inset-y-0 before:left-1/2 before:w-3 before:-translate-x-1/2 before:content-['']",
            ],
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex items-center justify-center rounded-sm border bg-muted",
            isVertical ? "h-3 w-4 rotate-90" : "h-4 w-3",
          )}
        >
          <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
