/**
 * Binary split tree for iTerm2-style terminal pane layouts.
 *
 * The tree is immutable — every mutation returns a new tree.
 * Leaf nodes map to session slots; split nodes define how two
 * children are arranged (horizontal = stacked, vertical = side-by-side).
 */

export type SplitDirection = "horizontal" | "vertical";

export interface LeafNode {
  type: "leaf";
  id: string;
  slotId: string;
}

export interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  children: [TreeNode, TreeNode];
  /** First child's share of the available space (0.0–1.0). */
  ratio: number;
}

export type TreeNode = LeafNode | SplitNode;

let _nextId = 0;
function uid(): string {
  return `node-${Date.now()}-${++_nextId}`;
}

/** Create a new leaf node for the given slot. */
export function createLeaf(slotId: string): LeafNode {
  return { type: "leaf", id: uid(), slotId };
}

/**
 * Split an existing leaf into a SplitNode containing the original leaf
 * and a new leaf for `newSlotId`.
 *
 * Returns the original tree unchanged if `targetSlotId` is not found.
 */
export function splitLeaf(
  tree: TreeNode,
  targetSlotId: string,
  newSlotId: string,
  direction: SplitDirection,
): TreeNode {
  if (tree.type === "leaf") {
    if (tree.slotId === targetSlotId) {
      return {
        type: "split",
        id: uid(),
        direction,
        children: [tree, createLeaf(newSlotId)],
        ratio: 0.5,
      };
    }
    return tree;
  }

  // Recurse into split children
  const [left, right] = tree.children;
  const newLeft = splitLeaf(left, targetSlotId, newSlotId, direction);
  const newRight = splitLeaf(right, targetSlotId, newSlotId, direction);

  if (newLeft === left && newRight === right) return tree; // no change
  return { ...tree, children: [newLeft, newRight] };
}

/**
 * Remove a leaf from the tree.
 *
 * When a leaf is removed, its sibling is promoted to replace the parent
 * SplitNode. Returns `null` if the root itself is the removed leaf.
 */
export function removeLeaf(tree: TreeNode, slotId: string): TreeNode | null {
  if (tree.type === "leaf") {
    return tree.slotId === slotId ? null : tree;
  }

  const [left, right] = tree.children;

  // Check if either direct child is the target leaf
  if (left.type === "leaf" && left.slotId === slotId) return right;
  if (right.type === "leaf" && right.slotId === slotId) return left;

  // Recurse
  const newLeft = removeLeaf(left, slotId);
  const newRight = removeLeaf(right, slotId);

  // If a subtree collapsed, promote the surviving node
  if (newLeft === null) return newRight;
  if (newRight === null) return newLeft;

  if (newLeft === left && newRight === right) return tree; // no change
  return { ...tree, children: [newLeft, newRight] };
}

/** Update the ratio for a specific split node. */
export function updateRatio(tree: TreeNode, nodeId: string, ratio: number): TreeNode {
  if (tree.type === "leaf") return tree;

  if (tree.id === nodeId) {
    return { ...tree, ratio };
  }

  const [left, right] = tree.children;
  const newLeft = updateRatio(left, nodeId, ratio);
  const newRight = updateRatio(right, nodeId, ratio);

  if (newLeft === left && newRight === right) return tree;
  return { ...tree, children: [newLeft, newRight] };
}

/**
 * Collect all slot IDs in depth-first order (left-to-right, top-to-bottom).
 * This defines the Cmd+1-9 ordering.
 */
export function collectSlotIds(tree: TreeNode): string[] {
  if (tree.type === "leaf") return [tree.slotId];
  const [left, right] = tree.children;
  return [...collectSlotIds(left), ...collectSlotIds(right)];
}

/**
 * Returns grid dimensions matching the old CSS grid layout:
 * 1→1x1, 2→2x1, 3→3x1, 4→2x2, 5-6→3x2, 7-9→3x3
 */
export function gridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/**
 * Recursively builds a balanced binary split tree from an array of nodes
 * along one axis. The ratio is proportional so each leaf gets equal space.
 */
export function buildBalancedSplit(nodes: TreeNode[], direction: SplitDirection): TreeNode {
  if (nodes.length === 1) return nodes[0];
  const mid = Math.ceil(nodes.length / 2);
  const left = buildBalancedSplit(nodes.slice(0, mid), direction);
  const right = buildBalancedSplit(nodes.slice(mid), direction);
  return {
    type: "split",
    id: uid(),
    direction,
    children: [left, right],
    ratio: mid / nodes.length,
  };
}

/**
 * Builds a 2D grid tree from slot IDs matching the old CSS grid layout.
 * Each row is a balanced vertical (side-by-side) split, then rows are
 * stacked with horizontal splits.
 */
