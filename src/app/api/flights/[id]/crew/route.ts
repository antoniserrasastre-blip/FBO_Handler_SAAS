import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

// GET /api/flights/[id]/crew
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const crew = await prisma.crewMember.findMany({
    where: { flightId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(crew);
}

// POST /api/flights/[id]/crew
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const member = await prisma.crewMember.create({
    data: {
      flightId: id,
      direction: body.direction,
      fullName: body.fullName,
      nationality: body.nationality || null,
      passportNumber: body.passportNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      role: body.role || "OTHER",
    },
  });

  await prisma.eventLog.create({
    data: {
      flightId: id,
      userId: session!.user.id,
      action: `Tripulante anadido: ${body.fullName}`,
      details: `${body.direction} — ${body.role || "OTHER"}`,
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

  return NextResponse.json(member, { status: 201 });
}
