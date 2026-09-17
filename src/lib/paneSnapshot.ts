import {
  buildGridTree,
  collectSlotIds,
  type RestoreAnchor,
  type TreeNode,
} from "@/components/terminal/splitTree";
import type { SessionSlot, WorktreeMode } from "@/components/terminal/PreLaunchCard";
import type { AiMode } from "@/stores/useSessionStore";

/**
 * A pane's configuration, minus everything that cannot outlive the process.
 *
 * `sessionId` is deliberately absent rather than nulled: a PTY never survives a
 * restart, and persisting the field at all invites someone to trust it.
 * `worktreeWarning` and `restoreNotes` are absent because both are recomputed.
 */
export interface PersistedSlot {
  id: string;
  mode: AiMode;
  branch: string | null;
  worktreeMode: WorktreeMode;
  /** The worktree this pane actually ran in, preferred over minting a new one. */
  worktreePath: string | null;
  enabledMcpServers: string[];
  enabledSkills: string[];
  enabledPlugins: string[];
  /** Claude conversation to pre-select on restore. */
  resumeSessionId: string | null;
}

/** A project's pane arrangement as stored on its tab. */
export interface PersistedPaneLayout {
  savedAt: string;
  slots: PersistedSlot[];
  /** `layoutTree` verbatim — already plain JSON-serialisable objects. */
  tree: TreeNode;
  /** Minimized panes and how to put each one back. */
  minimized: Array<[string, RestoreAnchor | null]>;
}

/** Live pane state rebuilt from a snapshot. */
export interface RestoredPanes {
  slots: SessionSlot[];
  tree: TreeNode;
  minimized: Map<string, RestoreAnchor | null>;
}

/**
 * Snapshot the current panes for persistence.
 *
 * A slot's resume target prefers the UUID captured from the SessionStart hook
 * over whatever the pane was launched to resume: if the user resumed
 * conversation A and Claude then forked to B, B is what they are actually
 * looking at, and B is what should come back.
 */
export function toPaneLayout(
  slots: readonly SessionSlot[],
  tree: TreeNode,
  minimized: ReadonlyMap<string, RestoreAnchor | null>,
  claudeUuidBySession: Readonly<Record<number, string>>,
  now: () => string = () => new Date().toISOString(),
): PersistedPaneLayout {
  return {
    savedAt: now(),
    slots: slots.map((s) => ({
      id: s.id,
      mode: s.mode,
      branch: s.branch,
      worktreeMode: s.worktreeMode,
      worktreePath: s.worktreePath,
      enabledMcpServers: [...s.enabledMcpServers],
      enabledSkills: [...s.enabledSkills],
      enabledPlugins: [...s.enabledPlugins],
      resumeSessionId:
        (s.sessionId != null ? claudeUuidBySession[s.sessionId] : undefined) ??
        s.resumeSessionId ??
        null,
    })),
    tree,
    minimized: [...minimized.entries()],
  };
}

/**
 * Rebuild live pane state from a snapshot, or `null` when there is nothing
 * worth restoring — the caller then falls back to a single empty slot.
 *
 * The tree is only trusted when it covers exactly the visible slots. A snapshot
 * whose tree and slot list disagree is the shape a partial write or a hand-edit
 * would leave, and rendering it would produce panes referencing slots that do
 * not exist.
 */
export function fromPaneLayout(
  layout: PersistedPaneLayout | null | undefined,
): RestoredPanes | null {
  if (!layout || layout.slots.length === 0) return null;

  const slots: SessionSlot[] = layout.slots.map((s) => ({
    id: s.id,
    mode: s.mode,
    branch: s.branch,
    worktreeMode: s.worktreeMode,
    sessionId: null,
    worktreePath: s.worktreePath,
    worktreeWarning: null,
    enabledMcpServers: [...s.enabledMcpServers],
    enabledSkills: [...s.enabledSkills],
    enabledPlugins: [...s.enabledPlugins],
    resumeSessionId: s.resumeSessionId,
  }));

  const slotIds = new Set(slots.map((s) => s.id));
  const minimized = new Map(layout.minimized.filter(([id]) => slotIds.has(id)));

  let visibleIds = slots.map((s) => s.id).filter((id) => !minimized.has(id));
  // Every pane minimized would render an empty grid with no way back, so treat
  // that degenerate snapshot as "nothing was minimized".
  if (visibleIds.length === 0) {
    minimized.clear();
    visibleIds = slots.map((s) => s.id);
  }

  const treeIds = collectSlotIds(layout.tree);
  const matches =
    treeIds.length === visibleIds.length && treeIds.every((id) => visibleIds.includes(id));

  return {
    slots,
    tree: matches ? layout.tree : buildGridTree(visibleIds),
    minimized,
  };
}
