// /api/crew/[id] — v2
// `[id]` is a composite "movementId__crewMemberId" produced by the legacy
// adapter in /api/flights/[id]/crew/route.ts (CrewAssignment has no scalar id).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import { encrypt, hashPII, decrypt } from "@/lib/crypto";

function parseCompositeId(id: string): { movementId: string; crewMemberId: string } | null {
  const [movementId, crewMemberId] = id.split("__");
  if (!movementId || !crewMemberId) return null;
  return { movementId, crewMemberId };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const parsed = parseCompositeId(id);
  if (!parsed) return NextResponse.json({ error: "Invalid crew id" }, { status: 400 });

  const assignment = await prisma.crewAssignment.findUnique({
    where: { movementId_crewMemberId: parsed },
    include: { crewMember: true, movement: true },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const crewData: Record<string, unknown> = {};
  const assignmentData: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.fullName !== undefined && body.fullName !== assignment.crewMember.fullName) {
    crewData.fullName = body.fullName;
    changes.push("cambió fullName");
  }
  if (body.nationality !== undefined && body.nationality !== assignment.crewMember.nationality) {
    crewData.nationality = body.nationality;
    changes.push(`nationality: ${body.nationality}`);
  }
  if (body.passportNumber !== undefined) {
    const prev = assignment.crewMember.passportEncrypted ? decrypt(assignment.crewMember.passportEncrypted) : null;
    if (body.passportNumber !== prev) {
      crewData.passportEncrypted = encrypt(body.passportNumber);
      crewData.passportHash = hashPII(body.passportNumber);
      changes.push("passportNumber actualizado");
    }
  }
  if (body.dateOfBirth !== undefined) {
    const prev = assignment.crewMember.dobEncrypted ? decrypt(assignment.crewMember.dobEncrypted) : null;
    if (body.dateOfBirth !== prev) {
      crewData.dobEncrypted = encrypt(body.dateOfBirth);
      changes.push("dateOfBirth actualizado");
    }
  }
  if (body.role !== undefined && body.role !== assignment.roleOnFlight) {
    assignmentData.roleOnFlight = body.role;
    changes.push(`role: ${body.role}`);
  }

  if (Object.keys(crewData).length) {
    await prisma.crewMember.update({ where: { id: assignment.crewMemberId }, data: crewData });
  }
  if (Object.keys(assignmentData).length) {
    await prisma.crewAssignment.update({
      where: { movementId_crewMemberId: parsed },
      data: assignmentData,
    });
  }

  if (!changes.length) {
    return NextResponse.json({ ok: true });
  }

  const visitId = assignment.movement.visitId;
  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: assignment.movementId,
      userId: session!.user.id,
      action: `Tripulante #${assignment.crewMemberId} actualizado: ${changes.join(", ")}`,
    },
  });

  eventBus.emit({
    type: "crew_updated",
    flightId: visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Tripulante: ${changes.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;

  const parsed = parseCompositeId(id);
  if (!parsed) return NextResponse.json({ error: "Invalid crew id" }, { status: 400 });

  const assignment = await prisma.crewAssignment.findUnique({
    where: { movementId_crewMemberId: parsed },
    include: { crewMember: true, movement: true },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.crewAssignment.delete({ where: { movementId_crewMemberId: parsed } });

  const visitId = assignment.movement.visitId;
  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: assignment.movementId,
      userId: session!.user.id,
      action: `Tripulante #${assignment.crewMemberId} eliminado`,
    },
  });

  eventBus.emit({
    type: "crew_updated",
    flightId: visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Tripulante #${assignment.crewMemberId} eliminado`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
