import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNewProjectSettingsDialog } from "./use-new-project-settings-dialog";

const projects = new Map<string, { id: string; settingsConfirmed?: boolean }>();

vi.mock("../state/db", () => ({
  db: {
    projects: {
      get: async (id: string) => projects.get(id),
      update: async (id: string, changes: object) => {
        const project = projects.get(id);
        if (project) Object.assign(project, changes);
        return project ? 1 : 0;
      },
    },
  },
}));

describe("useNewProjectSettingsDialog", () => {
  beforeEach(() => {
    projects.clear();
    projects.set("p1", { id: "p1" });
  });

  it("opens for a new project that has not confirmed its settings", async () => {
    const { result } = renderHook(() => useNewProjectSettingsDialog("p1", true));
    await waitFor(() => expect(result.current[0]).toBe(true));
  });

  it("does not open again after a reload of the ?new=true URL", async () => {
    const first = renderHook(() => useNewProjectSettingsDialog("p1", true));
    await waitFor(() => expect(first.result.current[0]).toBe(true));
    act(() => first.result.current[1](false));
    await waitFor(() => expect(projects.get("p1")?.settingsConfirmed).toBe(true));
    first.unmount();

    const reloaded = renderHook(() => useNewProjectSettingsDialog("p1", true));
    await act(async () => {});
    expect(reloaded.result.current[0]).toBe(false);
  });

  it("does not open or set the flag for an existing project", async () => {
    const { result } = renderHook(() => useNewProjectSettingsDialog("p1", false));
    await act(async () => {});
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    await act(async () => {});
    expect(projects.get("p1")?.settingsConfirmed).toBeUndefined();
  });
});
