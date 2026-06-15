import { useEffect } from "react";

interface UseAppKeyboardOptions {
  /** Callback to add a new session */
  onAddSession: () => void;
  /** Whether adding a session is currently allowed (e.g. in grid view) */
  canAddSession: boolean;
  /** Switch to the next project tab (Cmd/Ctrl+}) */
  onNextTab?: () => void;
  /** Switch to the previous project tab (Cmd/Ctrl+{) */
  onPrevTab?: () => void;
}

/**
 * Detect whether the current platform uses Cmd (Mac) or Ctrl (Windows/Linux) as the modifier key.
 */
function isMac(): boolean {
  return navigator.platform.toLowerCase().includes("mac");
}

/**
 * App-level keyboard shortcut handler.
 *
 * Shortcuts:
 * - Cmd/Ctrl+T: Add a new session slot (when in grid view)
 * - Cmd/Ctrl+Shift+[ (Cmd+{): Switch to the previous project tab
 * - Cmd/Ctrl+Shift+] (Cmd+}): Switch to the next project tab
 */
export function useAppKeyboard({ onAddSession, canAddSession, onNextTab, onPrevTab }: UseAppKeyboardOptions): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifierKey = isMac() ? event.metaKey : event.ctrlKey;
      if (!modifierKey) return;

      // Never interfere with Alt combinations
      if (event.altKey) return;

      // Cmd/Ctrl+Shift+[ (produces "{" on macOS) -> previous project tab
      if ((event.key === "{" || (event.key === "[" && event.shiftKey)) && onPrevTab) {
        event.preventDefault();
        onPrevTab();
        return;
      }

      // Cmd/Ctrl+Shift+] (produces "}" on macOS) -> next project tab
      if ((event.key === "}" || (event.key === "]" && event.shiftKey)) && onNextTab) {
        event.preventDefault();
        onNextTab();
        return;
      }

      // Remaining shortcuts don't use Shift
      if (event.shiftKey) return;

      if (event.key === "t") {
        // Always prevent default to block WebView's new-tab behavior
        event.preventDefault();
        if (canAddSession) {
          onAddSession();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onAddSession, canAddSession, onNextTab, onPrevTab]);
}
