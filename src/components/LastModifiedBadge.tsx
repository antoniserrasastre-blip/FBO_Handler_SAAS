// Tiny badge that surfaces "who · action · when" for the most recent
// event log on a Visit/Flight. Used in VisitCard footer to recover the
// V1 audit affordance lost during the v2 refactor.

import type { EventLog } from "@/types/compat";

export interface LastModifiedBadgeProps {
  log: EventLog & { user: { name: string } | null };
}

export function LastModifiedBadge({ log }: LastModifiedBadgeProps) {
  const time = new Date(log.timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const action = log.action.length > 30 ? log.action.slice(0, 30) + "..." : log.action;
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] text-ink-muted">
      {log.user?.name || "Sistema"} · {action} · {time}
    </span>
  );
}
