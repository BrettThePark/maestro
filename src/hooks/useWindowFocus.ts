import { useEffect, useState } from "react";

/**
 * Tracks whether the app window currently has OS focus.
 *
 * Used to tell "the user is looking at this pane" from "this pane happens to be
 * the focused one while the user is in another app" — the latter must not count
 * as reviewing a session.
 */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return focused;
}
