// /api/daysheets — v2. DaySheet is no longer a row in the DB; it's derived
// from `Visit.palmaDay`. We aggregate Visits by palmaDay and expose the same
// shape the UI expects.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSupervisor } from "@/lib/roles";
import { palmaDayUtc } from "@/lib/time";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visits = await prisma.visit.findMany({
    include: {
      movements: { select: { paxCount: true, state: true } },
      services: { select: { state: true } },
    },
  });

  // Group by palmaDay ISO key
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = v.palmaDay.toISOString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(v);
  }

  const result = Array.from(byDay.entries())
    .map(([iso, list]) => {
      const date = new Date(iso);
      const totalFlights = list.length;
      const dispatched = list.filter((v) =>
        v.movements.some((m) => m.state === "OFF_BLOCKS")
      ).length;
      const totalPax = list.reduce(
        (sum, v) =>
          sum +
          v.movements.reduce((s2, m) => s2 + (m.paxCount || 0), 0),
        0
      );
      const totalServices = list.reduce((sum, v) => sum + v.services.length, 0);
      const deliveredServices = list.reduce(
        (sum, v) => sum + v.services.filter((s) => s.state === "DELIVERED").length,
        0
      );
      return {
        id: iso,
        date,
        totalFlights,
        dispatched,
        totalPax,
        totalServices,
        deliveredServices,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true") {
    const { error } = await requireAdmin();
    if (error) return error;
    await prisma.eventLog.deleteMany();
    await prisma.crewAssignment.deleteMany();
    await prisma.passenger.deleteMany();
    await prisma.service.deleteMany();
    await prisma.lostItem.deleteMany();
    await prisma.movement.deleteMany();
    await prisma.visit.deleteMany();
    return NextResponse.json({ ok: true, message: "Todos los datos eliminados" });
  }

  const { error } = await requireSupervisor();
  if (error) return error;

  if (id) {
    // `id` is a palmaDay ISO; delete every Visit on that day
    const palmaDay = palmaDayUtc(new Date(id));
    const count = await prisma.visit.deleteMany({ where: { palmaDay } });
    return NextResponse.json({
      ok: true,
      message: `${count.count} visits eliminadas para ${palmaDay.toISOString().slice(0, 10)}`,
    });
  }

  return NextResponse.json({ error: "Falta parametro id o all=true" }, { status: 400 });
}
