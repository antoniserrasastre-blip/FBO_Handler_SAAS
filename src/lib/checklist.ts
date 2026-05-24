import { TASK_LABELS, type TaskType, type TaskState, type ShiftPost } from "@/types";
import { getRequiredAuthorities } from "@/lib/countries";

export interface ChecklistFlight {
  origin?: string | null;
  petCount?: number;
  paxArrival?: number;
  paxDeparture?: number;
  crewArrival?: number;
  crewDeparture?: number;
  arrivalMovementId?: string | null;
  departureMovementId?: string | null;
  services?: { type: string; state: string }[];
  tasks?: { type: string; state: string; direction: string }[];
}

export interface TaskDef {
  type: TaskType;
  post: ShiftPost;
  direction: "ARRIVAL" | "DEPARTURE";
  applies: (flight: ChecklistFlight) => boolean;
}

export interface ChecklistTask {
  type: TaskType;
  label: string;
  post: ShiftPost;
  direction: "ARRIVAL" | "DEPARTURE";
  state: TaskState;
}

export const CHECKLIST_CATALOG: TaskDef[] = [
  {
    type: "PAX_COUNTED",
    post: "ARRIVALS",
    direction: "ARRIVAL",
    applies: () => true,
  },
  {
    type: "CREW_RECEIVED",
    post: "ARRIVALS",
    direction: "ARRIVAL",
    applies: (f) => (f.crewArrival ?? 0) > 0,
  },
  {
    type: "POLICE_NOTIFIED",
    post: "ARRIVALS",
    direction: "ARRIVAL",
    applies: (f) => {
      const auth = getRequiredAuthorities(f.origin);
      return auth.policia || auth.guardaCivil;
    },
  },
  {
    type: "PETS_ARRIVAL",
    post: "ARRIVALS",
    direction: "ARRIVAL",
    applies: (f) => (f.petCount ?? 0) > 0,
  },
  {
    type: "SECURITY_PAX",
    post: "DEPARTURES",
    direction: "DEPARTURE",
    applies: (f) => (f.paxDeparture ?? 0) > 0,
  },
  {
    type: "SECURITY_CREW",
    post: "DEPARTURES",
    direction: "DEPARTURE",
    applies: (f) => (f.crewDeparture ?? 0) > 0,
  },
  {
    type: "CATERING_LOADED",
    post: "DEPARTURES",
    direction: "DEPARTURE",
    applies: (f) =>
      (f.services ?? []).some((s) => s.type === "CATERING" && s.state !== "CANCELLED"),
  },
  {
    type: "PETS_DEPARTURE",
    post: "DEPARTURES",
    direction: "DEPARTURE",
    applies: (f) => (f.petCount ?? 0) > 0,
  },
  {
    type: "GPU",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
  {
    type: "WATER",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
  {
    type: "CLEANING",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
  {
    type: "STAIRS",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
  {
    type: "ASU",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
  {
    type: "PUSHBACK",
    post: "RAMP",
    direction: "DEPARTURE",
    applies: () => true,
  },
];

function legExists(flight: ChecklistFlight, direction: "ARRIVAL" | "DEPARTURE"): boolean {
  return direction === "ARRIVAL"
    ? flight.arrivalMovementId != null
    : flight.departureMovementId != null;
}

export function tasksForFlight(
  flight: ChecklistFlight,
  opts?: { posts?: ShiftPost[] },
): ChecklistTask[] {
  const posts = opts?.posts;
  const result: ChecklistTask[] = [];

  for (const def of CHECKLIST_CATALOG) {
    if (posts && !posts.includes(def.post)) continue;
    if (!legExists(flight, def.direction)) continue;
    if (!def.applies(flight)) continue;

    const row = (flight.tasks ?? []).find(
      (t) => t.type === def.type && t.direction === def.direction,
    );
    const state = (row?.state as TaskState) ?? "PENDING";

    result.push({
      type: def.type,
      label: TASK_LABELS[def.type],
      post: def.post,
      direction: def.direction,
      state,
    });
  }

  return result;
}

export function checklistProgress(tasks: ChecklistTask[]): { done: number; total: number } {
  const done = tasks.filter((t) => t.state === "DONE" || t.state === "NA").length;
  return { done, total: tasks.length };
}
