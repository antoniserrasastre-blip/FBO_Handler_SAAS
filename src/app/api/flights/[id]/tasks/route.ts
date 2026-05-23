// /api/flights/[id]/tasks — checklist tasks. `[id]` is the Visit id; tasks hang from a Movement (leg).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import {
  TASK_TYPES,
  TASK_LABELS,
  TASK_STATES,
  DIRECTIONS,
  type TaskType,
  type TaskState,
  type Direction,
} from "@/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const movements = await prisma.movement.findMany({
    where: { visitId: id },
    include: { tasks: true },
  });

  const tasks = movements.flatMap((movement) =>
    movement.tasks.map((task) => ({ ...task, direction: movement.direction }))
  );

  return NextResponse.json(tasks);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const { id } = await params;

  let body: { direction?: string; type?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON no válido" }, { status: 400 });
  }

  const { direction, type, state } = body;

  if (!direction || !(DIRECTIONS as readonly string[]).includes(direction)) {
    return NextResponse.json({ error: "Dirección no válida" }, { status: 400 });
  }
  if (!type || !(TASK_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Tarea no válida" }, { status: 400 });
  }
  if (!state || !(TASK_STATES as readonly string[]).includes(state)) {
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  }

  const dir = direction as Direction;
  const taskType = type as TaskType;
  const taskState = state as TaskState;

  // Resolve the movement (leg) for this visit + direction.
  let movement = await prisma.movement.findUnique({
    where: { visitId_direction: { visitId: id, direction: dir } },
  });
  if (!movement) {
    movement = await prisma.movement.findFirst({ where: { visitId: id, direction: dir } });
  }
  if (!movement) {
    return NextResponse.json({ error: `El vuelo no tiene leg ${dir}` }, { status: 404 });
  }

  const isDone = taskState === "DONE";
  const doneById = isDone ? session.user.id : null;
  const doneAt = isDone ? new Date() : null;

  const saved = await prisma.movementTask.upsert({
    where: { movementId_type: { movementId: movement.id, type: taskType } },
    create: {
      movementId: movement.id,
      type: taskType,
      state: taskState,
      doneById,
      doneAt,
    },
    update: {
      state: taskState,
      doneById,
      doneAt,
    },
  });

  const action = `Checklist: ${TASK_LABELS[taskType]} → ${taskState}`;

  await prisma.eventLog.create({
    data: {
      visitId: id,
      movementId: movement.id,
      userId: session.user.id,
      action,
    },
  });

  eventBus.emit({
    type: "flight_updated",
    flightId: id,
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: action,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ...saved, direction: movement.direction });
}
