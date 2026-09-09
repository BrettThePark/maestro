import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo } from "react";
import { isMac } from "@/lib/platform";
import { computeAttentionCount, useReviewStore } from "@/stores/useReviewStore";
import { useSessionStore } from "@/stores/useSessionStore";

/**
 * Sets the macOS dock badge to the number of sessions wanting attention: those
 * asking a question, plus those that finished working and haven't been looked at.
 * Clears the badge when count reaches 0 or on unmount.
 */
export function useDockBadge(): void {
  const sessions = useSessionStore((s) => s.sessions);
  const unreviewed = useReviewStore((s) => s.unreviewed);

  const attentionCount = useMemo(
    () => computeAttentionCount(sessions, unreviewed),
    [sessions, unreviewed],
  );

  useEffect(() => {
    if (!isMac()) return;

    const window = getCurrentWindow();
    window.setBadgeCount(attentionCount > 0 ? attentionCount : undefined);

    return () => {
      window.setBadgeCount(undefined);
    };
  }, [attentionCount]);
}
