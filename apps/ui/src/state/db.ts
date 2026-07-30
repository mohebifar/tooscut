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
  /**
   * Explicit marker for the unit of all time fields in `content`, written by
   * the v4 migration onward.
   *
   * Exists so no future migration ever has to *infer* whether a row was
   * already converted — the v3 migration originally did that with magnitude
   * thresholds and silently corrupted rows it misjudged.
   */
  contentTimeBase?: "frames";
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

            project.contentTimeBase = "frames";
          });
      });

    // V4: Stamp the time-base marker on databases that ran the ORIGINAL v3
    // upgrade (which predates the marker), and flag rows its magnitude
    // heuristics may have skipped.
    //
    // Deliberately does NOT rewrite any durations. The old code skipped
    // `clip.duration >= 1000` (i.e. clips longer than ~16.7 min, left in
    // seconds). A value in [1000, 1000*fps) is genuinely ambiguous: it's either
    // one of those skipped seconds values, or a correctly-converted frame count
    // for a shorter clip. Nothing in the row distinguishes them, so an
    // automatic "repair" would re-corrupt correct data — the exact failure mode
    // being cleaned up here. Suspect rows are logged instead so they can be
    // corrected deliberately.
    this.version(4)
      .stores({
        projects: "id, updatedAt, name",
        fileHandles: "id",
      })
      .upgrade((tx) => {
        return tx
          .table("projects")
          .toCollection()
          .modify((project: LocalProject) => {
            const fpsFloat = project.settings?.fps
              ? project.settings.fps.numerator / project.settings.fps.denominator
              : 0;

            // Only `clip.duration` was realistically affected: the other
            // thresholds (100000s ≈ 27.8h assets, 1000s ≈ 16.7min transitions)
            // are beyond any plausible real value.
            const suspect = (project.content?.clips ?? []).filter(
              (clip) =>
                typeof clip.duration === "number" &&
                clip.duration >= 1000 &&
                (fpsFloat === 0 || clip.duration < 1000 * fpsFloat),
            );
            if (suspect.length > 0) {
              console.warn(
                `[db] Project "${project.name}" (${project.id}) has ${suspect.length} clip(s) ` +
                  `whose duration may still be in seconds, skipped by the original v3 migration's ` +
                  `magnitude heuristic. These cannot be corrected automatically without risking ` +
                  `valid data; check clip lengths if they look wrong. Clip ids: ` +
                  suspect.map((c) => c.id).join(", "),
              );
            }

            project.contentTimeBase = "frames";
          });
      });
  }
}

export const db = new EditorDatabase();
