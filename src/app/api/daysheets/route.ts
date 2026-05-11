import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSupervisor } from "@/lib/roles";

// GET /api/daysheets — list all day sheets with flight counts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const daySheets = await prisma.daySheet.findMany({
    orderBy: { date: "desc" },
    include: {
      _count: { select: { flights: true } },
      flights: {
        select: {
          state: true,
          paxDeparture: true,
          services: { select: { state: true } },
        },
      },
    },
  });

  const result = daySheets.map((ds) => {
    const totalFlights = ds._count.flights;
    const dispatched = ds.flights.filter((f) => f.state === "DISPATCHED").length;
    const totalPax = ds.flights.reduce((sum, f) => sum + f.paxDeparture, 0);
    const totalServices = ds.flights.reduce((sum, f) => sum + f.services.length, 0);
    const deliveredServices = ds.flights.reduce(
      (sum, f) => sum + f.services.filter((s) => s.state === "DELIVERED").length,
      0
    );

    return {
      id: ds.id,
      date: ds.date,
      totalFlights,
      dispatched,
      totalPax,
      totalServices,
      deliveredServices,
    };
  });

  return NextResponse.json(result);
}

// DELETE /api/daysheets?id=xxx — delete a specific day sheet (and all its flights/services/logs)
// DELETE /api/daysheets?all=true — delete ALL data (all daysheets, flights, services, logs)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true") {
    // Wipes audit trail + all operational data — admin only.
    const { error } = await requireAdmin();
    if (error) return error;
    await prisma.eventLog.deleteMany();
    await prisma.service.deleteMany();
    await prisma.flight.deleteMany();
    await prisma.daySheet.deleteMany();
    return NextResponse.json({ ok: true, message: "Todos los datos eliminados" });
  }

  const { error } = await requireSupervisor();
  if (error) return error;

  if (id) {
    const ds = await prisma.daySheet.findUnique({ where: { id } });
    if (!ds) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    await prisma.daySheet.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: `DaySheet ${ds.date.toISOString().slice(0, 10)} eliminado` });
  }

  return NextResponse.json({ error: "Falta parametro id o all=true" }, { status: 400 });
}
