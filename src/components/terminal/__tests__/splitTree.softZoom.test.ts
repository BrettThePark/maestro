import { describe, it, expect } from "vitest";

import {
  applySoftZoom,
  buildGridTree,
  leafExtents,
  SOFT_ZOOM_CEILING,
  SOFT_ZOOM_FLOOR,
  type TreeNode,
} from "../splitTree";

function extentOf(tree: TreeNode, slotId: string) {
  const found = leafExtents(tree).find((e) => e.slotId === slotId);
  if (!found) throw new Error(`no leaf ${slotId}`);
  return found;
}

describe("applySoftZoom", () => {
  it("returns the tree untouched when nothing is zoomed", () => {
    const tree = buildGridTree(["a", "b", "c", "d"]);
    expect(applySoftZoom(tree, null)).toBe(tree);
  });

  it("returns the tree untouched for an unknown slot", () => {
    const tree = buildGridTree(["a", "b"]);
    expect(applySoftZoom(tree, "zz")).toBe(tree);
  });

  // The three cases from the spec's results table.
  it("grows a side-by-side pane to the ceiling", () => {
    const zoomed = applySoftZoom(buildGridTree(["a", "b"]), "a");
    expect(extentOf(zoomed, "a").width).toBeCloseTo(0.7, 6);
    expect(extentOf(zoomed, "a").height).toBeCloseTo(1, 6);
  });

  it("grows a 2x2 pane to the ceiling on both axes", () => {
    const zoomed = applySoftZoom(buildGridTree(["a", "b", "c", "d"]), "a");
    const a = extentOf(zoomed, "a");
    expect(a.width).toBeCloseTo(0.7, 6);
    expect(a.height).toBeCloseTo(0.7, 6);
  });

  it("stops at the floor on the crowded axis of a 6-pane grid", () => {
    // 3 columns x 2 rows: the two other columns need 0.2 each, so width tops
    // out at 0.6 — below the ceiling. Height still reaches the ceiling.
    const zoomed = applySoftZoom(buildGridTree(["a", "b", "c", "d", "e", "f"]), "a");
    const a = extentOf(zoomed, "a");
    expect(a.width).toBeCloseTo(0.6, 6);
    expect(a.height).toBeCloseTo(0.7, 6);
  });

  it("beats even distribution in a nested 3-wide row", () => {
    // Regression guard: distributing the boost evenly across both vertical
    // dividers squeezes the middle pane twice and caps width near 0.52.
    const zoomed = applySoftZoom(buildGridTree(["a", "b", "c"]), "a");
    expect(extentOf(zoomed, "a").width).toBeGreaterThan(0.55);
  });

  it("never pushes another pane below the floor", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: count }, (_, i) => `s${i}`);
      const zoomed = applySoftZoom(buildGridTree(ids), "s0");
      for (const extent of leafExtents(zoomed)) {
        if (extent.slotId === "s0") continue;
        expect(extent.width).toBeGreaterThanOrEqual(SOFT_ZOOM_FLOOR - 1e-9);
        expect(extent.height).toBeGreaterThanOrEqual(SOFT_ZOOM_FLOOR - 1e-9);
      }
    }
  });

  it("never exceeds the ceiling on a contested axis", () => {
    // An axis nobody else occupies is not contested — a single row of panes
    // spans the full height, and the ceiling has nothing to hold back. It
    // governs only axes where another pane would have to give up space.
    for (const count of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: count }, (_, i) => `s${i}`);
      const zoomed = applySoftZoom(buildGridTree(ids), "s0");
      const focused = extentOf(zoomed, "s0");

      for (const axis of ["width", "height"] as const) {
        const contested = leafExtents(zoomed).some(
          (e) => e.slotId !== "s0" && e[axis] < 1 - 1e-9,
        );
        if (!contested) {
          expect(focused[axis]).toBeCloseTo(1, 6);
          continue;
        }
        expect(focused[axis]).toBeLessThanOrEqual(SOFT_ZOOM_CEILING + 1e-9);
      }
    }
  });

  it("never shrinks a pane that is already large", () => {
    // A hand-dragged layout where "a" is already wider than the ceiling.
    const wide: TreeNode = {
      type: "split",
      id: "n1",
      direction: "vertical",
      ratio: 0.8,
      children: [
        { type: "leaf", id: "l1", slotId: "a" },
        { type: "leaf", id: "l2", slotId: "b" },
      ],
    };
    expect(extentOf(applySoftZoom(wide, "a"), "a").width).toBeCloseTo(0.8, 6);
  });

  it("leaves dividers off the path alone", () => {
    // "c" and "d" share a divider that is not on a's path; their relative
    // split must survive untouched even as their column shrinks.
    const tree = buildGridTree(["a", "b", "c", "d"]);
    const zoomed = applySoftZoom(tree, "a");
    const c = extentOf(zoomed, "c");
    const d = extentOf(zoomed, "d");
    expect(c.width).toBeCloseTo(d.width, 6);
  });

  it("does not mutate the input tree", () => {
    const tree = buildGridTree(["a", "b", "c", "d"]);
    const before = JSON.stringify(tree);
    applySoftZoom(tree, "a");
    expect(JSON.stringify(tree)).toBe(before);
  });
});
