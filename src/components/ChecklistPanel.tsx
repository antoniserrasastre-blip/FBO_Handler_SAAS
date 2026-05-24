// ChecklistPanel — lista de tareas (checklist) de un vuelo, adaptadas al vuelo
// y al puesto del trabajador. En "modo turno" (prop posts) filtra a esos puestos.

"use client";

import { useMemo, useState, useEffect } from "react";
import { Check, Circle, Minus } from "lucide-react";
import { tasksForFlight, checklistProgress, type ChecklistTask } from "@/lib/checklist";
import { SHIFT_POST_LABELS, type ShiftPost, type TaskState } from "@/types";
import type { Flight } from "@/types/compat";

export interface ChecklistPanelProps {
  flight: Flight;
  posts?: ShiftPost[]; // si viene, filtra a esos puestos (modo turno); si no, todas
  readOnly?: boolean;
  onChanged?: () => void;
}

type StateOverride = Record<string, TaskState>;

const DIRECTION_LABELS: Record<ChecklistTask["direction"], string> = {
  ARRIVAL: "Llegada",
  DEPARTURE: "Salida",
};

function keyOf(task: { direction: string; type: string }): string {
  return `${task.direction}:${task.type}`;
}

interface TaskRowProps {
  task: ChecklistTask;
  readOnly?: boolean;
  busy?: boolean;
  onToggle: () => void;
}

function TaskRow({ task, readOnly, busy, onToggle }: TaskRowProps) {
  const done = task.state === "DONE";
  const na = task.state === "NA";
  const interactive = !readOnly && !na;

  const toneClass = done
    ? "hx-pill-success"
    : na
      ? "hx-pill-default text-ink-disabled line-through opacity-60"
      : "hx-pill-default";

  const Icon = done ? Check : na ? Minus : Circle;

  const stateText = done ? "Hecho" : na ? "No aplica" : "Pendiente";
  const hint = !interactive
    ? ""
    : done
      ? " — toca para marcar pendiente"
      : " — toca para marcar hecho";

  return (
    <button
      type="button"
      disabled={!interactive || busy}
      onClick={interactive ? onToggle : undefined}
      className={`hx-pill ${toneClass} ${interactive ? "cursor-pointer" : "cursor-default"}`}
      title={`${task.label}: ${stateText}${hint}`}
      aria-label={`${task.label}: ${stateText}.${hint}`}
      style={{ touchAction: "manipulation" }}
    >
      <Icon size={11} aria-hidden className={done ? undefined : "text-ink-3"} />
      <span className={done ? "line-through opacity-70" : undefined}>{task.label}</span>
    </button>
  );
}

export function ChecklistPanel({ flight, posts, readOnly, onChanged }: ChecklistPanelProps) {
  const [overrides, setOverrides] = useState<StateOverride>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // tasksForFlight ya lee flight.tasks; al cambiar flight.tasks o posts por
  // identidad, reseteamos los overrides locales para re-sincronizar.
  useEffect(() => {
    setOverrides({});
  }, [flight.tasks, posts]);

  const catalogTasks = useMemo(
    () => tasksForFlight(flight, { posts }),
    [flight, posts],
  );

  // Aplicamos los overrides locales (estado optimista) sobre el catálogo.
  const tasks = useMemo<ChecklistTask[]>(
    () =>
      catalogTasks.map((t) => {
        const ov = overrides[keyOf(t)];
        return ov ? { ...t, state: ov } : t;
      }),
    [catalogTasks, overrides],
  );

  if (tasks.length === 0) return null;

  const progress = checklistProgress(tasks);

  const toggle = async (task: ChecklistTask) => {
    if (readOnly || task.state === "NA") return;
    const key = keyOf(task);
    if (busyKey) return;
    const nextState: TaskState = task.state === "DONE" ? "PENDING" : "DONE";

    // Optimista: aplicamos el cambio y revertimos si falla.
    setOverrides((prev) => ({ ...prev, [key]: nextState }));
    setBusyKey(key);
    try {
      const res = await fetch(`/api/flights/${flight.id}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: task.direction,
          type: task.type,
          state: nextState,
        }),
      });
      if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
      const updated = (await res.json()) as { state?: string };
      if (updated && typeof updated.state === "string") {
        setOverrides((prev) => ({ ...prev, [key]: updated.state as TaskState }));
      }
      onChanged?.();
    } catch (err) {
      console.error("ChecklistPanel toggle error", err);
      setOverrides((prev) => ({ ...prev, [key]: task.state }));
    } finally {
      setBusyKey(null);
    }
  };

  // Agrupamos por puesto sólo si se muestran varios puestos sin filtrar a uno.
  const distinctPosts = Array.from(new Set(tasks.map((t) => t.post)));
  const groupByPost = distinctPosts.length > 1;

  const renderPills = (list: ChecklistTask[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((t) => (
        <TaskRow
          key={keyOf(t)}
          task={t}
          readOnly={readOnly}
          busy={busyKey === keyOf(t)}
          onToggle={() => void toggle(t)}
        />
      ))}
    </div>
  );

  // En modo de un solo puesto, agrupamos por dirección (Llegada/Salida) sólo si
  // hay tareas de ambas direcciones; si no, mostramos las pills sin cabecera.
  const distinctDirections = Array.from(new Set(tasks.map((t) => t.direction)));
  const groupByDirection = distinctDirections.length > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-3">Checklist</span>
        <span className="text-xs font-mono text-ink-3">
          {progress.done}/{progress.total}
        </span>
      </div>

      {groupByPost ? (
        distinctPosts.map((post) => (
          <div key={post} className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
              {SHIFT_POST_LABELS[post]}
            </span>
            {renderPills(tasks.filter((t) => t.post === post))}
          </div>
        ))
      ) : groupByDirection ? (
        distinctDirections.map((direction) => (
          <div key={direction} className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
              {DIRECTION_LABELS[direction]}
            </span>
            {renderPills(tasks.filter((t) => t.direction === direction))}
          </div>
        ))
      ) : (
        renderPills(tasks)
      )}
    </div>
  );
}
