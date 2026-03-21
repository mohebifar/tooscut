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
  }
}

export const db = new EditorDatabase();
