"use client";

import { Plane, PlaneLanding, ParkingSquare, PlaneTakeoff } from "lucide-react";

type Props = {
  livePhase: string | null;
  liveLastSeenAt: Date | string | null;
  liveAltitudeM: number | null;
  liveVelocityMs: number | null;
  liveOnGround: boolean | null;
};

// Live data older than this is considered stale (avion fuera de cobertura ADS-B
// o cambio de callsign). Hide the badge entirely.
const STALE_MS = 10 * 60 * 1000;

const PHASE_UI: Record<string, { label: string; bg: string; text: string; Icon: typeof Plane; pulse: boolean }> = {
  APPROACHING: { label: "Aproximación", bg: "bg-sky-100", text: "text-sky-700", Icon: PlaneLanding, pulse: true },
  LANDED: { label: "Aterrizado", bg: "bg-amber-100", text: "text-amber-700", Icon: PlaneLanding, pulse: true },
  ON_BLOCKS: { label: "En parking", bg: "bg-emerald-100", text: "text-emerald-700", Icon: ParkingSquare, pulse: false },
  DEPARTED: { label: "Despegado", bg: "bg-gray-100", text: "text-gray-600", Icon: PlaneTakeoff, pulse: false },
};

export function LiveStatusBadge({ livePhase, liveLastSeenAt, liveAltitudeM, liveVelocityMs, liveOnGround }: Props) {
  if (!livePhase || !liveLastSeenAt) return null;
  const seen = typeof liveLastSeenAt === "string" ? new Date(liveLastSeenAt) : liveLastSeenAt;
  if (Date.now() - seen.getTime() > STALE_MS) return null;

  const ui = PHASE_UI[livePhase];
  if (!ui) return null;

  const altFt = liveAltitudeM != null ? Math.round(liveAltitudeM * 3.28084) : null;
  const speedKt = liveVelocityMs != null ? Math.round(liveVelocityMs * 1.94384) : null;
  const seenMinAgo = Math.round((Date.now() - seen.getTime()) / 60000);

  const tooltipParts = [
    `Estado en vivo: ${ui.label}`,
    altFt != null && !liveOnGround ? `FL${Math.round(altFt / 100).toString().padStart(3, "0")}` : null,
    speedKt != null ? `${speedKt} kt` : null,
    `visto hace ${seenMinAgo} min`,
  ].filter(Boolean);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:text-xs ${ui.bg} ${ui.text} ${ui.pulse ? "animate-pulse" : ""}`}
      title={tooltipParts.join(" · ")}
    >
      <ui.Icon size={10} className="shrink-0" />
      {ui.label}
    </span>
  );
}
