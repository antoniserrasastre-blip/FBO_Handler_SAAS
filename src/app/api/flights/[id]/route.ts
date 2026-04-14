import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PATCH /api/flights/[id] — update a flight
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Build log entries for significant changes
  const existing = await prisma.flight.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flight = await prisma.flight.update({
    where: { id },
    data: body,
    include: {
      services: { orderBy: { createdAt: "asc" } },
      eventLogs: {
        orderBy: { timestamp: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
      },
    },
  });

  // Log state changes
  if (body.state && body.state !== existing.state) {
    await prisma.eventLog.create({
      data: {
        flightId: id,
        userId: session.user.id,
        action: `Estado cambiado a ${body.state}`,
      },
    });
  }

  // Log fuel changes
  if (body.fuelState && body.fuelState !== existing.fuelState) {
    await prisma.eventLog.create({
      data: {
        flightId: id,
        userId: session.user.id,
        action: `Fuel: ${body.fuelState}`,
      },
    });
  }

  return NextResponse.json(flight);
}

// DELETE /api/flights/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.flight.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
