import { useEffect } from "react";
import { isMac } from "@/lib/platform";

interface UseAppKeyboardOptions {
  /** Callback to add a new session to the active project tab. */
  onNewSession: () => void;
  /** Callback to switch to the next project tab (with wrap-around). */
  onNextTab: () => void;
  /** Callback to switch to the previous project tab (with wrap-around). */
  onPrevTab: () => void;
  /** Callback to close/kill the focused terminal session. */
  onCloseSession: () => void;
}

/**
 * Global keyboard shortcut handler for app-level tab management.
 *
 * Shortcuts:
 * - Cmd/Ctrl+T: Add a new session to the active project tab
 * - Cmd/Ctrl+W: Close/kill the focused terminal session
 * - Cmd/Ctrl+Shift+[  (or Cmd+{): Switch to the previous project tab
 * - Cmd/Ctrl+Shift+]  (or Cmd+}): Switch to the next project tab
 */
export function useAppKeyboard({
  onNewSession,
  onNextTab,
  onPrevTab,
  onCloseSession,
}: UseAppKeyboardOptions): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifierKey = isMac() ? event.metaKey : event.ctrlKey;
      if (!modifierKey) return;

      // Cmd/Ctrl+T (no shift) — new session
      if (event.key === "t" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        onNewSession();
        return;
      }

      // Cmd/Ctrl+W (no shift) — close focused session
      if (event.key === "w" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        onCloseSession();
        return;
      }

      // Cmd/Ctrl+Shift+[ — previous tab
      // On macOS, Cmd+Shift+[ produces key="{"; on other platforms key="[" with shiftKey
      if (
        (event.key === "{" || (event.key === "[" && event.shiftKey)) &&
        !event.altKey
      ) {
        event.preventDefault();
        onPrevTab();
        return;
      }

      // Cmd/Ctrl+Shift+] — next tab
      // On macOS, Cmd+Shift+] produces key="}"; on other platforms key="]" with shiftKey
      if (
        (event.key === "}" || (event.key === "]" && event.shiftKey)) &&
        !event.altKey
      ) {
        event.preventDefault();
        onNextTab();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewSession, onNextTab, onPrevTab, onCloseSession]);
}
