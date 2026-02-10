import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppKeyboard } from "../useAppKeyboard";

// Mock the platform module
vi.mock("@/lib/platform", () => ({
  isMac: vi.fn(() => true),
}));

import { isMac } from "@/lib/platform";

function fireKeyDown(opts: Partial<KeyboardEventInit> & { key: string }) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(event);
  return event;
}

describe("useAppKeyboard", () => {
  const onNewSession = vi.fn();
  const onNextTab = vi.fn();
  const onPrevTab = vi.fn();
  const onCloseSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMac).mockReturnValue(true);
  });

  afterEach(() => {
    // renderHook cleanup handles removing the event listener
  });

  function setup() {
    return renderHook(() =>
      useAppKeyboard({ onNewSession, onNextTab, onPrevTab, onCloseSession })
    );
  }

  describe("macOS (metaKey)", () => {
    beforeEach(() => {
      vi.mocked(isMac).mockReturnValue(true);
    });

    it("Cmd+T calls onNewSession", () => {
      setup();
      fireKeyDown({ key: "t", metaKey: true });
      expect(onNewSession).toHaveBeenCalledOnce();
    });

    it("Cmd+T prevents default", () => {
      setup();
      const event = fireKeyDown({ key: "t", metaKey: true });
      expect(event.defaultPrevented).toBe(true);
    });

    it("Cmd+W calls onCloseSession", () => {
      setup();
      fireKeyDown({ key: "w", metaKey: true });
      expect(onCloseSession).toHaveBeenCalledOnce();
    });

    it("Cmd+W prevents default", () => {
      setup();
      const event = fireKeyDown({ key: "w", metaKey: true });
      expect(event.defaultPrevented).toBe(true);
    });

    it("Cmd+Shift+[ (key={) calls onPrevTab", () => {
      setup();
      fireKeyDown({ key: "{", metaKey: true, shiftKey: true });
      expect(onPrevTab).toHaveBeenCalledOnce();
    });

    it("Cmd+Shift+] (key=}) calls onNextTab", () => {
      setup();
      fireKeyDown({ key: "}", metaKey: true, shiftKey: true });
      expect(onNextTab).toHaveBeenCalledOnce();
    });

    it("Cmd+Shift+[ prevents default", () => {
      setup();
      const event = fireKeyDown({ key: "{", metaKey: true, shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
    });

    it("Cmd+Shift+] prevents default", () => {
      setup();
      const event = fireKeyDown({ key: "}", metaKey: true, shiftKey: true });
      expect(event.defaultPrevented).toBe(true);
    });

    it("does not fire on Ctrl+T (non-mac modifier on mac)", () => {
      setup();
      fireKeyDown({ key: "t", ctrlKey: true });
      expect(onNewSession).not.toHaveBeenCalled();
    });

    it("does not fire on Cmd+Shift+T", () => {
      setup();
      fireKeyDown({ key: "T", metaKey: true, shiftKey: true });
      expect(onNewSession).not.toHaveBeenCalled();
    });

    it("does not fire on Alt+Cmd+T", () => {
      setup();
      fireKeyDown({ key: "t", metaKey: true, altKey: true });
      expect(onNewSession).not.toHaveBeenCalled();
    });

    it("does not fire onCloseSession on Alt+Cmd+W", () => {
      setup();
      fireKeyDown({ key: "w", metaKey: true, altKey: true });
      expect(onCloseSession).not.toHaveBeenCalled();
    });
  });

  describe("Windows/Linux (ctrlKey)", () => {
    beforeEach(() => {
      vi.mocked(isMac).mockReturnValue(false);
    });

    it("Ctrl+T calls onNewSession", () => {
      setup();
      fireKeyDown({ key: "t", ctrlKey: true });
      expect(onNewSession).toHaveBeenCalledOnce();
    });

    it("Ctrl+W calls onCloseSession", () => {
      setup();
      fireKeyDown({ key: "w", ctrlKey: true });
      expect(onCloseSession).toHaveBeenCalledOnce();
    });

    it("Ctrl+Shift+[ calls onPrevTab", () => {
      setup();
      fireKeyDown({ key: "[", ctrlKey: true, shiftKey: true });
      expect(onPrevTab).toHaveBeenCalledOnce();
    });

    it("Ctrl+Shift+] calls onNextTab", () => {
      setup();
      fireKeyDown({ key: "]", ctrlKey: true, shiftKey: true });
      expect(onNextTab).toHaveBeenCalledOnce();
    });

    it("does not fire on Meta+T (non-linux modifier on linux)", () => {
      setup();
      fireKeyDown({ key: "t", metaKey: true });
      expect(onNewSession).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes event listener on unmount", () => {
      const { unmount } = setup();
      unmount();
      fireKeyDown({ key: "t", metaKey: true });
      expect(onNewSession).not.toHaveBeenCalled();
    });
  });
});
