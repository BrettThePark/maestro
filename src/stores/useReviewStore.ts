import { create } from "zustand";

import {
  useSessionStore,
  type BackendSessionStatus,
  type SessionConfig,
} from "./useSessionStore";

/** Statuses that mean the agent is mid-turn — work the user hasn't been handed back yet. */
const ACTIVE_STATUSES: ReadonlySet<BackendSessionStatus> = new Set<BackendSessionStatus>([
  "Working",
  "NeedsInput",
]);

/** Statuses that mean the agent has handed control back and its output is sitting there. */
const SETTLED_STATUSES: ReadonlySet<BackendSessionStatus> = new Set<BackendSessionStatus>([
  "Idle",
  "Done",
  "Error",
  "Timeout",
]);

/**
 * Folds a session-list change into the set of unreviewed session IDs.
 *
 * A session becomes unreviewed when it settles after having been active — that is
 * the "produced output, then went quiet" moment the dock badge exists to surface.
 * A session that reaches "Idle" straight from "Starting" never worked, so it is
 * not something to review. IDs of sessions that have disappeared are dropped.
 *
 * Returns the original set when nothing changed so zustand subscribers can skip
 * re-rendering on identity.
 */
export function reconcileUnreviewed(
  unreviewed: ReadonlySet<number>,
  prev: readonly SessionConfig[],
  next: readonly SessionConfig[],
): ReadonlySet<number> {
  const previousStatus = new Map(prev.map((s) => [s.id, s.status]));
  const liveIds = new Set(next.map((s) => s.id));

  let changed = false;
  const result = new Set<number>();

  for (const id of unreviewed) {
    if (liveIds.has(id)) {
      result.add(id);
    } else {
      changed = true;
    }
  }

  for (const s of next) {
    const before = previousStatus.get(s.id);
    if (
      before !== undefined &&
      ACTIVE_STATUSES.has(before) &&
      SETTLED_STATUSES.has(s.status) &&
      !result.has(s.id)
    ) {
      result.add(s.id);
      changed = true;
    }
  }

  return changed ? result : unreviewed;
}

/**
 * Number of sessions wanting the user's attention: those still asking a question,
 * plus those that finished without being looked at. A session in both groups counts once.
 */
export function computeAttentionCount(
  sessions: readonly SessionConfig[],
  unreviewed: ReadonlySet<number>,
): number {
  return sessions.filter((s) => s.status === "NeedsInput" || unreviewed.has(s.id)).length;
}

/**
 * Tracks which finished sessions the user has not looked at yet.
 *
 * Sessions land here on their own (see `initReviewTracking`) and leave when the
 * user focuses their pane. `useDockBadge` turns this into the macOS dock badge.
 */
interface ReviewState {
  unreviewed: ReadonlySet<number>;
  /** Called when the user focuses a session's pane — drops it from the badge count. */
  markReviewed: (sessionId: number) => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  unreviewed: new Set<number>(),

  markReviewed: (sessionId: number) => {
    set((state) => {
      // Returning the identical state keeps subscribers quiet, so the focus effect
      // that calls this can safely depend on `unreviewed` without looping.
      if (!state.unreviewed.has(sessionId)) return state;
      const next = new Set(state.unreviewed);
      next.delete(sessionId);
      return { unreviewed: next };
    });
  },
}));

/**
 * Subscribes to the session store and folds every status change into the unreviewed set.
 *
 * Listening to the store rather than the Tauri event covers both paths that write
 * status: the `session-status-changed` listener and `updateSession` from the
 * terminal's own heuristics. Returns an unsubscribe function.
 */
export function initReviewTracking(): () => void {
  return useSessionStore.subscribe((state, prevState) => {
    if (state.sessions === prevState.sessions) return;
    const current = useReviewStore.getState().unreviewed;
    const next = reconcileUnreviewed(current, prevState.sessions, state.sessions);
    if (next !== current) {
      useReviewStore.setState({ unreviewed: next });
    }
  });
}
