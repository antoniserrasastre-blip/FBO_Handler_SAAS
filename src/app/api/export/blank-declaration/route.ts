import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAenaDeclarationAsync, AenaDeclarationOptions } from "@/lib/pdfTemplates/aenaDeclaration";

// GET /api/export/blank-declaration?flightId=xxx&direction=ARRIVAL|DEPARTURE
// Without flightId: completely blank form
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flightId = req.nextUrl.searchParams.get("flightId");
  const dirParam = req.nextUrl.searchParams.get("direction"); // ARRIVAL or DEPARTURE

  const pages: AenaDeclarationOptions[] = [];

  if (flightId) {
    const flight = await prisma.flight.findUnique({ where: { id: flightId } });
    if (!flight) return NextResponse.json({ error: "Vuelo no encontrado" }, { status: 404 });

    const directions = dirParam === "ARRIVAL" ? ["LLEGADAS" as const]
      : dirParam === "DEPARTURE" ? ["SALIDAS" as const]
      : ["LLEGADAS" as const, "SALIDAS" as const];

    for (const dir of directions) {
      pages.push({
        direction: dir,
        fecha: dir === "LLEGADAS" ? (flight.arrivalDate || "") : (flight.departureDate || ""),
        hora: dir === "LLEGADAS" ? (flight.eta || "") : (flight.etd || ""),
        callsign: flight.callsign,
        origin: dir === "LLEGADAS" ? (flight.origin || "") : (flight.destination || ""),
        registration: flight.registration,
        crewCount: dir === "LLEGADAS" ? flight.crewArrival : flight.crewDeparture,
        paxCount: dir === "LLEGADAS" ? flight.paxArrival : flight.paxDeparture,
        parking: flight.parking || "",
        blank: true,
      });
    }
  } else {
    // Completely blank form
    pages.push({
      direction: "LLEGADAS",
      fecha: "", hora: "", callsign: "", origin: "", registration: "",
      crewCount: 0, paxCount: 0, blank: true,
    });
    pages.push({
      direction: "SALIDAS",
      fecha: "", hora: "", callsign: "", origin: "", registration: "",
      crewCount: 0, paxCount: 0, blank: true,
    });
  }

  const buffer = await generateAenaDeclarationAsync(pages);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="declaracion${flightId ? `_${flightId}` : ""}_blanco.pdf"`,
    },
  });
}