export function buildGridTree(slotIds: string[]): TreeNode {
  if (slotIds.length === 0) return createLeaf("empty");
  if (slotIds.length === 1) return createLeaf(slotIds[0]);

  const { cols, rows } = gridDimensions(slotIds.length);

  // Distribute slots into rows (cols per row, last row may have fewer)
  const rowNodes: TreeNode[] = [];
  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    const end = Math.min(start + cols, slotIds.length);
    const rowSlots = slotIds.slice(start, end);
    const rowLeaves = rowSlots.map(createLeaf);
    rowNodes.push(buildBalancedSplit(rowLeaves, "vertical"));
  }

  // Stack rows with horizontal splits
  return buildBalancedSplit(rowNodes, "horizontal");
}

/**
 * Find the sibling slot ID of a given slot in the tree.
 * Returns null if the slot is the root or not found.
 */
export function findSiblingSlotId(tree: TreeNode, slotId: string): string | null {
  if (tree.type === "leaf") return null;

  const [left, right] = tree.children;

  // Check if the target is a direct child
  if (left.type === "leaf" && left.slotId === slotId) {
    // Return first leaf of sibling subtree
    const ids = collectSlotIds(right);
    return ids[0] ?? null;
  }
  if (right.type === "leaf" && right.slotId === slotId) {
    const ids = collectSlotIds(left);
    return ids[0] ?? null;
  }

  // Recurse
  return findSiblingSlotId(left, slotId) ?? findSiblingSlotId(right, slotId);
}

/** A leaf's share of the whole tree, as fractions of total width and height. */
export interface LeafExtent {
  slotId: string;
  width: number;
  height: number;
}

/**
 * Compute every leaf's fractional width and height.
 *
 * Sizes compound down the tree, so a leaf nested under two vertical dividers
 * is narrower than its immediate ratio suggests. Soft-zoom's floor check needs
 * these final numbers rather than per-divider ratios, which is the whole reason
 * this exists.
 */
export function leafExtents(tree: TreeNode, width = 1, height = 1): LeafExtent[] {
  if (tree.type === "leaf") {
    return [{ slotId: tree.slotId, width, height }];
  }

  const [first, second] = tree.children;
  if (tree.direction === "vertical") {
    return [
      ...leafExtents(first, width * tree.ratio, height),
      ...leafExtents(second, width * (1 - tree.ratio), height),
    ];
  }
  return [
    ...leafExtents(first, width, height * tree.ratio),
    ...leafExtents(second, width, height * (1 - tree.ratio)),
  ];
}

/** One divider on the way to a leaf, and which side of it the leaf is on. */
export interface PathStep {
  node: SplitNode;
  childIndex: 0 | 1;
}

/**
 * The dividers between the root and `slotId`, root-first.
 *
 * Root-first order matters: soft-zoom grants space greedily from the root
 * outward, because spending the outer dividers first leaves more room for the
 * inner ones (see `applySoftZoom`).
 *
 * Returns `null` when the slot is not in the tree, `[]` when it is the root.
 */
export function findPath(tree: TreeNode, slotId: string): PathStep[] | null {
  if (tree.type === "leaf") {
    return tree.slotId === slotId ? [] : null;
  }

  for (const childIndex of [0, 1] as const) {
    const sub = findPath(tree.children[childIndex], slotId);
    if (sub !== null) {
      return [{ node: tree, childIndex }, ...sub];
    }
  }
  return null;
}

/** No pane other than the soft-zoomed one may fall below this share of an axis. */
export const SOFT_ZOOM_FLOOR = 0.2;

/** The soft-zoomed pane may not exceed this share of an axis. */
export const SOFT_ZOOM_CEILING = 0.7;

/** Matches the clamp SplitPaneView applies to hand-dragged dividers. */
const SOFT_ZOOM_MAX_RATIO = 0.85;

/** Rewrite one divider's ratio so `childIndex` receives `share` of the space. */
function setShare(
  tree: TreeNode,
  nodeId: string,
  childIndex: 0 | 1,
  share: number,
): TreeNode {
  if (tree.type === "leaf") return tree;

  if (tree.id === nodeId) {
    return { ...tree, ratio: childIndex === 0 ? share : 1 - share };
  }

  const [left, right] = tree.children;
  const newLeft = setShare(left, nodeId, childIndex, share);
  const newRight = setShare(right, nodeId, childIndex, share);
  if (newLeft === left && newRight === right) return tree;
  return { ...tree, children: [newLeft, newRight] };
}

/** Whether every pane still fits between the floor and the ceiling on `axis`. */
function withinBounds(tree: TreeNode, slotId: string, axis: "width" | "height"): boolean {
  for (const extent of leafExtents(tree)) {
    if (extent.slotId === slotId) {
      if (extent[axis] > SOFT_ZOOM_CEILING + 1e-9) return false;
    } else if (extent[axis] < SOFT_ZOOM_FLOOR - 1e-9) {
      return false;
    }
  }
  return true;
}

