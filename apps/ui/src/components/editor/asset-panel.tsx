import { useRef, useCallback, useState, type DragEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { X, Plus, Music, Video, Image, FolderOpen, Type, Shapes, Sparkles } from "lucide-react";
import {
  useAssetStore,
  importFiles,
  importFilesWithPicker,
  handleNativeFileDrop,
  addAssetsToStores,
  formatFileSize,
  formatDuration,
  type MediaAsset,
} from "../timeline/use-asset-store";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { TextPanel } from "./text-panel";
import { ShapePanel } from "./shape-panel";
import { TransitionPanel } from "./transition-panel";

function AssetCard({ asset }: { asset: MediaAsset }) {
  const removeAssetFromUI = useAssetStore((s) => s.removeAsset);
  const removeAssetFromEditor = useVideoEditorStore((s) => s.removeAsset);
  const dragImageRef = useRef<HTMLImageElement | null>(null);
  const removeAsset = useCallback(
    (id: string) => {
      removeAssetFromUI(id);
      removeAssetFromEditor(id);
    },
    [removeAssetFromUI, removeAssetFromEditor],
  );

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-asset-id", asset.id);
    // Also set asset type so we can check track compatibility during dragover
    e.dataTransfer.setData(`application/x-asset-type-${asset.type}`, "");
    // Encode duration in MIME type so dragOver can read it (data values are inaccessible during dragOver)
    e.dataTransfer.setData(`application/x-asset-duration-${asset.duration}`, "");
    e.dataTransfer.effectAllowed = "copy";

    // Set a thumbnail drag ghost
    if (asset.thumbnailUrl) {
      if (!dragImageRef.current) {
        const img = document.createElement("img");
        img.src = asset.thumbnailUrl;
        dragImageRef.current = img;
      }
      e.dataTransfer.setDragImage(dragImageRef.current!, 60, 34);
    }
  };

  return (
    <div
      className="group relative rounded-md border border-border bg-background overflow-hidden cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : asset.type === "audio" ? (
          <Music className="w-8 h-8 text-muted-foreground" />
        ) : (
          <Video className="w-8 h-8 text-muted-foreground" />
        )}

        {/* Duration badge */}
        {asset.duration > 0 && (
          <div className="absolute bottom-1 right-1 bg-muted/90 text-foreground text-[10px] px-1 rounded">
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-1 left-1 bg-muted/90 text-foreground text-[10px] px-1 rounded uppercase">
          {asset.type}
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <div className="text-xs font-medium truncate" title={asset.name}>
          {asset.name}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatFileSize(asset.size)}
          {asset.width && asset.height && ` • ${asset.width}×${asset.height}`}
        </div>
      </div>

      {/* Delete button (on hover) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              removeAsset(asset.id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Remove asset</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function ImportButton({
  accept,
  onImport,
  label,
  icon: Icon,
}: {
  accept: string;
  onImport: (assets: MediaAsset[]) => void;
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFilePicker = "showOpenFilePicker" in window;

  const handleClick = async () => {
    if (hasFilePicker) {
      const assets = await importFilesWithPicker(accept);
      if (assets.length > 0) {
        onImport(assets);
      }
    } else {
      inputRef.current?.click();
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const assets = await importFiles(e.target.files);
      onImport(assets);
      e.target.value = "";
    }
  };

  const IconComponent = Icon || Plus;

  return (
    <>
      {!hasFilePicker && (
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleChange}
        />
      )}
      <Button variant="outline" size="lg" className="w-full" onClick={handleClick}>
        <IconComponent className="w-4 h-4 mr-2" />
        {label || "Import"}
      </Button>
    </>
  );
}

function AssetsContent() {
  const assets = useAssetStore((s) => s.assets);
  const isLoading = useAssetStore((s) => s.isLoading);

  const handleImportedAssets = useCallback((imported: MediaAsset[]) => {
    addAssetsToStores(imported);
  }, []);

  const videoAssets = assets.filter((a) => a.type === "video");
  const audioAssets = assets.filter((a) => a.type === "audio");
  const imageAssets = assets.filter((a) => a.type === "image");

  return (
    <Tabs defaultValue="all" className="flex-1 flex flex-col overflow-hidden">
      <TabsList className="mx-2 mt-2 w-auto">
        <TabsTrigger value="all" className="text-xs">
          All ({assets.length})
        </TabsTrigger>
        <TabsTrigger value="video" className="text-xs">
          Video ({videoAssets.length})
        </TabsTrigger>
        <TabsTrigger value="audio" className="text-xs">
          Audio ({audioAssets.length})
        </TabsTrigger>
        <TabsTrigger value="image" className="text-xs">
          Image ({imageAssets.length})
        </TabsTrigger>
      </TabsList>

      <div className="@container flex-1 overflow-auto p-2">
        <TabsContent value="all" className="m-0 space-y-2">
          <ImportButton accept="video/*,audio/*,image/*" onImport={handleImportedAssets} />
          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-2">Loading...</div>
          )}
          <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[400px]:grid-cols-3 @[600px]:grid-cols-4 gap-2">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
          {assets.length === 0 && !isLoading && (
            <div className="text-center text-sm text-muted-foreground py-4">
              No assets imported yet
            </div>
          )}
        </TabsContent>

        <TabsContent value="video" className="m-0 space-y-2">
          <ImportButton
            accept="video/*"
            onImport={handleImportedAssets}
            label="Import Video"
            icon={Video}
          />
          <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[400px]:grid-cols-3 @[600px]:grid-cols-4 gap-2">
            {videoAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
          {videoAssets.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">No video files</div>
          )}
        </TabsContent>

        <TabsContent value="audio" className="m-0 space-y-2">
          <ImportButton
            accept="audio/*"
            onImport={handleImportedAssets}
            label="Import Audio"
            icon={Music}
          />
          <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[400px]:grid-cols-3 @[600px]:grid-cols-4 gap-2">
            {audioAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
          {audioAssets.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">No audio files</div>
          )}
        </TabsContent>

        <TabsContent value="image" className="m-0 space-y-2">
          <ImportButton
            accept="image/*"
            onImport={handleImportedAssets}
            label="Import Image"
            icon={Image}
          />
          <div className="grid grid-cols-1 @[200px]:grid-cols-2 @[400px]:grid-cols-3 @[600px]:grid-cols-4 gap-2">
            {imageAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
          {imageAssets.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">No image files</div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}

const PANEL_TABS = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "text", label: "Text", icon: Type },
  { id: "shapes", label: "Shapes", icon: Shapes },
  { id: "transitions", label: "Transitions", icon: Sparkles },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

export function AssetPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("assets");
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const setLoading = useAssetStore((s) => s.setLoading);

  const handleDropFiles = useCallback(
    async (files: FileList, handles?: FileSystemFileHandle[]) => {
      setLoading(true);
      try {
        const imported = await importFiles(files, handles);
        if (imported.length > 0) addAssetsToStores(imported);
      } finally {
        setLoading(false);
      }
    },
    [setLoading],
  );

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    // Only show indicator for file drops, not internal asset drags
    if (e.dataTransfer.types.includes("Files")) {
      dragCounterRef.current++;
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.types.includes("Files")) {
        handleNativeFileDrop(e.nativeEvent, handleDropFiles);
        setActiveTab("assets");
      }
    },
    [handleDropFiles],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="relative flex h-full flex-col"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Top-level tab bar */}
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
                className={`flex-1 rounded-none gap-1.5 ${
                  isActive ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="relative flex-1 overflow-auto">
          {activeTab === "assets" && <AssetsContent />}
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

          {/* Drag-over overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary m-2 rounded-lg pointer-events-none">
              <div className="text-sm font-medium text-primary">Drop files to import</div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
