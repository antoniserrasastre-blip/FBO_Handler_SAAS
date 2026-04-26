import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAenaDeclarationAsync, AenaDeclarationOptions } from "@/lib/pdfTemplates/aenaDeclaration";

// GET /api/export/daily/pdf?date=YYYY-MM-DD
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
      passengers: { orderBy: { createdAt: "asc" } },
      crewMembers: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { eta: "asc" },
  });

  if (!flights.length) return NextResponse.json({ error: "No hay vuelos para esta fecha" }, { status: 404 });

  const pages: AenaDeclarationOptions[] = [];

  for (const flight of flights) {
    for (const dir of ["LLEGADAS", "SALIDAS"] as const) {
      const apiDir = dir === "LLEGADAS" ? "ARRIVAL" : "DEPARTURE";
      const crew = flight.crewMembers.filter((c) => c.direction === apiDir);
      const pax = flight.passengers.filter((p) => p.direction === apiDir && p.status !== "NO_SHOW");

      pages.push({
        direction: dir,
        fecha: dir === "LLEGADAS" ? (flight.arrivalDate || dateParam) : (flight.departureDate || dateParam),
        hora: dir === "LLEGADAS" ? (flight.eta || "") : (flight.etd || ""),
        callsign: flight.callsign,
        origin: dir === "LLEGADAS" ? (flight.origin || "") : (flight.destination || ""),
        registration: flight.registration,
        crewCount: crew.length || (dir === "LLEGADAS" ? flight.crewArrival : flight.crewDeparture),
        paxCount: pax.length || (dir === "LLEGADAS" ? flight.paxArrival : flight.paxDeparture),
        parking: flight.parking || "",
        crew: crew.map((c) => ({
          fullName: c.fullName,
          nationality: c.nationality || undefined,
          passportNumber: c.passportNumber || undefined,
          dateOfBirth: c.dateOfBirth || undefined,
        })),
        passengers: pax.map((p) => ({
          fullName: p.fullName,
          nationality: p.nationality || undefined,
          passportNumber: p.passportNumber || undefined,
          dateOfBirth: p.dateOfBirth || undefined,
        })),
        blank: crew.length === 0 && pax.length === 0,
      });
    }
  }

  const buffer = await generateAenaDeclarationAsync(pages);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="declaraciones_${dateParam}.pdf"`,
    },
  });
}
