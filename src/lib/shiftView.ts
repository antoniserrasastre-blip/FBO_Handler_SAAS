// Lógica pura de proyección de "colas por puesto" del modo turno.
//
// Reduce la lista completa de vuelos a las colas relevantes según los puestos
// fichados (ARRIVALS / DEPARTURES / RAMP / RUNNER / COORDINATOR). No toca UI ni
// DB: recibe vuelos estructurales y devuelve subconjuntos. Reusa
// `minutesUntil_HHMM` para parsear horas "HH:MM" Zulu.

import { normalizeFlightState, SHIFT_POST_FOCUS, type ShiftPost } from "@/types";
import { minutesUntil_HHMM } from "@/lib/flightUrgency";

// Estructura mínima que necesita la proyección. `Flight` de compat (FlightView)
// la satisface. Estructural a propósito: no importamos Flight.
export interface ShiftViewFlight {
  id: string;
  state: string;
  eta?: string | null;
  etd?: string | null;
  ata?: string | null;
  atd?: string | null;
  // compat (FlightView) NO tiene `assignedToId`; lo dejamos opcional para que
  // futuros consumidores puedan pasarlo, pero hoy `mine` queda siempre vacío.
  assignedToId?: string | null;
  services?: { state: string }[];
}

export interface ShiftQueues<T> {
  mine: T[];
  arrivals: T[];
  departures: T[];
  ramp: T[];
  runner: T[];
}

export interface ProjectOptions {
  posts: ShiftPost[];
  nowUtcMinutes?: number;
  windowMinutes?: number;
  currentUserId?: string | null;
}

function nowMinutes(opts: ProjectOptions): number {
  return opts.nowUtcMinutes ?? new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
}

// Un vuelo ya despegado nunca entra en ninguna cola.
function hasDeparted(flight: ShiftViewFlight): boolean {
  if (flight.atd) return true;
  return normalizeFlightState(flight.state) === "OFF_BLOCKS";
}

// True si `hhmm` cae entre now y now + windowMinutes (futuro próximo).
function withinUpcoming(hhmm: string | null | undefined, now: number, windowMinutes: number): boolean {
  if (!hhmm) return false;
  const delta = minutesUntil_HHMM(hhmm, now);
  if (delta === null) return false;
  return delta >= 0 && delta <= windowMinutes;
}

// Activo ahora: en tierra (no EXPECTED, no OFF_BLOCKS) y sin despegar.
function isActiveNow(flight: ShiftViewFlight): boolean {
  const state = normalizeFlightState(flight.state);
  return state !== "EXPECTED" && state !== "OFF_BLOCKS";
}

// Vuelo dentro de la ventana operativa: activo ahora, o con ETA/ETD próximas.
function inWindow(flight: ShiftViewFlight, now: number, windowMinutes: number): boolean {
  if (hasDeparted(flight)) return false;
  if (isActiveNow(flight)) return true;
  return (
    withinUpcoming(flight.eta, now, windowMinutes) ||
    withinUpcoming(flight.etd, now, windowMinutes)
  );
}

function hasPendingService(flight: ShiftViewFlight): boolean {
  return (flight.services ?? []).some((s) => s.state !== "DELIVERED" && s.state !== "CANCELLED");
}

// Lado llegada aún abierto: en ventana, no despegado y estado EXPECTED (con ETA
// en ventana) u ON_BLOCKS — todavía hay recepción que hacer.
function isArrivalQueue(flight: ShiftViewFlight, now: number, windowMinutes: number): boolean {
  if (!inWindow(flight, now, windowMinutes)) return false;
  const state = normalizeFlightState(flight.state);
  if (state === "ON_BLOCKS") return true;
  if (state === "EXPECTED") return withinUpcoming(flight.eta, now, windowMinutes);
  return false;
}

// Lado salida aún abierto: en ventana, no despegado y ETD en ventana o estado de
// preparación/embarque/parking/calzos.
function isDepartureQueue(flight: ShiftViewFlight, now: number, windowMinutes: number): boolean {
  if (!inWindow(flight, now, windowMinutes)) return false;
  const state = normalizeFlightState(flight.state);
  if (state === "TURNAROUND" || state === "BOARDING" || state === "PARKED" || state === "ON_BLOCKS") {
    return true;
  }
  return withinUpcoming(flight.etd, now, windowMinutes);
}

export function projectShiftQueues<T extends ShiftViewFlight>(
  flights: T[],
  opts: ProjectOptions,
): ShiftQueues<T> {
  const now = nowMinutes(opts);
  const windowMinutes = opts.windowMinutes ?? 60;
  const userId = opts.currentUserId ?? null;

  const arrivals: T[] = [];
  const departures: T[] = [];
  const ramp: T[] = [];
  const runner: T[] = [];
  const mine: T[] = [];

  for (const f of flights) {
    if (!inWindow(f, now, windowMinutes)) continue;

    const inArr = isArrivalQueue(f, now, windowMinutes);
    const inDep = isDepartureQueue(f, now, windowMinutes);

    if (inArr) arrivals.push(f);
    if (inDep) departures.push(f);
    if (inArr || inDep) ramp.push(f);
    if (hasPendingService(f)) runner.push(f);
    // compat (FlightView) no expone `assignedToId`, así que en la práctica esto
    // no se cumple y `mine` queda vacío hasta que el campo exista.
    if (userId && f.assignedToId === userId) mine.push(f);
  }

  return { mine, arrivals, departures, ramp, runner };
}

export function visibleForPosts<T extends ShiftViewFlight>(
  flights: T[],
  opts: ProjectOptions,
): T[] {
  const queues = projectShiftQueues(flights, opts);
  const selected = new Set<string>();

  for (const post of opts.posts) {
    const focus = SHIFT_POST_FOCUS[post];
    let queue: T[];
    if (focus === "ARRIVAL") queue = queues.arrivals;
    else if (focus === "DEPARTURE") queue = queues.departures;
    else if (focus === "SERVICES") queue = queues.runner;
    else queue = queues.ramp;
    for (const f of queue) selected.add(f.id);
    // RAMP / COORDINATOR (focus BOTH) también ven sus vuelos asignados.
    if (focus === "BOTH") for (const f of queues.mine) selected.add(f.id);
  }

  return flights.filter((f) => selected.has(f.id));
}
