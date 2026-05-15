// /api/flights/[id]/crew — v2
// In v2 crew is persistent (`CrewMember` table keyed by operator + passportHash)
// and linked to each Movement via `CrewAssignment`. The legacy shape (one row
// per direction) is reconstructed by joining both.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";
import { encrypt, hashPII, decrypt } from "@/lib/crypto";
import { upsertOperator } from "@/lib/v2/upsert";
import { findOperator } from "@/lib/operators";

// Map legacy CrewRole → v2 roleOnFlight (same values, but keep the mapping
// explicit so a future role enum change is local).
const ROLE_MAP: Record<string, string> = {
  CAPTAIN: "CAPTAIN",
  FIRST_OFFICER: "FIRST_OFFICER",
  CABIN_CREW: "CABIN_CREW",
  OTHER: "OTHER",
};

interface CrewLegacyShape {
  id: string;
  flightId: string;
  direction: string;
  fullName: string;
  nationality: string | null;
  passportNumber: string | null;
  dateOfBirth: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

function legacyShape(args: {
  assignmentId: string;
  visitId: string;
  direction: string;
  crewMember: {
    fullName: string;
    nationality: string | null;
    passportEncrypted: string | null;
    dobEncrypted: string | null;
  };
  roleOnFlight: string;
  createdAt: Date;
  updatedAt: Date;
}): CrewLegacyShape {
  return {
    id: args.assignmentId,
    flightId: args.visitId,
    direction: args.direction,
    fullName: args.crewMember.fullName,
    nationality: args.crewMember.nationality,
    passportNumber: args.crewMember.passportEncrypted ? decrypt(args.crewMember.passportEncrypted) : null,
    dateOfBirth: args.crewMember.dobEncrypted ? decrypt(args.crewMember.dobEncrypted) : null,
    role: args.roleOnFlight,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      movements: {
        include: {
          crewAssignments: {
            include: { crewMember: true },
          },
        },
      },
    },
  });
  if (!visit) return NextResponse.json([]);

  const result: CrewLegacyShape[] = [];
  for (const m of visit.movements) {
    for (const a of m.crewAssignments) {
      result.push(legacyShape({
        assignmentId: `${a.movementId}__${a.crewMemberId}`,
        visitId: visit.id,
        direction: m.direction,
        crewMember: a.crewMember,
        roleOnFlight: a.roleOnFlight,
        createdAt: a.createdAt,
        updatedAt: a.createdAt,
      }));
    }
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: { movements: true, operator: true, aircraft: true },
  });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const direction = body.direction || "DEPARTURE";
  const movement = visit.movements.find((m) => m.direction === direction);
  if (!movement) {
    return NextResponse.json({ error: `No ${direction} movement` }, { status: 400 });
  }

  // Resolve operator: use Visit.operatorId or derive from movement.callsign
  let operatorId = visit.operatorId;
  if (!operatorId && movement.callsign) {
    const op = findOperator(movement.callsign);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
      await prisma.visit.update({ where: { id: visit.id }, data: { operatorId } });
    }
  }
  if (!operatorId) {
    // Fallback: a synthetic operator "UNK" so crew has a home
    const unk = await upsertOperator("UNK", "Operador desconocido");
    operatorId = unk.id;
  }

  // Find or create CrewMember by (operatorId, passportHash)
  const passportHash = hashPII(body.passportNumber);
  let crewMember = passportHash
    ? await prisma.crewMember.findUnique({
        where: { operatorId_passportHash: { operatorId, passportHash } },
      })
    : null;
  if (!crewMember) {
    crewMember = await prisma.crewMember.create({
      data: {
        operatorId,
        fullName: body.fullName,
        nationality: body.nationality || null,
        passportEncrypted: encrypt(body.passportNumber),
        passportHash,
        dobEncrypted: encrypt(body.dateOfBirth),
        role: ROLE_MAP[body.role] || "OTHER",
      },
    });
  }

  await prisma.crewAssignment.upsert({
    where: {
      movementId_crewMemberId: { movementId: movement.id, crewMemberId: crewMember.id },
    },
    create: {
      movementId: movement.id,
      crewMemberId: crewMember.id,
      roleOnFlight: ROLE_MAP[body.role] || "OTHER",
    },
    update: { roleOnFlight: ROLE_MAP[body.role] || "OTHER" },
  });

  await prisma.eventLog.create({
    data: {
      visitId: id,
      movementId: movement.id,
      userId: session!.user.id,
      action: `Tripulante anadido: ${body.fullName}`,
      details: `${direction} — ${body.role || "OTHER"}`,
    },
  });

  eventBus.emit({
    type: "crew_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Tripulante: ${body.fullName}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(
    legacyShape({
      assignmentId: `${movement.id}__${crewMember.id}`,
      visitId: id,
      direction,
      crewMember,
      roleOnFlight: ROLE_MAP[body.role] || "OTHER",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    { status: 201 }
  );
}
