import type { EditableTrack, CrossTransitionRef } from "@tooscut/render-engine";

import Dexie, { type Table } from "dexie";

import type { EditorClip, MediaAsset, ProjectSettings, TimelineMarker } from "./video-editor-store";

export interface LocalProject {
  id: string;
  name: string;
  settings: ProjectSettings;
  content: {
    tracks: EditableTrack[];
    clips: EditorClip[];
    crossTransitions?: CrossTransitionRef[];
    markers?: TimelineMarker[];
    assets: MediaAsset[];
  };
  thumbnailDataUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

interface StoredFileHandle {
  id: string;
  handle: FileSystemFileHandle;
  fileName: string;
  mimeType: string;
  size: number;
  storedAt: number;
}

class EditorDatabase extends Dexie {
  projects!: Table<LocalProject>;
  fileHandles!: Table<StoredFileHandle>;

  constructor() {
    super("tooscut-editor");
    this.version(1).stores({
      projects: "id, updatedAt, name",
      fileHandles: "id",
    });

    // V2: Migrate fps from number to FrameRate { numerator, denominator }
    this.version(2)
      .stores({
        projects: "id, updatedAt, name",
        fileHandles: "id",
      })
      .upgrade((tx) => {
        return tx
          .table("projects")
          .toCollection()
          .modify((project: LocalProject) => {
            if (typeof project.settings?.fps === "number") {
              project.settings.fps = {
                numerator: project.settings.fps,
                denominator: 1,
              };
            }
          });
      });

    // V3: Convert all time-based values (seconds) to frame-based values (integer frames)
    this.version(3)
      .stores({
        projects: "id, updatedAt, name",
        fileHandles: "id",
      })
      .upgrade((tx) => {
        return tx
          .table("projects")
          .toCollection()
          .modify((project: LocalProject) => {
            const fps = project.settings?.fps;
            if (!fps?.numerator) return;

            const fpsFloat = fps.numerator / fps.denominator;

            // Dexie only invokes a version's upgrade() once per database, over
            // data that predates that version — every record reaching this
            // function is guaranteed to still be seconds-based (v2 schema), so
            // fields are converted unconditionally. (A prior version gated
            // duration/assetDuration behind "value < threshold" heuristics to
            // guess whether they were "already migrated", which had no real
            // ambiguity to resolve and silently skipped conversion — and thus
            // corrupted timing — for any clip a heuristic misjudged, e.g. a
            // clip whose seconds duration was itself >= 1000.)

            // Convert clip time fields from seconds to frames
            for (const clip of project.content?.clips ?? []) {
              if (typeof clip.startTime === "number") {
                clip.startTime = Math.round(clip.startTime * fpsFloat);
              }
              if (typeof clip.duration === "number") {
                clip.duration = Math.max(1, Math.round(clip.duration * fpsFloat));
              }
              if (typeof clip.inPoint === "number") {
                clip.inPoint = Math.round(clip.inPoint * fpsFloat);
              }
              if (typeof clip.assetDuration === "number") {
                clip.assetDuration = Math.round(clip.assetDuration * fpsFloat);
              }
            }

            // Convert cross-transition time fields
            for (const ct of project.content?.crossTransitions ?? []) {
              if (typeof ct.duration === "number") {
                ct.duration = Math.max(1, Math.round(ct.duration * fpsFloat));
              }
              if (typeof ct.boundary === "number") {
                ct.boundary = Math.round(ct.boundary * fpsFloat);
              }
            }

            // Convert asset durations
            for (const asset of project.content?.assets ?? []) {
              if (typeof asset.duration === "number") {
                asset.duration = Math.round(asset.duration * fpsFloat);
              }
            }
          });
      });
  }
}

export const db = new EditorDatabase();
