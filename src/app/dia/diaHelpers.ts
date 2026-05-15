// Helpers para la vista /dia (Tablón).
// Lógica pura, fácil de testear.

import type { Flight, EventLog } from "@/types/compat";
import { calcMinutes } from "@/hooks/useLiveCountdown";

export type FlightLite = Pick<
  Flight,
  | "id"
  | "callsign"
  | "state"
  | "eta"
  | "etd"
  | "ata"
  | "atd"
  | "arrivalDate"
  | "departureDate"
  | "fuelState"
  | "toiletState"
  | "livePhase"
  | "liveLastSeenAt"
  | "liveOnGround"
> & { services: { state: string; phase: string }[]; eventLogs?: EventLog[] };

/** "DD/MM" del día de referencia. */
export function shortDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** "DD/MM/YY" del día de referencia (formato real en DB tras parser PDF). */
export function shortDateYY(date: Date): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${shortDate(date)}/${yy}`;
}

/**
 * Match flexible: el campo arrivalDate / departureDate puede venir como
 * "DD/MM" o "DD/MM/YY" (depende del parser y de datos antiguos). Aceptamos
 * los dos comparando solo los primeros 5 caracteres.
 */
function dateMatches(stored: string | null, day: Date): boolean {
  if (!stored) return false;
  return stored.slice(0, 5) === shortDate(day);
}

/** Si el vuelo es llegada en este día. */
export function isArrivalToday(f: Pick<Flight, "eta" | "arrivalDate">, date: Date): boolean {
  if (!f.eta) return false;
  if (!f.arrivalDate) return true; // sin fecha explícita → asumimos hoy
  return dateMatches(f.arrivalDate, date);
}

/** Si el vuelo es salida en este día. */
export function isDepartureToday(f: Pick<Flight, "etd" | "departureDate">, date: Date): boolean {
  if (!f.etd) return false;
  if (!f.departureDate) return true;
  return dateMatches(f.departureDate, date);
}

/** Compara DD/MM[/YY] contra el día de referencia → -1 (past), 0 (today), 1 (future). */
function compareStoredDate(stored: string | null, day: Date): -1 | 0 | 1 | null {
  if (!stored) return null;
  const headStored = stored.slice(0, 5); // DD/MM
  if (headStored === shortDate(day)) return 0;
  // Componer ambos como YYYY-MM-DD para comparar
  const [dd, mm] = headStored.split("/").map(Number);
  if (!dd || !mm) return null;
  const yy = stored.length >= 8 ? Number(stored.slice(6, 8)) : day.getUTCFullYear() % 100;
  const storedDate = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  const refDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  if (storedDate < refDate) return -1;
  if (storedDate > refDate) return 1;
  return 0;
}

/**
 * Estado visual de un segmento (LLEGADA o SALIDA) — para teñir las celdas
 * como un highlighter sobre la hoja del día. Sin esconder nada.
 */
export type SegmentState = "past" | "future" | "today-pending" | "today-overdue" | "today-done";

export function arrivalSegmentState(
  f: FlightLite,
  day: Date,
  now: Date = new Date(),
): SegmentState | null {
  if (!f.eta) return null;
  const cmp = compareStoredDate(f.arrivalDate, day);
  if (cmp === -1) return "past";
  if (cmp === 1) return "future";
  // cmp === 0 (hoy) o null (sin arrivalDate, asumimos hoy)
  if (f.ata) return "today-done";
  const minutesToEta = calcMinutes(f.eta, day, now);
  if (minutesToEta !== null && minutesToEta < -5) return "today-overdue";
  return "today-pending";
}

export function departureSegmentState(
  f: FlightLite,
  day: Date,
  now: Date = new Date(),
): SegmentState | null {
  if (!f.etd) return null;
  const cmp = compareStoredDate(f.departureDate, day);
  if (cmp === -1) return "past";
  if (cmp === 1) return "future";
  if (f.atd) return "today-done";
  const minutesToEtd = calcMinutes(f.etd, day, now);
  if (minutesToEtd !== null && minutesToEtd < -5) return "today-overdue";
  return "today-pending";
}

/** Clases de fondo+texto para cada estado de segmento (highlighter style). */
export const SEGMENT_CELL_CLASS: Record<SegmentState, string> = {
  "past":          "bg-slate-100 text-slate-500",
  "future":        "bg-indigo-50 text-indigo-700",
  "today-pending": "",
  "today-overdue": "bg-red-100 text-red-800",
  "today-done":    "bg-emerald-50 text-emerald-800",
};

/**
 * Devuelve la hora de aterrizaje real (HH:MM Zulu). Orden de prioridad:
 *  1. campo explícito flight.ata (override del handler)
 *  2. eventLog con "Estado → ON_BLOCKS" → timestamp de la transición
 *  3. fallback: si livePhase es LANDED/ON_BLOCKS y liveLastSeenAt existe
 */
export function deriveATA(f: FlightLite): string | null {
  if (f.ata) return f.ata;
  if (f.eventLogs?.length) {
    // Acepta tanto el nuevo "ARRIVING" como el legado "ON_BLOCKS" para no
    // perder datos de vuelos pre-migracion.
    for (const e of f.eventLogs) {
      if (
        /Estado\s*(?:→|->)\s*(?:ARRIVING|ON_BLOCKS)/i.test(e.action) ||
        /Auto-?transici[oó]n\s*(?:→|->).*(?:ARRIVING|ON_BLOCKS)/i.test(e.action)
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
  if (f.atd) return f.atd;
  if (f.eventLogs?.length) {
    for (const e of f.eventLogs) {
      if (
        /Estado\s*(?:→|->)\s*(?:DEPARTED|OFF_BLOCKS)/i.test(e.action) ||
        /Auto-?transici[oó]n\s*(?:→|->).*(?:DEPARTED|OFF_BLOCKS)/i.test(e.action)
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
    case "DEPARTED":
    case "OFF_BLOCKS":
      return null;
    default:
      return f.etd ? calcMinutes(f.etd, dayUtc, now) : null;
  }
}

export type Urgency = "departed" | "imminent" | "soon" | "normal" | "alert";

/**
 * Color/clase de fila según urgencia. Considera estado, próximo evento, y si
 * tiene servicios pendientes cuando ETD es inminente.
 */
export function rowUrgency(f: FlightLite, dayUtc: Date, now: Date = new Date()): Urgency {
  if (f.state === "DEPARTED" || f.state === "OFF_BLOCKS") return "departed";

  const minutes = nextEventMinutes(f, dayUtc, now);
  if (minutes === null) return "normal";

  const hasPendingDepServices =
    (f.state === "DEPARTING" || f.state === "PARKED" ||
     f.state === "TURNAROUND" || f.state === "BOARDING") &&
    (f.fuelState !== "SERVED" ||
      f.toiletState === "REQUESTED" ||
      f.services.some((s) => s.state !== "DELIVERED" && (s.phase === "DEPARTURE" || s.phase === "BOTH")));

  if (minutes < 0) return "alert";                                   // ya pasado el evento, no listo
  if (minutes <= 30 && hasPendingDepServices) return "alert";        // <30min y servicios sin terminar
  if (minutes <= 30) return "imminent";
  if (minutes <= 90) return "soon";
  return "normal";
}

export const URGENCY_ROW_CLASS: Record<Urgency, string> = {
  departed: "bg-gray-100 text-gray-400",
  imminent: "bg-yellow-50",
  alert: "bg-red-50 ring-1 ring-red-200",
  soon: "bg-blue-50/40",
  normal: "",
};

/** Colores del status dot por estado (5 estados nuevos). */
export const STATE_DOT_CLASS: Record<string, string> = {
  EXPECTED: "bg-gray-300",
  ARRIVING: "bg-blue-500 animate-pulse",
  PARKED: "bg-purple-500",
  DEPARTING: "bg-cyan-500 animate-pulse",
  DEPARTED: "bg-green-600",
  // Compat con datos viejos por si algun row no se ha migrado todavia
  ON_BLOCKS: "bg-blue-500 animate-pulse",
  TURNAROUND: "bg-cyan-500",
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
    if (f.state === "DEPARTING" || f.state === "PARKED" ||
        f.state === "TURNAROUND" || f.state === "BOARDING") {
      const dep = f.services.some(
        (s) => s.state !== "DELIVERED" && (s.phase === "DEPARTURE" || s.phase === "BOTH"),
      );
      if (dep || f.fuelState !== "SERVED") pendingDepServices++;
    }
    if (rowUrgency(f, dayUtc, now) === "alert") alerts++;
  }
  return { arrivals, departures, approaching, pendingDepServices, alerts };
}
