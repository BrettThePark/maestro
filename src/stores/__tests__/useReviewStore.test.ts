import { beforeEach, describe, it, expect } from "vitest";

import { computeAttentionCount, initReviewTracking, reconcileUnreviewed, useReviewStore } from "../useReviewStore";
import { useSessionStore, type BackendSessionStatus, type SessionConfig } from "../useSessionStore";

/** Minimal session fixture — only `id` and `status` matter to the review logic. */
function session(id: number, status: BackendSessionStatus): SessionConfig {
  return {
    id,
    mode: "Claude",
    branch: null,
    status,
    worktree_path: null,
    project_path: "/repo",
  };
}

describe("reconcileUnreviewed", () => {
  it("marks a session unreviewed when it settles after working", () => {
    const result = reconcileUnreviewed(
      new Set(),
      [session(1, "Working")],
      [session(1, "Idle")],
    );

    expect([...result]).toEqual([1]);
  });

  it("marks a session unreviewed when it settles after needing input", () => {
    const result = reconcileUnreviewed(
      new Set(),
      [session(1, "NeedsInput")],
      [session(1, "Done")],
    );

    expect([...result]).toEqual([1]);
  });

  it.each<BackendSessionStatus>(["Idle", "Done", "Error", "Timeout"])(
    "treats %s as a settled status",
    (settled) => {
      const result = reconcileUnreviewed(
        new Set(),
        [session(1, "Working")],
        [session(1, settled)],
      );

      expect([...result]).toEqual([1]);
    },
  );

  it("ignores a session that goes idle without ever working", () => {
    const result = reconcileUnreviewed(
      new Set(),
      [session(1, "Starting")],
      [session(1, "Idle")],
    );

    expect([...result]).toEqual([]);
  });

  it("ignores a session that is still working", () => {
    const result = reconcileUnreviewed(
      new Set(),
      [session(1, "Working")],
      [session(1, "NeedsInput")],
    );

    expect([...result]).toEqual([]);
  });

  it("drops sessions that no longer exist", () => {
    const result = reconcileUnreviewed(new Set([1, 2]), [session(2, "Idle")], [session(2, "Idle")]);

    expect([...result]).toEqual([2]);
  });

  it("returns the same set instance when nothing changed", () => {
    const unreviewed = new Set([1]);

    const result = reconcileUnreviewed(unreviewed, [session(1, "Idle")], [session(1, "Idle")]);

    expect(result).toBe(unreviewed);
  });
});

describe("computeAttentionCount", () => {
  it("counts sessions that are still waiting on the user", () => {
    const count = computeAttentionCount([session(1, "NeedsInput"), session(2, "Working")], new Set());

    expect(count).toBe(1);
  });

  it("counts settled sessions the user has not reviewed", () => {
    const count = computeAttentionCount([session(1, "Idle"), session(2, "Idle")], new Set([1]));

    expect(count).toBe(1);
  });

  it("counts a session needing input and unreviewed only once", () => {
    const count = computeAttentionCount([session(1, "NeedsInput")], new Set([1]));

    expect(count).toBe(1);
  });

  it("ignores unreviewed IDs with no matching session", () => {
    const count = computeAttentionCount([session(1, "Idle")], new Set([99]));

    expect(count).toBe(0);
  });
});

describe("useReviewStore", () => {
  beforeEach(() => {
    useReviewStore.setState({ unreviewed: new Set() });
    useSessionStore.setState({ sessions: [] });
  });

  it("clears a session once it has been reviewed", () => {
    useReviewStore.setState({ unreviewed: new Set([1, 2]) });

    useReviewStore.getState().markReviewed(1);

    expect([...useReviewStore.getState().unreviewed]).toEqual([2]);
  });

  it("leaves state untouched when reviewing a session that was not pending", () => {
    const before = useReviewStore.getState().unreviewed;

    useReviewStore.getState().markReviewed(99);

    expect(useReviewStore.getState().unreviewed).toBe(before);
  });
});

describe("initReviewTracking", () => {
  beforeEach(() => {
    useReviewStore.setState({ unreviewed: new Set() });
    useSessionStore.setState({ sessions: [session(1, "Working")] });
  });

  it("marks sessions unreviewed as the session store settles them", () => {
    const stop = initReviewTracking();

    useSessionStore.setState({ sessions: [session(1, "Idle")] });

    expect([...useReviewStore.getState().unreviewed]).toEqual([1]);
    stop();
  });

  it("stops tracking once unsubscribed", () => {
    const stop = initReviewTracking();
    stop();

    useSessionStore.setState({ sessions: [session(1, "Idle")] });

    expect([...useReviewStore.getState().unreviewed]).toEqual([]);
  });
});
