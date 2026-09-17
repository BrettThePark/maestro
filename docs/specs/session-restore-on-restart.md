# Session Restore on Restart

**Status:** approved, not yet implemented
**Date:** 2026-09-17
**Branch:** `custom-v2`
**Touches:** `useWorkspaceStore.ts`, `useSessionStore.ts`, `useActivityStore.ts`, `TerminalGrid.tsx`, `PreLaunchCard.tsx`

---

## Problem

Quitting Maestro loses the shape of your work. `slots` and `layoutTree` are
`TerminalGrid` component state, so on restart a project opens with a single empty
slot: the panes, their arrangement, which branch and worktree each was on, which
MCP servers and plugins were enabled, and — most costly — which Claude
conversation each pane was driving are all gone.

Rebuilding that by hand is slow and error-prone. The conversation is the worst
loss, because it *does* still exist: Claude keeps its transcripts, and Maestro
can already resume one. It just cannot tell you which one you were on.

## Solution overview

Persist a snapshot of each project's panes and restore them on launch as
**pre-launch cards, pre-filled** — nothing relaunches on its own. Each card comes
back with its mode, branch, worktree mode, MCP/skills/plugins selection and the
prior Claude conversation pre-selected in the resume picker, in the original
split layout at the original ratios. One click per pane to resume, or Launch All.

Saved state is validated against reality on restore. Anything that no longer
holds falls back to a safe default and says so on the card.

## What already exists

This is mostly wiring, not new machinery:

| Capability | Where |
|---|---|
| Resume launch (`claude --resume <uuid>`) | `src/lib/terminal.ts:299-306` |
| Per-slot resume picker UI | `PreLaunchCard.tsx:1496-1520` |
| `slot.resumeSessionId` plumbed through launch | `TerminalGrid.tsx:817` |
| Resumable sessions read from Claude's own transcripts | `list_claude_sessions(projectPath)` |
| **The live Claude UUID of a running pane** | `SessionStart` hook → `ClaudeEvent::SessionStarted` → `useActivityStore.ts:87` |
| Per-tab persistence with versioned migration | `useWorkspaceStore.ts:360-378` |
| Projects already reopen in pre-launch state | `onRehydrateStorage` clears `sessionIds`, sets `sessionsLaunched: false` |

The one genuinely missing piece is that the Claude UUID reaches the frontend and
is then discarded.

## Non-goals

- **Auto-launching anything.** Restore produces prepped cards; the user decides.
- **Restoring scrollback.** The PTY is gone. `claude --resume` replays the
  conversation, which is the meaningful half; a dead terminal's pixels are not.
- Restoring panes into a different project than they were in.
- Changing `MAX_SESSIONS`.
- Restoring sessions for AI modes with no resume concept. The resume
  pre-selection is Claude-only, mirroring the existing picker
  (`PreLaunchCard.tsx:1497`). Other modes restore their config but no conversation.

---

## Architecture

### Where the snapshot lives

`slots` and `layoutTree` stay in `TerminalGrid`. Lifting them into a store would
be a large refactor of the most intricate component in the app for no benefit
here. Instead `TerminalGrid` writes a **snapshot** onto its tab:

```ts
/** A pane's configuration, minus everything that cannot outlive the process. */
export interface PersistedSlot {
  id: string;
  mode: AiMode;
  branch: string | null;
  worktreeMode: WorktreeMode;
  /** The worktree this pane was actually running in, preferred over making a new one. */
  worktreePath: string | null;
  enabledMcpServers: string[];
  enabledSkills: string[];
  enabledPlugins: string[];
  /** Claude conversation to pre-select: the captured live UUID, else the one being resumed. */
  resumeSessionId: string | null;
}

export interface PersistedPaneLayout {
  /** When the snapshot was taken. Aids debugging and any future staleness UI. */
  savedAt: string;
  slots: PersistedSlot[];
  /** `layoutTree` verbatim — already plain JSON-serialisable objects. */
  tree: TreeNode;
  /** Minimized panes and how to put each one back. */
  minimized: Array<[string, RestoreAnchor | null]>;
}
```

`sessionId`, `worktreeWarning` and `restoreNotes` are deliberately absent: the
first cannot survive a restart, the other two are recomputed.

