import { useCallback, useEffect, useState } from "react";
import { Loader2, Film, Music, Image, AlertCircle, Settings } from "lucide-react";

import { TamsClient, TamsClientError, type TamsFlow, type TamsSource } from "../../lib/tams-client";
import { useTamsSettingsStore } from "../../state/tams-settings-store";
import { Button } from "../ui/button";
import { TamsSettingsDialog } from "./tams-settings-dialog";

interface TamsAssetItem {
  flow: TamsFlow;
  source?: TamsSource;
}

function TamsFlowCard({ item }: { item: TamsAssetItem }) {
  const { flow } = item;

  const formatLabel = flow.label || flow.id.slice(0, 8);
  const isVideo = flow.format?.includes("video");
  const isAudio = flow.format?.includes("audio");
  const isImage = flow.format?.includes("image");

  const Icon = isVideo ? Film : isAudio ? Music : isImage ? Image : Film;

  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-background">
      {/* Thumbnail placeholder */}
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />

        {/* Format badge */}
        {flow.codec && (
          <div className="absolute right-1 bottom-1 rounded bg-muted/90 px-1 text-[10px] text-foreground">
            {flow.codec}
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-1 left-1 rounded bg-muted/90 px-1 text-[10px] text-foreground uppercase">
          {isVideo ? "video" : isAudio ? "audio" : isImage ? "image" : "data"}
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <div className="truncate text-xs font-medium" title={formatLabel}>
          {formatLabel}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {flow.frame_width && flow.frame_height && `${flow.frame_width}×${flow.frame_height}`}
          {item.source?.label && ` • ${item.source.label}`}
        </div>
      </div>
    </div>
  );
}

export function TamsAssetsContent() {
  const tamsConfig = useTamsSettingsStore((s) => s.tamsConfig);
  const isConnected = useTamsSettingsStore((s) => s.isConnected);
  const setConnected = useTamsSettingsStore((s) => s.setConnected);
  const setConnectionError = useTamsSettingsStore((s) => s.setConnectionError);

  const [flows, setFlows] = useState<TamsAssetItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchAssets = useCallback(async () => {
    if (!tamsConfig) return;

    setIsLoading(true);
    setError(null);

    try {
      const client = new TamsClient(tamsConfig);

      // Verify connection first
      await client.getServiceInfo();
      setConnected(true);
      setConnectionError(null);

      // Fetch flows (video, audio, image)
      const allFlows = await client.listFlows({ limit: 50 });

      // Fetch sources for labels
      const sourceIds = [...new Set(allFlows.map((f) => f.source_id))];
      const sources: Map<string, TamsSource> = new Map();

      await Promise.all(
        sourceIds.slice(0, 20).map(async (id) => {
          try {
            const source = await client.getSource(id);
            sources.set(id, source);
          } catch {
            // Source may not exist or be inaccessible
          }
        }),
      );

      const items: TamsAssetItem[] = allFlows.map((flow) => ({
        flow,
        source: sources.get(flow.source_id),
      }));

      setFlows(items);
    } catch (err) {
      const message =
        err instanceof TamsClientError
          ? `Error ${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load TAMS assets";
      setError(message);
      setConnected(false);
      setConnectionError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tamsConfig, setConnected, setConnectionError]);

  useEffect(() => {
    if (tamsConfig) {
      void fetchAssets();
    }
  }, [tamsConfig, fetchAssets]);

  // Not configured
  if (!tamsConfig) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">TAMS not configured</p>
          <p className="text-xs text-muted-foreground">
            Set up a connection to browse media from a Time-addressable Media Store.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-1.5 size-3.5" />
          Configure TAMS
        </Button>
        <TamsSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {/* Header with refresh + settings */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => void fetchAssets()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : null}
          Refresh
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setSettingsOpen(true)}>
          <Settings className="size-3.5" />
        </Button>
      </div>

      {/* Connection status */}
      {isConnected && !error && (
        <div className="flex items-center gap-1.5 text-[10px] text-green-600 dark:text-green-400">
          <div className="size-1.5 rounded-full bg-green-500" />
          Connected
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
          Loading flows...
        </div>
      )}

      {/* Flow grid */}
      {!isLoading && flows.length > 0 && (
        <div className="grid grid-cols-1 gap-2 @[200px]:grid-cols-2 @[400px]:grid-cols-3 @[600px]:grid-cols-4">
          {flows.map((item) => (
            <TamsFlowCard key={item.flow.id} item={item} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && flows.length === 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No flows found in TAMS
        </div>
      )}

      <TamsSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