/**
 * Enlarge one pane by moving only the dividers on its own path to the root.
 *
 * The rows and columns keep their shape — this is the state the user would
 * reach by dragging those same dividers by hand, which is the point: it reads
 * as a layout they could have made, not a special mode.
 *
 * Dividers are spent greedily from the root outward. Spreading the growth
 * evenly instead would squeeze any pane sitting under two path dividers twice
 * over, hitting the floor sooner and yielding a smaller result.
 *
 * Each divider is solved by bisection rather than algebra. The constraint is on
 * every *other* pane's final size, which compounds through the whole tree, so
 * searching against `leafExtents` states the rule directly instead of
 * re-deriving it per tree shape. Six leaves and 40 probes is nothing.
 *
 * Returns the input tree unchanged when there is nothing to do, so React
 * identity checks downstream stay cheap.
 */
export function applySoftZoom(tree: TreeNode, slotId: string | null): TreeNode {
  if (!slotId) return tree;

  const path = findPath(tree, slotId);
  if (path === null || path.length === 0) return tree;

  let result = tree;

  for (const axis of ["width", "height"] as const) {
    const direction: SplitDirection = axis === "width" ? "vertical" : "horizontal";

    for (const step of path) {
      if (step.node.direction !== direction) continue;

      // Ratios are the first child's share, so read the current share from the
      // side our leaf is actually on.
      const current =
        step.childIndex === 0 ? step.node.ratio : 1 - step.node.ratio;

      // Bisect for the largest share that keeps every pane in bounds. Starting
      // the search at `current` is what stops a soft-zoom from ever shrinking a
      // pane the user had already dragged wider.
      let lo = current;
      let hi = SOFT_ZOOM_MAX_RATIO;
      let best = current;

      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const candidate = setShare(result, step.node.id, step.childIndex, mid);
        if (withinBounds(candidate, slotId, axis)) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      if (best !== current) {
        result = setShare(result, step.node.id, step.childIndex, best);
      }
    }
  }

  return result;
}

/**
 * Everything needed to put a minimized pane back where it was.
 *
 * Recorded against a neighbour slot rather than a node id, because the parent
 * SplitNode ceases to exist the moment the leaf is removed — `removeLeaf`
 * promotes the sibling in its place.
 */
export interface RestoreAnchor {
  /** A slot in the sibling subtree, used to find the reinsertion point. */
  siblingSlotId: string;
  /** Which child index the leaf occupied, so it returns to the same side. */
  side: 0 | 1;
  direction: SplitDirection;
  /** The parent split's ratio at the time of minimizing. */
  ratio: number;
}

/** Record where `slotId` sits, to be replayed by `restoreLeaf`. Call before removing it. */
export function captureRestoreAnchor(tree: TreeNode, slotId: string): RestoreAnchor | null {
  const path = findPath(tree, slotId);
  if (path === null || path.length === 0) return null;

  const parent = path[path.length - 1];
  const sibling = parent.node.children[parent.childIndex === 0 ? 1 : 0];
  const siblingSlotId = collectSlotIds(sibling)[0];
  if (!siblingSlotId) return null;

  return {
    siblingSlotId,
    side: parent.childIndex,
    direction: parent.node.direction,
    ratio: parent.node.ratio,
  };
}

/**
 * Split `targetSlotId`'s leaf, placing `newSlotId` on the given side at the
 * given ratio.
 *
 * `splitLeaf` covers the common case but always appends the new leaf second at
 * an even ratio; restoring a pane needs to reproduce a specific arrangement.
 */
export function insertLeafBeside(
  tree: TreeNode,
  targetSlotId: string,
  newSlotId: string,
  direction: SplitDirection,
  side: 0 | 1,
  ratio: number,
): TreeNode {
  if (tree.type === "leaf") {
    if (tree.slotId !== targetSlotId) return tree;
    const fresh = createLeaf(newSlotId);
    return {
      type: "split",
      id: uid(),
      direction,
      children: side === 0 ? [fresh, tree] : [tree, fresh],
      ratio,
    };
  }

  const [left, right] = tree.children;
  const newLeft = insertLeafBeside(left, targetSlotId, newSlotId, direction, side, ratio);
  const newRight = insertLeafBeside(right, targetSlotId, newSlotId, direction, side, ratio);
  if (newLeft === left && newRight === right) return tree;
  return { ...tree, children: [newLeft, newRight] };
}

/**
 * Put a minimized pane back.
 *
 * Uses the anchor when its neighbour is still on screen, so a layout the user
 * hand-tuned returns exactly as it was. When that neighbour has since been
 * closed or minimized there is no meaningful "where it was" left, so fall back
 * to a balanced rebuild — the same thing Add Session does.
 */
export function restoreLeaf(
  tree: TreeNode,
  slotId: string,
  anchor: RestoreAnchor | null,
  visibleSlotIds: string[],
): TreeNode {
  if (anchor && visibleSlotIds.includes(anchor.siblingSlotId)) {
    return insertLeafBeside(
      tree,
      anchor.siblingSlotId,
      slotId,
      anchor.direction,
      anchor.side,
      anchor.ratio,
    );
  }
  return buildGridTree([...visibleSlotIds, slotId]);
}
