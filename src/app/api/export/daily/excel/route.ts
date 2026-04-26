import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

// GET /api/export/daily/excel?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) return NextResponse.json({ error: "Parametro date requerido" }, { status: 400 });

  const [y, m, d] = dateParam.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

  const daySheet = await prisma.daySheet.findUnique({ where: { date } });
  if (!daySheet) return NextResponse.json({ error: "No hay datos para esta fecha" }, { status: 404 });

  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      passengers: { orderBy: { createdAt: "asc" } },
      crewMembers: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { eta: "asc" },
  });

  const wb = XLSX.utils.book_new();

  // Sheet 1: Flights
  const flightRows = [["Indicativo", "Matricula", "Tipo", "Origen", "ETA", "F. Llegada", "Destino", "ETD", "F. Salida", "Parking", "Estado", "Crew Lleg", "Crew Sal", "Pax Lleg", "Pax Sal", "Combustible", "Toilet", "Servicios"]];
  for (const f of flights) {
    flightRows.push([
      f.callsign, f.registration, f.aircraftType, f.origin || "", f.eta || "", f.arrivalDate || "",
      f.destination || "", f.etd || "", f.departureDate || "", f.parking || "", f.state,
      String(f.crewArrival), String(f.crewDeparture), String(f.paxArrival), String(f.paxDeparture),
      f.fuelState, f.toiletState, String(f.services.length),
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(flightRows);
  ws1["!cols"] = flightRows[0].map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws1, "Vuelos");

  // Sheet 2: Services
  const svcRows = [["Vuelo", "Matricula", "Tipo Servicio", "Nombre", "Estado", "Origen", "Referencia", "Target", "Llegada", "Entrega"]];
  for (const f of flights) {
    for (const s of f.services) {
      svcRows.push([f.callsign, f.registration, s.type, s.customName || "", s.state, s.origin || "", s.reference || "", s.target || "", s.arrivedAt || "", s.deliveredAt || ""]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(svcRows);
  ws2["!cols"] = svcRows[0].map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws2, "Servicios");

  // Sheet 3: Passengers
  const paxRows = [["Vuelo", "Matricula", "Direccion", "Nombre", "Genero", "Pasaporte", "Nacionalidad", "F. Nacimiento", "Estado", "Verificado"]];
  for (const f of flights) {
    for (const p of f.passengers) {
      paxRows.push([f.callsign, f.registration, p.direction, p.fullName, p.gender || "", p.passportNumber || "", p.nationality || "", p.dateOfBirth || "", p.status, p.verified ? "Si" : "No"]);
    }
  }
  const ws3 = XLSX.utils.aoa_to_sheet(paxRows);
  ws3["!cols"] = paxRows[0].map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws3, "Pasajeros");

  // Sheet 4: Crew
  const crewRows = [["Vuelo", "Matricula", "Direccion", "Nombre", "Rol", "Pasaporte", "Nacionalidad", "F. Nacimiento"]];
  for (const f of flights) {
    for (const c of f.crewMembers) {
      crewRows.push([f.callsign, f.registration, c.direction, c.fullName, c.role, c.passportNumber || "", c.nationality || "", c.dateOfBirth || ""]);
    }
  }
  const ws4 = XLSX.utils.aoa_to_sheet(crewRows);
  ws4["!cols"] = crewRows[0].map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws4, "Tripulacion");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dia_${dateParam}.xlsx"`,
    },
  });
}
