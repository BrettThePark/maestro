import { describe, it, expect } from "vitest";

import { shouldForwardResize } from "../terminal";

describe("shouldForwardResize", () => {
  it("forwards ordinary terminal dimensions", () => {
    expect(shouldForwardResize(80, 24)).toBe(true);
    expect(shouldForwardResize(2, 2)).toBe(true);
  });

  it("rejects the collapsed dimensions a detached container produces", () => {
    expect(shouldForwardResize(0, 0)).toBe(false);
    expect(shouldForwardResize(1, 24)).toBe(false);
    expect(shouldForwardResize(80, 1)).toBe(false);
  });

  it("rejects non-finite dimensions", () => {
    expect(shouldForwardResize(Number.NaN, 24)).toBe(false);
    expect(shouldForwardResize(80, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
