// postFocus — deriva un "foco" de tarjeta a partir de los puestos de turno
// activos (ShiftPost[]). Es la regla que decide qué leg manda en la VisitCard
// cuando el pistero está fichado en un puesto concreto.
//
// Mismo criterio que SHIFT_POST_FOCUS (src/types/index.ts), pero colapsado a un
// único valor cuando hay varios puestos a la vez:
//   - Sin turno / varios puestos / RAMP / COORDINATOR  → FULL (vuelo completo)
//   - solo ARRIVALS                                     → ARRIVAL
//   - solo DEPARTURES                                   → DEPARTURE
//   - solo RUNNER                                       → SERVICES
//
// "Filtro" = ARRIVALS + DEPARTURES juntos → control de pasajeros en ambos legs,
// así que cae en FULL (no hay un único leg que mande).

import type { ShiftPost } from "@/types";
import {
  FLIGHT_STATES,
  FLIGHT_STATE_CONFIG,
  normalizeFlightState,
  type FlightState,
} from "@/types";
import type { ChecklistTask } from "@/lib/checklist";

export type CardFocus = "FULL" | "ARRIVAL" | "DEPARTURE" | "SERVICES";

/**
 * Reduce los puestos activos a un único foco de tarjeta.
 *
 * Regla: un puesto "ancho" (RAMP/COORDINATOR) o la combinación de varios
 * puestos distintos siempre gana → FULL. Solo cuando hay exactamente un puesto
 * "estrecho" (ARRIVALS, DEPARTURES o RUNNER) la tarjeta se especializa.
 */
export function deriveFocus(shiftPosts?: ShiftPost[] | null): CardFocus {
  if (!shiftPosts || shiftPosts.length === 0) return "FULL";

  // Puestos anchos: ven el vuelo entero.
  if (shiftPosts.includes("RAMP") || shiftPosts.includes("COORDINATOR")) return "FULL";

  // Distintos puestos estrechos a la vez (p. ej. "Filtro" = ARRIVALS+DEPARTURES)
  // → no hay un único leg que mande, así que FULL.
  const unique = Array.from(new Set(shiftPosts));
  if (unique.length !== 1) return "FULL";

  switch (unique[0]) {
    case "ARRIVALS":
      return "ARRIVAL";
    case "DEPARTURES":
      return "DEPARTURE";
    case "RUNNER":
      return "SERVICES";
    default:
      return "FULL";
  }
}

/** ¿El foco prioriza el leg de llegada en cabecera/orden? */
export function focusLeadsArrival(focus: CardFocus): boolean {
  return focus === "ARRIVAL";
}

/** ¿El foco prioriza el leg de salida en cabecera/orden? */
export function focusLeadsDeparture(focus: CardFocus): boolean {
  return focus === "DEPARTURE";
}

/**
 * Orden en el que se pintan los dos legs según el foco. El primero es el leg
 * "grande/principal"; el segundo va compacto/atenuado.
 *  - ARRIVAL   → [ARRIVAL, DEPARTURE]
 *  - DEPARTURE → [DEPARTURE, ARRIVAL]
 *  - FULL / SERVICES → orden cronológico natural [ARRIVAL, DEPARTURE]
 */
export function legOrder(focus: CardFocus): ["ARRIVAL" | "DEPARTURE", "ARRIVAL" | "DEPARTURE"] {
  if (focus === "DEPARTURE") return ["DEPARTURE", "ARRIVAL"];
  return ["ARRIVAL", "DEPARTURE"];
}

/**
 * ¿Hay que atenuar/compactar el leg secundario? En FULL ambos legs van con la
 * misma jerarquía; en los focos especializados el secundario se degrada.
 */
export function hasSecondaryLeg(focus: CardFocus): boolean {
  return focus === "ARRIVAL" || focus === "DEPARTURE" || focus === "SERVICES";
}

// ── Acción primaria ─────────────────────────────────────────────────────────
//
// Cada tarjeta tiene UNA acción primaria: el siguiente paso ejecutable. Se
// resuelve según el foco:
//   - ARRIVAL/DEPARTURE/SERVICES → la próxima tarea pendiente del puesto en ese
//     leg (marcar como hecha). Si no quedan tareas, cae al avance de estado.
//   - FULL → avanzar el estado del vuelo al siguiente del ciclo.
// Si el vuelo ya está fuera de calzos no hay acción primaria.

export type PrimaryAction =
  | { kind: "task"; task: ChecklistTask; label: string }
  | { kind: "state"; next: FlightState; label: string }
  | null;

// Etiqueta de la acción que LLEVA a cada estado (el botón avanza hacia `next`,
// por eso la clave es el estado destino). EXPECTED nunca es destino (índice 0),
// así que su etiqueta no se usa.
const NEXT_STATE_LABEL: Record<FlightState, string> = {
  EXPECTED: "Esperando llegada",
  ON_BLOCKS: "Marcar en calzos",
  PARKED: "Marcar en plataforma",
  TURNAROUND: "Empezar preparación",
  BOARDING: "Marcar embarque",
  OFF_BLOCKS: "Marcar despegue",
};

/** Siguiente estado del ciclo, o null si ya está fuera de calzos. */
export function nextFlightState(state: string): FlightState | null {
  const current = normalizeFlightState(state);
  const idx = FLIGHT_STATES.indexOf(current);
  if (idx < 0 || idx >= FLIGHT_STATES.length - 1) return null;
  return FLIGHT_STATES[idx + 1];
}

/**
 * Resuelve la acción primaria de la tarjeta. `tasks` ya viene filtrado al/los
 * puesto(s) del turno (ver tasksForFlight). En focos de un solo leg priorizamos
 * la primera tarea pendiente de ese leg; si no hay, avanzamos estado.
 */
export function derivePrimaryAction(
  focus: CardFocus,
  state: string,
  tasks: ChecklistTask[],
): PrimaryAction {
  const next = nextFlightState(state);

  // Foco de leg: busca la primera tarea pendiente del leg relevante.
  const leg: "ARRIVAL" | "DEPARTURE" | null =
    focus === "ARRIVAL" ? "ARRIVAL" : focus === "DEPARTURE" ? "DEPARTURE" : null;

  if (leg) {
    const pending = tasks.find((t) => t.direction === leg && t.state === "PENDING");
    if (pending) return { kind: "task", task: pending, label: pending.label };
  } else if (focus === "SERVICES") {
    // Runner: cualquier tarea pendiente del puesto (las suyas son de servicio).
    const pending = tasks.find((t) => t.state === "PENDING");
    if (pending) return { kind: "task", task: pending, label: pending.label };
  }

  if (next) return { kind: "state", next, label: NEXT_STATE_LABEL[next] };
  return null;
}

/** Color del estado destino, para teñir el botón primario de avance de estado. */
export function nextStateColor(next: FlightState): string {
  return FLIGHT_STATE_CONFIG[next]?.color ?? "var(--c-brand)";
}
