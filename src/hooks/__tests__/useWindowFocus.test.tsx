import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWindowFocus } from "../useWindowFocus";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWindowFocus", () => {
  it("starts from the document's current focus state", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    const { result } = renderHook(() => useWindowFocus());

    expect(result.current).toBe(false);
  });

  it("goes false when the window loses focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { result } = renderHook(() => useWindowFocus());

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(result.current).toBe(false);
  });

  it("goes true again when the window regains focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { result } = renderHook(() => useWindowFocus());

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current).toBe(true);
  });
});