This hangs off `WorkspaceTab` as `paneLayout?: PersistedPaneLayout`, riding the
`partialize: (state) => ({ tabs: state.tabs })` that already persists tabs.

**Migration: `version: 4` → `5`.** Tabs without `paneLayout` get `undefined`,
which restores exactly today's behaviour.

### Write trigger

A debounced effect (500ms) in `TerminalGrid` writes the snapshot whenever
`slots`, `layoutTree` or `minimized` change. Debouncing is not optional:
dragging a divider fires `onRatioChange` continuously, and each write goes
through the Tauri LazyStore to disk.

### Capturing the Claude UUID

`useSessionStore` gains:

```ts
/** Claude's own conversation UUID per Maestro session, learned from the SessionStart hook. */
claudeUuidBySession: Record<number, string>;
setClaudeUuid: (sessionId: number, uuid: string) => void;
```

Fed from the `claude-event` listener that already runs
(`useActivityStore.ts:87`): on a `SessionStarted` event, record
`claude_session_uuid` against `session_id`.

A slot's persisted resume target is `claudeUuidBySession[slot.sessionId] ??
slot.resumeSessionId` — the captured live UUID when there is one, otherwise
whatever the pane was launched to resume.

### Restore

`TerminalGrid` initializes from `tab.paneLayout` when present, with every slot's
`sessionId` set to `null`. There is no rehydration race: tabs come from the
persisted store already carrying their layout, so a tab either arrives complete
or is brand new and gets today's single empty slot.

If `paneLayout.slots` is empty, or the tree references no live slot, fall back to
a single empty slot rather than rendering an empty grid.

### Validation

Runs async after mount and patches the cards. No new Tauri command is needed —
every check uses an API already present:

| Piece | Checked against | On failure |
|---|---|---|
| `branch` | `branches` (already fetched by `TerminalGrid`) | fall back to current branch, note it |
| `worktreePath` / `worktreeMode` | `hasWorktree` on `BranchWithWorktreeStatus`, `listWorktrees` | fall back to `"project"` mode, note it |
| `resumeSessionId` | `list_claude_sessions(projectPath)` — one call per project | clear the pre-selection, note it |
| `enabledMcpServers` | `useMcpStore` | drop unknown names, note the count |
| `enabledSkills` / `enabledPlugins` | `usePluginStore` | drop unknown ids, note the count |

The rule: **a restored card never silently misrepresents itself.** Launching
against a branch that no longer exists, or a worktree the user deleted, is worse
than saying so.

### UI

`SessionSlot` gains `restoreNotes?: string[]`, rendered as a small warning block
in `PreLaunchCard`. Everything else is existing UI: the resume picker already
renders a pre-selected session and the launch button already reads "Resume
Session" when `slot.resumeSessionId` is set (`PreLaunchCard.tsx:1570`).

Notes are cleared as soon as the user edits the field they refer to — a note
about a missing branch is noise once a branch has been chosen.

---

## Testing

**Unit (pure functions, the `splitTree` pattern):**
- Snapshot round-trip: slots + tree + minimized serialize and restore identically,
  including hand-dragged ratios.
- `sessionId` is never persisted and is always `null` after restore.
- Resume target prefers the captured UUID over `slot.resumeSessionId`.
- Validation reducer: each of the five failure rows above, asserting both the
  fallback value and the note.
- Empty/garbage snapshot falls back to a single empty slot.
- Migration from a v4 tab with no `paneLayout`.

**Manual — required, not optional:**
1. Launch 3 sessions across a custom split, one minimized, one on a worktree
   branch. Quit. Restart.
2. Cards return in the same arrangement, pre-filled, with the right conversation
   pre-selected on each.
3. Click Resume on one → **Claude picks up the prior conversation**, not a new one.
   This is the whole point of the feature and nothing else proves it.
4. Delete a branch before restarting → its card falls back and says so.
5. Minimized pane returns minimized.

---

## Relationship to the previous spec

`docs/specs/session-window-handling.md` lists "surviving app restart" as a
non-goal, on the grounds that layout was already ephemeral. This spec
deliberately reverses that. That document will be amended to point here so the
two do not contradict each other.
