// Helpers para la vista /dia (Tablón).
// Lógica pura, fácil de testear.

import type { Flight, EventLog } from "@prisma/client";
import { calcMinutes } from "@/hooks/useLiveCountdown";

export type FlightLite = Pick<
  Flight,
  | "id"
  | "callsign"
  | "state"
  | "eta"
  | "etd"
  | "arrivalDate"
  | "departureDate"
  | "fuelState"
  | "toiletState"
  | "livePhase"
  | "liveLastSeenAt"
  | "liveOnGround"
> & { services: { state: string; phase: string }[]; eventLogs?: EventLog[] };

/** "DD/MM" del día de referencia (fechas guardadas como string DD/MM). */
export function shortDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Si el vuelo es llegada en este día. */
export function isArrivalToday(f: Pick<Flight, "eta" | "arrivalDate">, date: Date): boolean {
  if (!f.eta) return false;
  if (!f.arrivalDate) return true; // sin fecha explícita → asumimos hoy
  return f.arrivalDate === shortDate(date);
}

/** Si el vuelo es salida en este día. */
export function isDepartureToday(f: Pick<Flight, "etd" | "departureDate">, date: Date): boolean {
  if (!f.etd) return false;
  if (!f.departureDate) return true;
  return f.departureDate === shortDate(date);
}

/**
 * Devuelve la hora de aterrizaje real (HH:MM Zulu) si la podemos derivar:
 *  1. eventLog con "Estado → ON_BLOCKS" → timestamp de la transición
 *  2. fallback: si livePhase es LANDED/ON_BLOCKS y liveLastSeenAt existe
 */
export function deriveATA(f: FlightLite): string | null {
  if (f.eventLogs?.length) {
    for (const e of f.eventLogs) {
      if (
        /Estado\s*(?:→|->)\s*ON_BLOCKS/i.test(e.action) ||
        /Auto-?transici[oó]n\s*(?:→|->).*ON_BLOCKS/i.test(e.action)
      ) {
        return formatHHMM(new Date(e.timestamp));
      }
    }
  }
  if ((f.livePhase === "LANDED" || f.livePhase === "ON_BLOCKS") && f.liveLastSeenAt) {
    return formatHHMM(new Date(f.liveLastSeenAt));
  }
  return null;
}

export function deriveATD(f: FlightLite): string | null {
  if (f.eventLogs?.length) {
    for (const e of f.eventLogs) {
      if (
        /Estado\s*(?:→|->)\s*OFF_BLOCKS/i.test(e.action) ||
        /Auto-?transici[oó]n\s*(?:→|->).*OFF_BLOCKS/i.test(e.action)
      ) {
        return formatHHMM(new Date(e.timestamp));
      }
    }
  }
  if (f.livePhase === "DEPARTED" && f.liveLastSeenAt && f.liveOnGround === false) {
    return formatHHMM(new Date(f.liveLastSeenAt));
  }
  return null;
}

function formatHHMM(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Decide cuál es el próximo evento relevante para ordenar/destacar el vuelo:
 *  - EXPECTED → ETA
 *  - ON_BLOCKS / PARKED / TURNAROUND / BOARDING → ETD
 *  - OFF_BLOCKS → null (terminado)
 * Devuelve minutos restantes (negativo si pasado), o null si no aplica.
 */
export function nextEventMinutes(f: FlightLite, dayUtc: Date, now: Date = new Date()): number | null {
  switch (f.state) {
    case "EXPECTED":
      return f.eta ? calcMinutes(f.eta, dayUtc, now) : null;
    case "OFF_BLOCKS":
      return null;
    default:
      return f.etd ? calcMinutes(f.etd, dayUtc, now) : null;
  }
}

export type Urgency = "departed" | "boarding" | "imminent" | "soon" | "normal" | "alert";

/**
 * Color/clase de fila según urgencia. Considera estado, próximo evento, y si
 * tiene servicios pendientes cuando ETD es inminente.
 */
export function rowUrgency(f: FlightLite, dayUtc: Date, now: Date = new Date()): Urgency {
  if (f.state === "OFF_BLOCKS") return "departed";
  if (f.state === "BOARDING") return "boarding";

  const minutes = nextEventMinutes(f, dayUtc, now);
  if (minutes === null) return "normal";

  const hasPendingDepServices =
    (f.state === "TURNAROUND" || f.state === "PARKED") &&
    (f.fuelState !== "SERVED" ||
      f.toiletState === "REQUESTED" ||
      f.services.some((s) => s.state !== "DELIVERED" && (s.phase === "DEPARTURE" || s.phase === "BOTH")));

  if (minutes < 0 && f.state !== "OFF_BLOCKS") return "alert";       // ya pasado el evento, no listo
  if (minutes <= 30 && hasPendingDepServices) return "alert";        // <30min y servicios sin terminar
  if (minutes <= 30) return "imminent";
  if (minutes <= 90) return "soon";
  return "normal";
}

export const URGENCY_ROW_CLASS: Record<Urgency, string> = {
  departed: "bg-gray-100 text-gray-400",
  boarding: "bg-orange-50",
  imminent: "bg-yellow-50",
  alert: "bg-red-50 ring-1 ring-red-200",
  soon: "bg-blue-50/40",
  normal: "",
};

/** Colores del status dot por estado real (los anteriores referenciaban estados inexistentes). */
export const STATE_DOT_CLASS: Record<string, string> = {
  EXPECTED: "bg-gray-300",
  ON_BLOCKS: "bg-blue-500 animate-pulse",
  PARKED: "bg-blue-700",
  TURNAROUND: "bg-purple-500",
  BOARDING: "bg-orange-500 animate-pulse",
  OFF_BLOCKS: "bg-green-600",
};

/** Pills del header — métricas top-of-mind para el handler. */
export interface HeaderStats {
  arrivals: number;
  departures: number;
  approaching: number;
  pendingDepServices: number;
  alerts: number;
}

export function computeHeaderStats(
  flights: FlightLite[],
  dayUtc: Date,
  now: Date = new Date(),
): HeaderStats {
  let arrivals = 0;
  let departures = 0;
  let approaching = 0;
  let pendingDepServices = 0;
  let alerts = 0;

  for (const f of flights) {
    if (isArrivalToday(f, dayUtc)) arrivals++;
    if (isDepartureToday(f, dayUtc)) departures++;
    if (f.livePhase === "APPROACHING") approaching++;
    if (f.state === "TURNAROUND" || f.state === "PARKED" || f.state === "BOARDING") {
      const dep = f.services.some(
        (s) => s.state !== "DELIVERED" && (s.phase === "DEPARTURE" || s.phase === "BOTH"),
      );
      if (dep || f.fuelState !== "SERVED") pendingDepServices++;
    }
    if (rowUrgency(f, dayUtc, now) === "alert") alerts++;
  }
  return { arrivals, departures, approaching, pendingDepServices, alerts };
}
