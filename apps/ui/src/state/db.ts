import Dexie, { type Table } from "dexie";
import type { EditableTrack, CrossTransitionRef } from "@tooscut/render-engine";
import type { EditorClip, MediaAsset, ProjectSettings } from "./video-editor-store";

export interface LocalProject {
  id: string;
  name: string;
  settings: ProjectSettings;
  content: {
    tracks: EditableTrack[];
    clips: EditorClip[];
    crossTransitions?: CrossTransitionRef[];
    assets: MediaAsset[];
  };
  thumbnailDataUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredFileHandle {
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

    // Migrate fps from number to FrameRate { numerator, denominator }
    this.version(2)
      .stores({
        projects: "id, updatedAt, name",
        fileHandles: "id",
      })
      .upgrade((tx) => {
        return tx
          .table("projects")
          .toCollection()
          .modify((project: any) => {
            if (typeof project.settings?.fps === "number") {
              project.settings.fps = {
                numerator: project.settings.fps,
                denominator: 1,
              };
            }
          });
      });
  }
}

export const db = new EditorDatabase();
