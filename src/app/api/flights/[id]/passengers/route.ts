import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";
import { eventBus } from "@/lib/events";

// GET /api/flights/[id]/passengers
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const passengers = await prisma.passenger.findMany({
    where: { flightId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(passengers);
}

// POST /api/flights/[id]/passengers
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireWriter();
  if (error) return error;

  const session = await getServerSession(authOptions);
  const { id } = await params;
  const body = await req.json();

  const passenger = await prisma.passenger.create({
    data: {
      flightId: id,
      direction: body.direction,
      fullName: body.fullName,
      gender: body.gender || null,
      nationality: body.nationality || null,
      passportNumber: body.passportNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      status: body.status || "CONFIRMED",
    },
  });

  await prisma.eventLog.create({
    data: {
      flightId: id,
      userId: session!.user.id,
      action: `Pasajero anadido: ${body.fullName}`,
      details: `${body.direction} — ${body.status || "CONFIRMED"}`,
    },
  });

  eventBus.emit({
    type: "passenger_updated",
    flightId: id,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    detail: `Pasajero: ${body.fullName}`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(passenger, { status: 201 });
}
