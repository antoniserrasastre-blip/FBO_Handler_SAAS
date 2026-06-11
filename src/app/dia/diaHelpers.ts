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
> & { services: ServiceLite[]; eventLogs?: EventLog[] };

/** La API v2 emite `direction`; `phase` es el nombre legacy. Aceptamos ambos. */
export type ServiceLite = { state: string; phase?: string | null; direction?: string | null };

/**
 * Fase efectiva de un servicio. Mismo fallback que el helper privado
 * `servicePhase` de src/lib/flightUrgency.ts (no exportado): el GET
 * /api/flights emite `direction`, no `phase` — leer solo `phase` deja
 * los criterios de "servicios de salida pendientes" ciegos.
 */
function servicePhase(s: ServiceLite): string {
  return s.phase || s.direction || "DEPARTURE";
}

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

/** Clases de fondo+texto para cada estado de segmento (highlighter style).
 *  past y future comparten gris flojo: ambos son "día distinto del visualizado". */
export const SEGMENT_CELL_CLASS: Record<SegmentState, string> = {
  "past":          "bg-slate-100 text-slate-500",
  "future":        "bg-slate-100 text-slate-500",
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
// Regex de transición a llegada/salida en eventLogs. Los escritores
// históricos loguearon el label de UI de FLIGHT_STATE_CONFIG ("En calzos",
// "Fuera de calzos"); los nuevos loguean el código de estado. Aceptamos
// ambos formatos para no perder los logs viejos.
const ATA_STATE_RE = /Estado\s*(?:→|->)\s*(?:ARRIVING|ON_BLOCKS|En calzos)/i;
const ATA_AUTO_RE = /Auto-?transici[oó]n\s*(?:→|->).*(?:ARRIVING|ON_BLOCKS|En calzos)/i;
const ATD_STATE_RE = /Estado\s*(?:→|->)\s*(?:DEPARTED|OFF_BLOCKS|Fuera de calzos)/i;
const ATD_AUTO_RE = /Auto-?transici[oó]n\s*(?:→|->).*(?:DEPARTED|OFF_BLOCKS|Fuera de calzos)/i;

export function deriveATA(f: FlightLite): string | null {
  if (f.ata) return f.ata;
  const logs = f.eventLogs;
  if (logs?.length) {
    // eventLogs llega en orden DESC (más reciente primero). La ATA operativa
    // es la PRIMERA transición a llegada (el avión aterriza una vez; un
    // mis-click posterior no debe pisarla) → recorremos desde el final.
    for (let i = logs.length - 1; i >= 0; i--) {
      const e = logs[i];
      if (ATA_STATE_RE.test(e.action) || ATA_AUTO_RE.test(e.action)) {
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
    // Aquí sí usamos la transición MÁS RECIENTE (orden DESC → primera del
    // array): si el avión vuelve a calzos y sale otra vez, la última salida
    // es la ATD válida.
    for (const e of f.eventLogs) {
      if (ATD_STATE_RE.test(e.action) || ATD_AUTO_RE.test(e.action)) {
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
      if (!f.eta) return null;
      // Gate por fecha: una ETA de otro día (p.ej. el fantasma con arrivalDate
      // de hace 10 días) no es "el próximo evento" del día visualizado.
      // null (sin fecha) sigue significando "hoy" — overnights y vuelos
      // manuales dependen de ese fallback.
      if (segmentIsOtherDay(f.arrivalDate, dayUtc)) return null;
      return calcMinutes(f.eta, dayUtc, now);
    case "DEPARTED":
    case "OFF_BLOCKS":
      return null;
    default:
      if (!f.etd) return null;
      if (segmentIsOtherDay(f.departureDate, dayUtc)) return null;
      return calcMinutes(f.etd, dayUtc, now);
  }
}

/** true solo si hay fecha almacenada Y no es el día visualizado. */
function segmentIsOtherDay(stored: string | null, dayUtc: Date): boolean {
  const cmp = compareStoredDate(stored, dayUtc);
  return cmp !== null && cmp !== 0;
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

  if (minutes < 0) return "alert";                                   // ya pasado el evento, no listo
  if (minutes <= 30 && hasPendingDepServices(f)) return "alert";     // <30min y servicios sin terminar
  if (minutes <= 30) return "imminent";
  if (minutes <= 90) return "soon";
  return "normal";
}

/**
 * ¿Tiene el vuelo servicios de SALIDA sin terminar? Compartido entre
 * rowUrgency y computeHeaderStats para que fila y cabecera no diverjan.
 * Ojo: fuel/toilet NOT_REQUESTED significa "no lo necesita" (1260/1302
 * movements en prod), NO "pendiente" — solo REQUESTED cuenta.
 */
export function hasPendingDepServices(f: FlightLite): boolean {
  const onGroundPreDeparture =
    f.state === "DEPARTING" || f.state === "PARKED" ||
    f.state === "TURNAROUND" || f.state === "BOARDING";
  if (!onGroundPreDeparture) return false;
  return (
    f.fuelState === "REQUESTED" ||
    f.toiletState === "REQUESTED" ||
    (f.services ?? []).some((s) => {
      if (s.state === "DELIVERED") return false;
      const p = servicePhase(s);
      return p === "DEPARTURE" || p === "BOTH";
    })
  );
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
    if (hasPendingDepServices(f)) pendingDepServices++;
    if (rowUrgency(f, dayUtc, now) === "alert") alerts++;
  }
  return { arrivals, departures, approaching, pendingDepServices, alerts };
}
