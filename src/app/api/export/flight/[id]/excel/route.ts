import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

// GET /api/export/flight/[id]/excel
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const flight = await prisma.flight.findUnique({
    where: { id },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      passengers: { orderBy: { createdAt: "asc" } },
      crewMembers: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!flight) return NextResponse.json({ error: "Vuelo no encontrado" }, { status: 404 });

  const wb = XLSX.utils.book_new();

  // Sheet 1: Flight data
  const flightData = [
    ["Campo", "Valor"],
    ["Indicativo", flight.callsign],
    ["Matricula", flight.registration],
    ["Tipo", flight.aircraftType],
    ["Origen", flight.origin || ""],
    ["ETA", flight.eta || ""],
    ["Fecha llegada", flight.arrivalDate || ""],
    ["Destino", flight.destination || ""],
    ["ETD", flight.etd || ""],
    ["Fecha salida", flight.departureDate || ""],
    ["Parking", flight.parking || ""],
    ["TOBT", flight.tobt || ""],
    ["Estado", flight.state],
    ["Crew llegada", `${flight.crewArrival} (real: ${flight.crewArrivalReal ?? "-"})`],
    ["Crew salida", `${flight.crewDeparture} (real: ${flight.crewDepartureReal ?? "-"})`],
    ["Pax llegada", `${flight.paxArrival} (real: ${flight.paxArrivalReal ?? "-"})`],
    ["Pax salida", `${flight.paxDeparture} (real: ${flight.paxDepartureReal ?? "-"})`],
    ["Combustible", flight.fuelState],
    ["Toilet", flight.toiletState],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(flightData);
  ws1["!cols"] = [{ wch: 18 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Vuelo");

  // Sheet 2: Crew
  const crewRows = [["Direccion", "Nombre", "Rol", "Pasaporte", "Nacionalidad", "F. Nacimiento"]];
  for (const c of flight.crewMembers) {
    crewRows.push([c.direction, c.fullName, c.role, c.passportNumber || "", c.nationality || "", c.dateOfBirth || ""]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(crewRows);
  ws2["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Tripulacion");

  // Sheet 3: Passengers
  const paxRows = [["Direccion", "Nombre", "Genero", "Pasaporte", "Nacionalidad", "F. Nacimiento", "Estado", "Verificado"]];
  for (const p of flight.passengers) {
    paxRows.push([p.direction, p.fullName, p.gender || "", p.passportNumber || "", p.nationality || "", p.dateOfBirth || "", p.status, p.verified ? "Si" : "No"]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(paxRows);
  ws3["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Pasajeros");

  // Sheet 4: Services
  const svcRows = [["Tipo", "Nombre", "Estado", "Origen", "Referencia", "Target", "Llegada", "Entrega"]];
  for (const s of flight.services) {
    svcRows.push([s.type, s.customName || "", s.state, s.origin || "", s.reference || "", s.target || "", s.arrivedAt || "", s.deliveredAt || ""]);
  }
  const ws4 = XLSX.utils.aoa_to_sheet(svcRows);
  ws4["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Servicios");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vuelo_${flight.registration}_${flight.callsign}.xlsx"`,
    },
  });
}
