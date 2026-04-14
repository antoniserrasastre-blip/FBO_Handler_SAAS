import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_LABELS, ServiceType } from "@/types";

// GET /api/export?date=YYYY-MM-DD&format=csv
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const date = new Date(dateParam);
  date.setHours(0, 0, 0, 0);

  const daySheet = await prisma.daySheet.findUnique({ where: { date } });
  if (!daySheet) return NextResponse.json({ error: "No data for this date" }, { status: 404 });

  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: {
      services: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { eta: "asc" },
  });

  const type = req.nextUrl.searchParams.get("type") || "flights";
  const dateStr = date.toISOString().slice(0, 10);

  if (type === "services") {
    // Export billable services
    const rows: string[][] = [
      ["Fecha", "Vuelo", "Matricula", "Tipo Avion", "Servicio", "Nombre", "Origen", "Estado", "Hora Entrega"],
    ];

    for (const flight of flights) {
      for (const svc of flight.services) {
        rows.push([
          dateStr,
          flight.callsign,
          flight.registration,
          flight.aircraftType,
          SERVICE_LABELS[svc.type as ServiceType] || svc.type,
          svc.customName || "",
          svc.origin || "",
          svc.state === "DELIVERED" ? "Entregado" : "Pendiente",
          svc.deliveredAt || "",
        ]);
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="servicios_${dateStr}.csv"`,
      },
    });
  }

  // Default: export flights
  const rows: string[][] = [
    [
      "Fecha", "Indicativo", "Matricula", "Tipo", "Origen", "ETA", "Destino", "ETD",
      "Parking", "Estado", "Crew Lleg", "Crew Sal", "Pax Lleg", "Pax Sal",
      "Maletas Bodega", "Maletas Cabina", "Fuel", "Toilet",
      "Servicios Total", "Servicios Entregados",
    ],
  ];

  for (const f of flights) {
    const deliveredCount = f.services.filter((s) => s.state === "DELIVERED").length;
    rows.push([
      dateStr,
      f.callsign,
      f.registration,
      f.aircraftType,
      f.origin || "",
      f.eta || "",
      f.destination || "",
      f.etd || "",
      f.parking || "",
      f.state,
      String(f.crewArrival),
      String(f.crewDeparture),
      String(f.paxArrival),
      String(f.paxDeparture),
      String(f.paxDepBagsChecked),
      String(f.paxDepBagsCabin),
      f.fuelState,
      f.toiletState,
      String(f.services.length),
      String(deliveredCount),
    ]);
  }

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vuelos_${dateStr}.csv"`,
    },
  });
}
