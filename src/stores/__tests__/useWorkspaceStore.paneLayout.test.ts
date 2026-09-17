import { beforeEach, describe, it, expect, vi } from "vitest";

// The persist middleware writes through a Tauri LazyStore, which has no host to
// invoke under happy-dom. Stub it before importing the store, as the sibling
// workspace tests do, so persistence failures do not drown the output.
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/lib/terminal", () => ({
  killSession: vi.fn().mockResolvedValue(undefined),
}));

import { useWorkspaceStore, type WorkspaceTab } from "../useWorkspaceStore";
import type { PersistedPaneLayout } from "@/lib/paneSnapshot";

function tab(id: string): WorkspaceTab {
  return {
    id,
    name: id,
    projectPath: `/repo/${id}`,
    active: true,
    sessionIds: [],
    sessionsLaunched: false,
    workspaceType: "single-repo",
    repositories: [],
    selectedRepoPath: `/repo/${id}`,
    worktreeBasePath: null,
  };
}

const layout: PersistedPaneLayout = {
  savedAt: "2026-09-17T00:00:00Z",
  slots: [],
  tree: { type: "leaf", id: "n1", slotId: "a" },
  minimized: [],
};

beforeEach(() => {
  useWorkspaceStore.setState({ tabs: [tab("t1"), tab("t2")] });
});

describe("setPaneLayout", () => {
  it("stores the layout on the named tab only", () => {
    useWorkspaceStore.getState().setPaneLayout("t1", layout);
    const tabs = useWorkspaceStore.getState().tabs;
    expect(tabs.find((t) => t.id === "t1")?.paneLayout).toEqual(layout);
    expect(tabs.find((t) => t.id === "t2")?.paneLayout).toBeUndefined();
  });

  it("replaces a previous layout", () => {
    useWorkspaceStore.getState().setPaneLayout("t1", layout);
    const newer = { ...layout, savedAt: "2026-09-18T00:00:00Z" };
    useWorkspaceStore.getState().setPaneLayout("t1", newer);
    expect(useWorkspaceStore.getState().tabs[0].paneLayout?.savedAt).toBe("2026-09-18T00:00:00Z");
  });

  it("ignores an unknown tab", () => {
    useWorkspaceStore.getState().setPaneLayout("nope", layout);
    expect(useWorkspaceStore.getState().tabs.every((t) => t.paneLayout === undefined)).toBe(true);
  });
});
