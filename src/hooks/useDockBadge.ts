import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo } from "react";
import { isMac } from "@/lib/platform";
import { useSessionStore } from "@/stores/useSessionStore";

/**
 * Sets the macOS dock badge to the number of sessions in "NeedsInput" state.
 * Clears the badge when count reaches 0 or on unmount.
 */
export function useDockBadge(): void {
  const sessions = useSessionStore((s) => s.sessions);

  const needsInputCount = useMemo(
    () => sessions.filter((s) => s.status === "NeedsInput").length,
    [sessions],
  );

  useEffect(() => {
    if (!isMac()) return;

    const window = getCurrentWindow();
    window.setBadgeCount(needsInputCount > 0 ? needsInputCount : undefined);

    return () => {
      window.setBadgeCount(undefined);
    };
  }, [needsInputCount]);
}
