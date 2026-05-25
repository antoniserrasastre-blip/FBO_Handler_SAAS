// /api/flights/[id]/passengers — v2
// `[id]` is the Visit id; passengers hang off Movements (ARRIVAL or DEPARTURE).
// PII (passport, DOB) is stored encrypted (AES-256-GCM) with a lookup hash.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import { encrypt, hashPII, tryDecrypt } from "@/lib/crypto";

async function resolveMovementId(visitId: string, direction: string): Promise<string | null> {
  const m = await prisma.movement.findUnique({
    where: { visitId_direction: { visitId, direction } },
  });
  return m?.id || null;
}

// Surface passengers in the legacy shape (decrypted fields, no hashes)
function legacyShape(p: {
  id: string;
  movementId: string;
  givenNames: string | null;
  surname: string | null;
  passportEncrypted: string | null;
  passportType: string | null;
  passportCountry: string | null;
  passportExpiry: string | null;
  dobEncrypted: string | null;
  gender: string | null;
  nationality: string | null;
  status: string;
  verified: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}, direction: string) {
  const passportNumber = tryDecrypt(p.passportEncrypted);
  const dateOfBirth = tryDecrypt(p.dobEncrypted);
  return {
    id: p.id,
    flightId: p.movementId,             // legacy alias (consumers expect flightId)
    direction,
    fullName: [p.givenNames, p.surname].filter(Boolean).join(" ") || "",
    gender: p.gender,
    nationality: p.nationality || p.passportCountry,
    passportNumber,
    dateOfBirth,
    status: p.status,
    verified: p.verified,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// GET /api/flights/[id]/passengers
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: { movements: { include: { passengers: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!visit) return NextResponse.json([]);

  const result: ReturnType<typeof legacyShape>[] = [];
  for (const m of visit.movements) {
    for (const p of m.passengers) result.push(legacyShape(p, m.direction));
  }
  return NextResponse.json(result);
}

// POST /api/flights/[id]/passengers
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const direction = body.direction || "DEPARTURE";
  const movementId = await resolveMovementId(id, direction);
  if (!movementId) {
    return NextResponse.json({ error: `No ${direction} movement for visit ${id}` }, { status: 400 });
  }

  const fullName: string = body.fullName || "";
  const [givenNames, ...rest] = fullName.split(" ");
  const surname = rest.join(" ") || null;

  const passenger = await prisma.passenger.create({
    data: {
      movementId,
      givenNames: givenNames || null,
      surname,
      fullNameHash: hashPII(fullName),
      passportEncrypted: encrypt(body.passportNumber),
      passportHash: hashPII(body.passportNumber),
      passportCountry: body.nationality || null,
      dobEncrypted: encrypt(body.dateOfBirth),
      gender: body.gender || null,
      nationality: body.nationality || null,
      status: body.status || "CONFIRMED",
      source: "MANUAL",
    },
  });

  await prisma.eventLog.create({
    data: {
      visitId: id,
      movementId,
      userId: session!.user.id,
      action: `Pasajero #${passenger.id} añadido`,
      details: `${direction} — ${body.status || "CONFIRMED"}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Pasajero #${passenger.id} añadido`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(legacyShape(passenger, direction), { status: 201 });
}
