// /api/shift — turno (fichaje) CRUD: GET estado, POST abrir, PATCH puestos, DELETE cerrar.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePosts, serializePosts, toShiftDTO } from "@/lib/shift";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function validatePosts(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const posts = parsePosts(raw.join(","));
  return posts.length ? serializePosts(posts) : null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const openShifts = await prisma.shift.findMany({
      where: { endedAt: null },
      include: { user: { select: { name: true } } },
      orderBy: { startedAt: "asc" },
    });

    const activeShifts = openShifts.map((s) => toShiftDTO(s));
    const mine = openShifts.find((s) => s.userId === session.user.id) ?? null;
    const myShift = mine ? toShiftDTO(mine, session.user.name ?? undefined) : null;

    return NextResponse.json({ myShift, activeShifts });
  } catch {
    return NextResponse.json({ error: "Error al obtener el turno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await readBody(req);
    const posts = validatePosts(body.posts);
    if (!posts) return NextResponse.json({ error: "Debe indicar al menos un puesto" }, { status: 400 });

    await prisma.shift.updateMany({
      where: { userId: session.user.id, endedAt: null },
      data: { endedAt: new Date() },
    });

    const created = await prisma.shift.create({
      data: { userId: session.user.id, posts },
    });

    return NextResponse.json(
      { myShift: toShiftDTO(created, session.user.name ?? undefined) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Error al iniciar el turno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await readBody(req);
    const posts = validatePosts(body.posts);
    if (!posts) return NextResponse.json({ error: "Debe indicar al menos un puesto" }, { status: 400 });

    const open = await prisma.shift.findFirst({
      where: { userId: session.user.id, endedAt: null },
    });
    if (!open) return NextResponse.json({ error: "No hay turno abierto" }, { status: 404 });

    const updated = await prisma.shift.update({
      where: { id: open.id },
      data: { posts },
    });

    return NextResponse.json({ myShift: toShiftDTO(updated, session.user.name ?? undefined) });
  } catch {
    return NextResponse.json({ error: "Error al actualizar el turno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await readBody(req);
    const handoverNotes = typeof body.handoverNotes === "string" ? body.handoverNotes : undefined;

    const open = await prisma.shift.findFirst({
      where: { userId: session.user.id, endedAt: null },
    });
    if (!open) return NextResponse.json({ error: "No hay turno abierto" }, { status: 404 });

    await prisma.shift.update({
      where: { id: open.id },
      data: { endedAt: new Date(), ...(handoverNotes !== undefined ? { handoverNotes } : {}) },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al cerrar el turno" }, { status: 500 });
  }
}
