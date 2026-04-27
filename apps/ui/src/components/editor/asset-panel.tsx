import { FolderOpen, Type, Shapes, Sparkles } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { TooltipProvider } from "../ui/tooltip";
import { ShapePanel } from "./shape-panel";
import { TamsAssetsContent } from "./tams-assets-content";
import { TextPanel } from "./text-panel";
import { TransitionPanel } from "./transition-panel";

const PANEL_TABS = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "text", label: "Text", icon: Type },
  { id: "shapes", label: "Shapes", icon: Shapes },
  { id: "transitions", label: "Transitions", icon: Sparkles },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

export function AssetPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("assets");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full flex-col">
        <div className="flex border-b border-border">
          {PANEL_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 gap-1.5 rounded-none",
                  isActive ? "border-b-2 border-primary text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <div className="relative flex-1 overflow-auto">
          {activeTab === "assets" && <TamsAssetsContent />}
          {activeTab === "text" && (
            <div className="p-2">
              <TextPanel />
            </div>
          )}
          {activeTab === "shapes" && (
            <div className="p-2">
              <ShapePanel />
            </div>
          )}
          {activeTab === "transitions" && (
            <div className="p-2">
              <TransitionPanel />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
