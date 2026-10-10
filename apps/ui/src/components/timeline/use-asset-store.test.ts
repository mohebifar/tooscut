import { describe, it, expect, vi } from "vitest";

import type { MediaAsset } from "../../state/video-editor-store";

import { requestPermissionAndHydrate } from "./use-asset-store";

vi.mock("../../state/db", () => ({ db: {} }));
vi.mock("../../state/video-editor-store", () => ({ useVideoEditorStore: {} }));
vi.mock("@tooscut/render-engine", () => ({ secondsToFrames: (s: number) => s }));

function asset(id: string): MediaAsset {
  return { id, type: "video", name: `${id}.mp4`, url: "", duration: 10 } as MediaAsset;
}

/** Fake handle where only the first requestPermission call has user activation. */
function makeHandles(ids: string[], answer: "granted" | "denied" = "granted") {
  let activation = true;
  const handles = new Map<string, FileSystemFileHandle>();
  const requestSpies = new Map<string, ReturnType<typeof vi.fn>>();
  for (const id of ids) {
    let state = "prompt";
    const requestPermission = vi.fn<() => Promise<string>>(async () => {
      if (!activation) {
        throw new DOMException("User activation is required", "SecurityError");
      }
      activation = false;
      state = answer;
      return state;
    });
    requestSpies.set(id, requestPermission);
    handles.set(id, {
      queryPermission: vi.fn<() => Promise<string>>(async () => state),
      requestPermission,
      getFile: vi.fn<() => Promise<File>>(async () => new File(["x"], `${id}.mp4`)),
    } as unknown as FileSystemFileHandle);
  }
  return { handles, requestSpies };
}

describe("requestPermissionAndHydrate", () => {
  it("starts every request before awaiting, so one click activation covers all of them", async () => {
    URL.createObjectURL = vi.fn<() => string>(() => "blob:x");
    const ids = ["a", "b", "c"];
    const { handles, requestSpies } = makeHandles(ids);
    const promise = requestPermissionAndHydrate(ids, ids.map(asset), handles);

    for (const id of ids) {
      expect(requestSpies.get(id)).toHaveBeenCalledTimes(1);
    }
    await promise;
  });

  it("puts activation errors in retryIds, not deniedIds", async () => {
    URL.createObjectURL = vi.fn<() => string>(() => "blob:x");
    const ids = ["a", "b", "c"];
    const result = await requestPermissionAndHydrate(ids, ids.map(asset), makeHandles(ids).handles);

    expect(result.hydrated.map((a) => a.id)).toEqual(["a"]);
    expect(result.retryIds.sort()).toEqual(["b", "c"]);
    expect(result.deniedIds).toEqual([]);
    expect(result.errorNames).toEqual(["SecurityError", "SecurityError"]);
  });

  it("puts a refused request in deniedIds", async () => {
    const result = await requestPermissionAndHydrate(
      ["a"],
      [asset("a")],
      makeHandles(["a"], "denied").handles,
    );

    expect(result.deniedIds).toEqual(["a"]);
    expect(result.retryIds).toEqual([]);
    expect(result.hydrated).toEqual([]);
  });
});
