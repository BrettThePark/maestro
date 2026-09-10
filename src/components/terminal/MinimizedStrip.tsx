import { Square } from "lucide-react";

import { useReviewStore } from "@/stores/useReviewStore";
import { useSessionStore } from "@/stores/useSessionStore";

export interface MinimizedSlot {
  slotId: string;
  sessionId: number | null;
}

interface MinimizedStripProps {
  slots: MinimizedSlot[];
  onRestore: (slotId: string) => void;
}

/**
 * Tab strip for sessions that have been minimized out of the grid.
 *
 * Renders nothing at all when empty so it costs the panes no vertical space in
 * the ordinary case. Each tab carries the same unseen-output dot as the dock
 * badge, because a session finishing while minimized is precisely the case a
 * user would otherwise miss.
 */
export function MinimizedStrip({ slots, onRestore }: MinimizedStripProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const unreviewed = useReviewStore((s) => s.unreviewed);

  if (slots.length === 0) return null;

  return (
    <div className="no-select flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-maestro-border bg-maestro-bg px-2 py-1">
      {slots.map(({ slotId, sessionId }) => {
        const session = sessions.find((s) => s.id === sessionId);
        const label = session?.name || (sessionId != null ? `Session ${sessionId}` : "Session");
        const needsAttention =
          sessionId != null && (unreviewed.has(sessionId) || session?.status === "NeedsInput");

        return (
          <button
            key={slotId}
            type="button"
            onClick={() => onRestore(slotId)}
            title={`Restore ${label}`}
            aria-label={`Restore ${label}`}
            className="flex items-center gap-1.5 rounded border border-maestro-border bg-maestro-card px-2 py-0.5 text-xs text-maestro-text transition-colors hover:border-maestro-accent hover:text-maestro-accent"
          >
            <Square size={9} className="text-maestro-muted" />
            <span className="max-w-[140px] truncate">{label}</span>
            {needsAttention && (
              <span
                aria-label="Has unseen output"
                className="h-1.5 w-1.5 rounded-full bg-maestro-yellow"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
