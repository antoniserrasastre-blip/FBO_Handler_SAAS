// /api/passengers/[id] — v2

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import { encrypt, hashPII, decrypt } from "@/lib/crypto";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.passenger.findUnique({
    where: { id },
    include: { movement: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.fullName !== undefined) {
    const fullName: string = body.fullName;
    const [givenNames, ...rest] = fullName.split(" ");
    data.givenNames = givenNames || null;
    data.surname = rest.join(" ") || null;
    data.fullNameHash = hashPII(fullName);
    changes.push(`fullName: ${fullName}`);
  }

  if (body.gender !== undefined && body.gender !== existing.gender) {
    data.gender = body.gender;
    changes.push(`gender: ${body.gender}`);
  }
  if (body.nationality !== undefined && body.nationality !== existing.nationality) {
    data.nationality = body.nationality;
    changes.push(`nationality: ${body.nationality}`);
  }
  if (body.passportNumber !== undefined) {
    const previousPassport = existing.passportEncrypted ? decrypt(existing.passportEncrypted) : null;
    if (body.passportNumber !== previousPassport) {
      data.passportEncrypted = encrypt(body.passportNumber);
      data.passportHash = hashPII(body.passportNumber);
      changes.push("passportNumber actualizado");
    }
  }
  if (body.dateOfBirth !== undefined) {
    const previousDob = existing.dobEncrypted ? decrypt(existing.dobEncrypted) : null;
    if (body.dateOfBirth !== previousDob) {
      data.dobEncrypted = encrypt(body.dateOfBirth);
      changes.push("dateOfBirth actualizado");
    }
  }
  if (body.status !== undefined && body.status !== existing.status) {
    data.status = body.status;
    changes.push(`status: ${body.status}`);
  }
  if (body.corrections !== undefined && body.corrections !== existing.corrections) {
    data.corrections = body.corrections;
  }
  if (body.verified !== undefined && body.verified !== existing.verified) {
    data.verified = body.verified;
    changes.push(body.verified ? "Verificado" : "No verificado");
  }

  if (!Object.keys(data).length) {
    return NextResponse.json(existing);
  }

  const updated = await prisma.passenger.update({ where: { id }, data });

  const fullName = [updated.givenNames, updated.surname].filter(Boolean).join(" ") || "";

  // visitId from the movement
  const visitId = existing.movement.visitId;

  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: existing.movementId,
      userId: session!.user.id,
      action: `Pasajero ${fullName}: ${changes.join(", ")}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Pasajero: ${changes.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;

  const existing = await prisma.passenger.findUnique({
    where: { id },
    include: { movement: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.passenger.delete({ where: { id } });

  const fullName = [existing.givenNames, existing.surname].filter(Boolean).join(" ") || "";
  const visitId = existing.movement.visitId;

  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: existing.movementId,
      userId: session!.user.id,
      action: `Pasajero eliminado: ${fullName}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: visitId,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Eliminado: ${fullName}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
