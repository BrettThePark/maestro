# Session Window Handling — Minimize and Soft-Zoom

**Status:** approved, not yet implemented
**Date:** 2026-09-09
**Branch:** `custom-v2`
**Touches:** `splitTree.ts`, `TerminalGrid.tsx`, `TerminalHeader.tsx`, `TerminalView.tsx`

---

## Problem

With up to six sessions in a grid, every pane is small and every pane is equal.
Two things are missing:

1. **No way to set a session aside.** A session you are not currently reading
   still takes its full share of the grid. Closing it is the only way to reclaim
   the space, which kills the PTY and its scrollback.
2. **No way to lean into one session** without the all-or-nothing full-screen
   zoom, which hides every other session's output. Dragging dividers by hand
   works but has to be undone by hand too.

## Solution overview

Two features, plus a defensive fix.

- **Minimize** — a session leaves the grid and becomes a tab in a strip along the
  bottom of the project's grid area. The PTY keeps running and the xterm stays
  alive. Clicking the tab returns the pane to where it was.
- **Soft-zoom** — one pane per project grows to a larger share of the grid by
  moving the divider ratios, exactly as if the dividers had been dragged. The
  rows and columns keep their shape. Only one pane can be soft-zoomed at a time,
  so clicking the button on another pane moves the enlargement to it.
- **PTY resize guard** — `term.onResize` currently forwards dimensions to
  `resizePty` unchecked. Minimize detaches a terminal's container from the DOM,
  so this needs a floor before that path can be trusted.

The existing full-screen zoom (`zoomedSlotId`) is unchanged and remains a
separate, third thing.

## Non-goals

- Surviving app restart. `layoutTree` and `slots` are already `TerminalGrid`
  component state; only the `tabs` array is persisted (`useWorkspaceStore.ts:362`).
  Minimized and soft-zoomed state is ephemeral for the same reason the layout is.
- Minimizing a session into a different project's strip.
- Drag-to-reorder within the minimized strip.
- Raising `MAX_SESSIONS`. A minimized session holds a live PTY and still counts
  against the limit of 6.

---

## Architecture

### The derived display tree

`layoutTree` remains the single source of truth for the layout the user built.
**Neither feature mutates it.** The grid renders a derived tree:

```
displayTree = applySoftZoom(hideMinimized(layoutTree, minimized), softZoomedSlotId)
```

Both transforms are pure functions exported from `splitTree.ts`.

Rationale: reversibility. If soft-zoom wrote ratios into `layoutTree` via
`updateRatio`, an enlarged pane would be indistinguishable from ratios the user
dragged, so un-zooming would need a snapshot to restore — and a subsequent
minimize would fold the zoom's ratios into the "real" layout permanently. Keeping
the source of truth clean means un-zoom and restore are just *stopping* a
transform. It also matches the established pattern in this codebase: pure,
separately-tested reducers (`reconcileUnreviewed` in `useReviewStore.ts`).

Node IDs are preserved through both transforms, so `SplitPaneView`'s
`onRatioChange(nodeId, ratio)` still resolves against a real `layoutTree` node.

### New state in `TerminalGrid`

Alongside the existing `zoomedSlotId`:

```ts
/** Slots currently in the minimized strip, with where to put each one back. */
const [minimized, setMinimized] = useState<Map<string, RestoreAnchor>>(new Map());

/** The one soft-zoomed slot, if any. Cleared when its pane is minimized or closed. */
const [softZoomedSlotId, setSoftZoomedSlotId] = useState<string | null>(null);
```

---

## Feature 1: Soft-zoom

### Sizing rule

Per axis, independently:

- Every **other** pane keeps at least **20%** of the window on that axis.
- The **focused** pane takes at most **70%** of the window on that axis.

The floor is what makes the rule self-limiting: it tightens automatically as pane
count grows, so no per-layout tuning constant is needed.

### Algorithm

For each axis (vertical dividers govern width, horizontal govern height):

1. Collect the path dividers of that axis from **root to the focused leaf**.
2. Walk them root-outward, maintaining the accumulated product `A` of shares
   granted so far. At each divider, the off-path subtree's smallest relative
   extent on this axis is `m`. Grant the focused side:

   ```
   r = min( 1 - FLOOR / (A * m),  MAX_RATIO )
   ```

   never below the divider's current ratio — soft-zoom must not shrink a pane.
3. If the final product exceeds `CEILING`, scale back so it lands exactly on it.

Walking greedily from the root matters. Distributing the boost evenly across path
dividers double-squeezes any leaf that sits beneath two of them: in a 3-wide row
(`split(split(a,b), c)`), even distribution drives `b` under the floor and forces
the whole result down to ~52% width, where greedy-from-root reaches 60%.

`FLOOR = 0.20`, `CEILING = 0.70`, `MAX_RATIO = 0.85` (already in `SplitPaneView`).

