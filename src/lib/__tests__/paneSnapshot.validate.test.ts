import { describe, it, expect } from "vitest";

import { validateRestoredSlot, type RestoreContext } from "../paneSnapshot";
import type { SessionSlot } from "@/components/terminal/PreLaunchCard";

function slot(overrides: Partial<SessionSlot> = {}): SessionSlot {
  return {
    id: "a",
    mode: "Claude",
    branch: "main",
    worktreeMode: "project",
    sessionId: null,
    worktreePath: null,
    worktreeWarning: null,
    enabledMcpServers: ["fs"],
    enabledSkills: ["s1"],
    enabledPlugins: ["p1"],
    resumeSessionId: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<RestoreContext> = {}): RestoreContext {
  return {
    branchNames: new Set(["main", "feat/x"]),
    currentBranch: "main",
    worktreeBranches: new Set(["feat/x"]),
    claudeSessionIds: new Set(["uuid-1"]),
    mcpServerNames: new Set(["fs"]),
    skillIds: new Set(["s1"]),
    pluginIds: new Set(["p1"]),
    ...overrides,
  };
}

describe("validateRestoredSlot", () => {
  it("returns the same object when everything still holds", () => {
    const s = slot();
    expect(validateRestoredSlot(s, ctx())).toBe(s);
  });

  it("falls back to the current branch when the saved one is gone", () => {
    const result = validateRestoredSlot(slot({ branch: "feat/deleted" }), ctx());
    expect(result.branch).toBe("main");
    expect(result.restoreNotes?.join(" ")).toContain("feat/deleted");
  });

  it("drops to the project directory when the worktree is gone", () => {
    const result = validateRestoredSlot(
      slot({ branch: "main", worktreeMode: "new", worktreePath: "/tmp/wt" }),
      ctx(),
    );
    expect(result.worktreeMode).toBe("project");
    expect(result.worktreePath).toBeNull();
    expect(result.restoreNotes?.join(" ")).toContain("orktree");
  });

  it("keeps a worktree that still exists", () => {
    const s = slot({ branch: "feat/x", worktreeMode: "new", worktreePath: "/tmp/wt" });
    const result = validateRestoredSlot(s, ctx());
    expect(result.worktreeMode).toBe("new");
    expect(result.worktreePath).toBe("/tmp/wt");
  });

  it("clears a conversation that no longer exists", () => {
    const result = validateRestoredSlot(slot({ resumeSessionId: "uuid-gone" }), ctx());
    expect(result.resumeSessionId).toBeNull();
    expect(result.restoreNotes?.join(" ")).toContain("conversation");
  });

  it("keeps a conversation that still exists", () => {
    const result = validateRestoredSlot(slot({ resumeSessionId: "uuid-1" }), ctx());
    expect(result.resumeSessionId).toBe("uuid-1");
    expect(result.restoreNotes).toBeUndefined();
  });

  it("drops unknown mcp servers, skills and plugins", () => {
    const result = validateRestoredSlot(
      slot({
        enabledMcpServers: ["fs", "gone"],
        enabledSkills: ["s1", "s-gone"],
        enabledPlugins: ["p1", "p-gone"],
      }),
      ctx(),
    );
    expect(result.enabledMcpServers).toEqual(["fs"]);
    expect(result.enabledSkills).toEqual(["s1"]);
    expect(result.enabledPlugins).toEqual(["p1"]);
    expect(result.restoreNotes).toHaveLength(3);
  });

  it("collects every problem rather than stopping at the first", () => {
    const result = validateRestoredSlot(
      slot({ branch: "feat/deleted", resumeSessionId: "uuid-gone" }),
      ctx(),
    );
    expect(result.restoreNotes?.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a repo with no branches without inventing one", () => {
    const result = validateRestoredSlot(
      slot({ branch: "main" }),
      ctx({ branchNames: new Set(), currentBranch: null }),
    );
    expect(result.branch).toBeNull();
  });

  it("only pre-selects conversations for Claude", () => {
    const s = slot({ mode: "Codex", resumeSessionId: "uuid-gone" });
    const result = validateRestoredSlot(s, ctx());
    // Non-Claude modes have no resume picker, so there is nothing to warn about.
    expect(result.resumeSessionId).toBeNull();
    expect(result.restoreNotes).toBeUndefined();
  });
});
