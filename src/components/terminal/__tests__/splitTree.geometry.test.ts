import { describe, it, expect } from "vitest";

import { buildGridTree, findPath, leafExtents, type TreeNode } from "../splitTree";

/** Look up one leaf's extents by slot id. */
function extentOf(tree: TreeNode, slotId: string) {
  const found = leafExtents(tree).find((e) => e.slotId === slotId);
  if (!found) throw new Error(`no leaf ${slotId}`);
  return found;
}

describe("leafExtents", () => {
  it("gives a lone leaf the whole area", () => {
    expect(leafExtents(buildGridTree(["a"]))).toEqual([
      { slotId: "a", width: 1, height: 1 },
    ]);
  });

  it("splits width for a side-by-side pair", () => {
    const tree = buildGridTree(["a", "b"]);
    expect(extentOf(tree, "a")).toEqual({ slotId: "a", width: 0.5, height: 1 });
    expect(extentOf(tree, "b")).toEqual({ slotId: "b", width: 0.5, height: 1 });
  });

  it("splits both axes for a 2x2 grid", () => {
    const tree = buildGridTree(["a", "b", "c", "d"]);
    expect(extentOf(tree, "a")).toEqual({ slotId: "a", width: 0.5, height: 0.5 });
    expect(extentOf(tree, "d")).toEqual({ slotId: "d", width: 0.5, height: 0.5 });
  });

  it("accounts for nesting in a 3-wide row", () => {
    // buildGridTree(3) is split( split(a,b) @ 2/3, c ) — a and b are nested
    // one level deeper than c, so their widths compound.
    const tree = buildGridTree(["a", "b", "c"]);
    const a = extentOf(tree, "a");
    const c = extentOf(tree, "c");
    expect(a.width).toBeCloseTo(1 / 3, 10);
    expect(c.width).toBeCloseTo(1 / 3, 10);
  });

  it("always accounts for the full area", () => {
    const tree = buildGridTree(["a", "b", "c", "d", "e", "f"]);
    const total = leafExtents(tree).reduce((sum, e) => sum + e.width * e.height, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("findPath", () => {
  it("returns an empty path for a root leaf", () => {
    expect(findPath(buildGridTree(["a"]), "a")).toEqual([]);
  });

  it("returns null for a slot that is not in the tree", () => {
    expect(findPath(buildGridTree(["a", "b"]), "zz")).toBeNull();
  });

  it("records which side of each divider the slot sits on", () => {
    const tree = buildGridTree(["a", "b"]);
    const path = findPath(tree, "b");
    expect(path).toHaveLength(1);
    expect(path?.[0].childIndex).toBe(1);
    expect(path?.[0].node.direction).toBe("vertical");
  });

  it("returns dividers root-first", () => {
    const tree = buildGridTree(["a", "b", "c", "d"]);
    const path = findPath(tree, "a");
    expect(path).toHaveLength(2);
    expect(path?.[0].node.direction).toBe("horizontal"); // rows split first
    expect(path?.[1].node.direction).toBe("vertical");
  });
});
