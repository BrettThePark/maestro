import { describe, it, expect } from "vitest";

import {
  buildGridTree,
  captureRestoreAnchor,
  collectSlotIds,
  insertLeafBeside,
  removeLeaf,
  restoreLeaf,
  type TreeNode,
} from "../splitTree";

describe("captureRestoreAnchor", () => {
  it("records the neighbour, side, direction and ratio", () => {
    const tree = buildGridTree(["a", "b"]);
    const anchor = captureRestoreAnchor(tree, "b");
    expect(anchor).toEqual({
      siblingSlotId: "a",
      side: 1,
      direction: "vertical",
      ratio: 0.5,
    });
  });

  it("records a hand-dragged ratio", () => {
    const dragged: TreeNode = {
      type: "split",
      id: "n1",
      direction: "vertical",
      ratio: 0.75,
      children: [
        { type: "leaf", id: "l1", slotId: "a" },
        { type: "leaf", id: "l2", slotId: "b" },
      ],
    };
    expect(captureRestoreAnchor(dragged, "b")?.ratio).toBe(0.75);
  });

  it("returns null for a root leaf with no neighbour", () => {
    expect(captureRestoreAnchor(buildGridTree(["a"]), "a")).toBeNull();
  });

  it("returns null for a slot that is not in the tree", () => {
    expect(captureRestoreAnchor(buildGridTree(["a", "b"]), "zz")).toBeNull();
  });
});

describe("insertLeafBeside", () => {
  it("places the new leaf after its neighbour", () => {
    const tree = insertLeafBeside(buildGridTree(["a"]), "a", "b", "vertical", 1, 0.5);
    expect(collectSlotIds(tree)).toEqual(["a", "b"]);
  });

  it("places the new leaf before its neighbour", () => {
    const tree = insertLeafBeside(buildGridTree(["a"]), "a", "b", "vertical", 0, 0.5);
    expect(collectSlotIds(tree)).toEqual(["b", "a"]);
  });

  it("applies the requested ratio to the new split", () => {
    const tree = insertLeafBeside(buildGridTree(["a"]), "a", "b", "vertical", 1, 0.75);
    expect(tree.type === "split" && tree.ratio).toBe(0.75);
  });

  it("leaves the tree alone when the neighbour is missing", () => {
    const tree = buildGridTree(["a"]);
    expect(insertLeafBeside(tree, "zz", "b", "vertical", 1, 0.5)).toBe(tree);
  });
});

describe("restoreLeaf", () => {
  it("round-trips a minimize back to the identical layout", () => {
    const before = buildGridTree(["a", "b", "c", "d"]);
    const anchor = captureRestoreAnchor(before, "b");
    const minimized = removeLeaf(before, "b");
    if (!minimized) throw new Error("tree collapsed");

    const restored = restoreLeaf(minimized, "b", anchor, collectSlotIds(minimized));
    expect(collectSlotIds(restored)).toEqual(collectSlotIds(before));
  });

  it("round-trips a hand-dragged ratio", () => {
    const dragged: TreeNode = {
      type: "split",
      id: "n1",
      direction: "vertical",
      ratio: 0.75,
      children: [
        { type: "leaf", id: "l1", slotId: "a" },
        { type: "leaf", id: "l2", slotId: "b" },
      ],
    };
    const anchor = captureRestoreAnchor(dragged, "b");
    const minimized = removeLeaf(dragged, "b");
    if (!minimized) throw new Error("tree collapsed");

    const restored = restoreLeaf(minimized, "b", anchor, ["a"]);
    expect(restored.type === "split" && restored.ratio).toBe(0.75);
  });

  it("falls back to a balanced rebuild when the neighbour is gone", () => {
    const before = buildGridTree(["a", "b", "c"]);
    const anchor = captureRestoreAnchor(before, "b");

    // Minimize "b", then close its remembered neighbour.
    let tree = removeLeaf(before, "b");
    if (!tree) throw new Error("tree collapsed");
    tree = removeLeaf(tree, anchor?.siblingSlotId ?? "");
    if (!tree) throw new Error("tree collapsed");

    const restored = restoreLeaf(tree, "b", anchor, collectSlotIds(tree));
    expect(collectSlotIds(restored).sort()).toEqual([...collectSlotIds(tree), "b"].sort());
  });

  it("falls back to a balanced rebuild when there is no anchor", () => {
    const tree = buildGridTree(["a"]);
    const restored = restoreLeaf(tree, "b", null, ["a"]);
    expect(collectSlotIds(restored).sort()).toEqual(["a", "b"]);
  });
});
