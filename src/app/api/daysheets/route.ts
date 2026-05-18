// /api/daysheets — v2. The day list is the UNION of two sources:
//   1. Days derived from Visit.palmaDay (auto-materialised when flights exist)
//   2. Explicit DaySheet rows (supervisor "prepared" a day before flights)
// Both are merged into one response, sorted desc by date. The optional
// DaySheet row contributes day-level metadata (notes, closed); when only
// (1) is present, those fields are null/false.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSupervisor, requireWriter } from "@/lib/roles";
import { palmaDayUtc } from "@/lib/time";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [visits, daySheets] = await Promise.all([
    prisma.visit.findMany({
      include: {
        movements: { select: { paxCount: true, state: true } },
        services: { select: { state: true } },
      },
    }),
    prisma.daySheet.findMany(),
  ]);

  // Group Visits by palmaDay ISO key
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = v.palmaDay.toISOString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(v);
  }

  // Index DaySheet rows by date ISO for O(1) lookup + ensure every explicit
  // day is represented even if it has zero Visits.
  const daySheetByDate = new Map<string, (typeof daySheets)[number]>();
  for (const ds of daySheets) {
    daySheetByDate.set(ds.date.toISOString(), ds);
    if (!byDay.has(ds.date.toISOString())) {
      byDay.set(ds.date.toISOString(), []);
    }
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
      const ds = daySheetByDate.get(iso);
      return {
        id: iso,
        date,
        totalFlights,
        dispatched,
        totalPax,
        totalServices,
        deliveredServices,
        notes: ds?.notes ?? null,
        closed: ds?.closed ?? false,
        manual: !!ds && totalFlights === 0,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return NextResponse.json(result);
}

// POST /api/daysheets — body: { date: ISO 8601 string | YYYY-MM-DD }
// Upserts a DaySheet row at palmaDayUtc(date). Idempotent.
export async function POST(req: NextRequest) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const body = (await req.json().catch(() => null)) as { date?: string; notes?: string } | null;
  if (!body?.date) return NextResponse.json({ error: "Falta date" }, { status: 400 });

  const palmaDay = palmaDayUtc(new Date(body.date));
  if (Number.isNaN(palmaDay.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const ds = await prisma.daySheet.upsert({
    where: { date: palmaDay },
    create: { date: palmaDay, notes: body.notes ?? null },
    update: body.notes !== undefined ? { notes: body.notes } : {},
  });

  await prisma.eventLog.create({
    data: {
      userId: session.user.id,
      action: `DaySheet preparado: ${palmaDay.toISOString().slice(0, 10)}`,
    },
  });

  return NextResponse.json({ id: ds.date.toISOString(), date: ds.date, notes: ds.notes, closed: ds.closed });
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
    await prisma.daySheet.deleteMany();
    return NextResponse.json({ ok: true, message: "Todos los datos eliminados" });
  }

  const { error } = await requireSupervisor();
  if (error) return error;

  if (id) {
    // `id` is a palmaDay ISO; delete every Visit on that day AND any
    // manual DaySheet row at that date.
    const palmaDay = palmaDayUtc(new Date(id));
    const count = await prisma.visit.deleteMany({ where: { palmaDay } });
    await prisma.daySheet.deleteMany({ where: { date: palmaDay } });
    return NextResponse.json({
      ok: true,
      message: `${count.count} visits eliminadas para ${palmaDay.toISOString().slice(0, 10)}`,
    });
  }

  return NextResponse.json({ error: "Falta parametro id o all=true" }, { status: 400 });
}