### Expected results — use these as test cases

| Layout | Width | Height | Area | Binding constraint |
|---|---|---|---|---|
| 2 panes side by side | 0.70 | 1.00 | 70% | ceiling |
| 2×2 grid | 0.70 | 0.70 | 49% | ceiling on both axes |
| 6 panes (3 cols × 2 rows) | 0.60 | 0.70 | 42% | floor on width, ceiling on height |

The 6-pane width of 0.60 arises because the outer divider can grant at most 0.80
(far column keeps 0.20) and the inner at most 0.75 (middle column keeps
0.80 × 0.20 = 0.20): 0.80 × 0.75 = 0.60.

### Interactions

- Clicking soft-zoom on another pane moves the enlargement; clicking it on the
  currently soft-zoomed pane clears it.
- **Dragging a divider that soft-zoom is overriding clears the soft-zoom** and
  writes the drag through to `layoutTree`. The user's hands win over the transform.
- Minimizing or closing the soft-zoomed pane clears `softZoomedSlotId`.
- Full-screen zoom is orthogonal: it overlays, and the ratios underneath are
  untouched.

---

## Feature 2: Minimize and restore

### Restore anchor

Captured **before** the leaf is removed:

```ts
interface RestoreAnchor {
  /** A slot in the sibling subtree, used to find the reinsertion point. */
  siblingSlotId: string;
  /** Which child index the minimized leaf occupied (0 or 1). */
  side: 0 | 1;
  direction: SplitDirection;
  /** The parent split's ratio at the time of minimizing. */
  ratio: number;
}
```

Restore reinserts the leaf beside `siblingSlotId` on the recorded side at the
recorded ratio, so a layout the user hand-tuned comes back as it was. If
`siblingSlotId` is no longer in the tree — closed or minimized in the meantime —
fall back to `buildGridTree` over the visible slots plus the restored one, which
is what **Add Session** already does (`TerminalGrid.tsx:1244`).

### New `splitTree.ts` primitive

`splitLeaf` always appends the new leaf as `children[1]`. Restore needs to place
on either side at a specified ratio:

```ts
export function insertLeafBeside(
  tree: TreeNode,
  targetSlotId: string,
  newSlotId: string,
  direction: SplitDirection,
  side: 0 | 1,
  ratio: number,
): TreeNode
```

### Container lifetime

Each slot already owns a persistent detached container div
(`terminalContainersRef`), parked into the grid by `PlaceholderLeaf` and adopted
by the zoom overlay when zoomed. A minimized slot simply has no `PlaceholderLeaf`
rendering it, so its container stays detached and its xterm is never unmounted —
the same invariant that `b5c53da` established for zoom.

### The strip

Rendered at the bottom of the grid area inside `TerminalGrid`, above the app-level
`BottomBar`. Height collapses to zero when nothing is minimized. Each tab shows
the session name and an attention dot sourced from `useReviewStore` — a session
that finished while minimized is exactly the case that badge exists to surface.

---

## Feature 3: PTY resize guard

`TerminalView.tsx:533`:

```ts
resizeDisposable = term.onResize(({ rows, cols }) => {
  resizePty(sessionId, rows, cols).catch(console.error);
});
```

`safeFit()` already swallows fit failures and the `ResizeObserver` refits on
reattach, so a detached terminal should never produce a resize. Should is not a
guarantee, and a 0-column resize sent to a live PTY reflows the agent's output
irrecoverably. Add a floor:

```ts
if (cols < 2 || rows < 2) return;
```

This is a precondition for trusting minimize, not an optional extra.

---

## Testing

Pure functions, `vitest`, alongside the existing suite (97 tests, all passing).

**`splitTree` soft-zoom:**
- The three layouts in the results table above, asserting computed leaf extents.
- Floor is respected: no non-focused leaf drops below 0.20 on either axis.
- Ceiling is respected: the focused leaf never exceeds 0.70 on either axis.
- Greedy-from-root beats even distribution in the 3-wide row (regression guard
  against someone "simplifying" it later).
- A pane already larger than its computed target is left alone, not shrunk.

**`splitTree` insert/remove:**
- Minimize-then-restore round-trips to the identical tree, including a
  hand-dragged ratio.
- Sibling-gone falls back to a balanced rebuild.
- `insertLeafBeside` honours both sides and the given ratio.

**Manual verification (cannot be unit-tested):**
- Minimize a session mid-output, wait, restore — scrollback intact, output
  continued while minimized, no reflow damage.
- Soft-zoom, then drag one of its dividers — zoom releases, drag sticks.

---

## Implementation order

1. PTY resize guard — standalone, unblocks trusting the rest.
2. `splitTree` pure functions with tests — no UI.
3. Soft-zoom wiring: state, derived tree, header button.
4. Minimize wiring: state, anchors, header button.
5. The strip UI.

Steps 3 and 4 are independent of one another once step 2 lands.
