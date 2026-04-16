import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAenaDeclarationAsync, AenaDeclarationOptions } from "@/lib/pdfTemplates/aenaDeclaration";

// GET /api/export/flight/[id]/pdf?direction=ARRIVAL|DEPARTURE (optional)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dirParam = req.nextUrl.searchParams.get("direction");

  const flight = await prisma.flight.findUnique({
    where: { id },
    include: {
      passengers: { orderBy: { createdAt: "asc" } },
      crewMembers: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!flight) return NextResponse.json({ error: "Vuelo no encontrado" }, { status: 404 });

  const directions: ("LLEGADAS" | "SALIDAS")[] = dirParam === "ARRIVAL" ? ["LLEGADAS"]
    : dirParam === "DEPARTURE" ? ["SALIDAS"]
    : ["LLEGADAS", "SALIDAS"];

  const pages: AenaDeclarationOptions[] = directions.map((dir) => {
    const apiDir = dir === "LLEGADAS" ? "ARRIVAL" : "DEPARTURE";
    const crew = flight.crewMembers.filter((c) => c.direction === apiDir);
    const pax = flight.passengers.filter((p) => p.direction === apiDir && p.status !== "NO_SHOW");

    return {
      direction: dir,
      fecha: dir === "LLEGADAS" ? (flight.arrivalDate || "") : (flight.departureDate || ""),
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
    };
  });

  const buffer = await generateAenaDeclarationAsync(pages);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="declaracion_${flight.registration}_${flight.callsign}.pdf"`,
    },
  });
}
