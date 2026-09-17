import { describe, it, expect } from "vitest";

import { fromPaneLayout, toPaneLayout } from "../paneSnapshot";
import { buildGridTree, collectSlotIds, type RestoreAnchor } from "@/components/terminal/splitTree";
import type { SessionSlot } from "@/components/terminal/PreLaunchCard";

function slot(id: string, overrides: Partial<SessionSlot> = {}): SessionSlot {
  return {
    id,
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

describe("toPaneLayout", () => {
  it("never persists a session id", () => {
    const layout = toPaneLayout(
      [slot("a", { sessionId: 42 })],
      buildGridTree(["a"]),
      new Map(),
      {},
    );
    expect(JSON.stringify(layout)).not.toContain("sessionId");
  });

  it("prefers the captured live uuid over the slot's resume target", () => {
    const layout = toPaneLayout(
      [slot("a", { sessionId: 42, resumeSessionId: "old-uuid" })],
      buildGridTree(["a"]),
      new Map(),
      { 42: "live-uuid" },
    );
    expect(layout.slots[0].resumeSessionId).toBe("live-uuid");
  });

  it("falls back to the slot's resume target when nothing was captured", () => {
    const layout = toPaneLayout(
      [slot("a", { sessionId: 42, resumeSessionId: "old-uuid" })],
      buildGridTree(["a"]),
      new Map(),
      {},
    );
    expect(layout.slots[0].resumeSessionId).toBe("old-uuid");
  });

  it("records nothing to resume for an unlaunched slot", () => {
    const layout = toPaneLayout([slot("a")], buildGridTree(["a"]), new Map(), {});
    expect(layout.slots[0].resumeSessionId).toBeNull();
  });

  it("stamps the save time", () => {
    const layout = toPaneLayout(
      [slot("a")],
      buildGridTree(["a"]),
      new Map(),
      {},
      () => "2026-09-17T00:00:00Z",
    );
    expect(layout.savedAt).toBe("2026-09-17T00:00:00Z");
  });

  it("is JSON-serialisable", () => {
    const anchor: RestoreAnchor = {
      siblingSlotId: "a",
      side: 1,
      direction: "vertical",
      ratio: 0.5,
    };
    const layout = toPaneLayout(
      [slot("a"), slot("b")],
      buildGridTree(["a"]),
      new Map([["b", anchor]]),
      {},
    );
    expect(() => JSON.parse(JSON.stringify(layout))).not.toThrow();
  });
});

describe("fromPaneLayout", () => {
  it("returns null for a missing or empty snapshot", () => {
    expect(fromPaneLayout(undefined)).toBeNull();
    expect(fromPaneLayout(null)).toBeNull();
    const empty = toPaneLayout([], buildGridTree(["a"]), new Map(), {});
    expect(fromPaneLayout(empty)).toBeNull();
  });

  it("round-trips slots, tree and minimized set", () => {
    const anchor: RestoreAnchor = {
      siblingSlotId: "a",
      side: 1,
      direction: "vertical",
      ratio: 0.75,
    };
    const layout = toPaneLayout(
      [slot("a", { branch: "feat/x" }), slot("b")],
      buildGridTree(["a"]),
      new Map([["b", anchor]]),
      {},
    );

    const restored = fromPaneLayout(JSON.parse(JSON.stringify(layout)));
    expect(restored).not.toBeNull();
    expect(restored?.slots.map((s) => s.id)).toEqual(["a", "b"]);
    expect(restored?.slots[0].branch).toBe("feat/x");
    expect(collectSlotIds(restored!.tree)).toEqual(["a"]);
    expect(restored?.minimized.get("b")).toEqual(anchor);
  });

  it("preserves a hand-dragged ratio in the tree", () => {
    const layout = toPaneLayout([slot("a"), slot("b")], buildGridTree(["a", "b"]), new Map(), {});
    layout.tree = { ...layout.tree, ratio: 0.8 } as typeof layout.tree;
    const restored = fromPaneLayout(JSON.parse(JSON.stringify(layout)));
    expect(restored!.tree.type === "split" && restored!.tree.ratio).toBe(0.8);
  });

  it("clears every session id", () => {
    const layout = toPaneLayout([slot("a", { sessionId: 42 })], buildGridTree(["a"]), new Map(), {});
    expect(fromPaneLayout(layout)?.slots[0].sessionId).toBeNull();
  });

  it("rebuilds the tree when it disagrees with the slots", () => {
    const layout = toPaneLayout([slot("a"), slot("b")], buildGridTree(["a", "b"]), new Map(), {});
    // A tree referencing a slot that no longer exists must not be trusted.
    layout.slots = layout.slots.filter((s) => s.id === "a");
    const restored = fromPaneLayout(layout);
    expect(collectSlotIds(restored!.tree)).toEqual(["a"]);
  });

  it("treats everything as visible when the snapshot minimized all of them", () => {
    const layout = toPaneLayout([slot("a")], buildGridTree(["a"]), new Map([["a", null]]), {});
    const restored = fromPaneLayout(layout);
    expect(collectSlotIds(restored!.tree)).toEqual(["a"]);
    expect(restored!.minimized.size).toBe(0);
  });
});
