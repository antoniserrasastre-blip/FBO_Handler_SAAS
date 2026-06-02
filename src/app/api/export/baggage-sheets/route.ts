// GET /api/export/baggage-sheets?date=YYYY-MM-DD
//
// Generates a printable A4 PDF (4 slips/page, single-sided) with one
// "HOJA DE CONTROL EQUIPAJE EN BODEGA" per DEPARTURE of the given Palma
// operating day that carries passengers (estimated pax from import > 0).
// Flight data is pre-printed; bag counts and signatures are filled by hand.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { palmaDayUtc, getSpainToday } from "@/lib/time";
import { generateBaggageSheets, type BaggageSheetData } from "@/lib/pdfTemplates/baggageControl";

function fmtFecha(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const palmaDay = dateParam ? palmaDayUtc(dateParam) : getSpainToday();

  const movements = await prisma.movement.findMany({
    where: {
      direction: "DEPARTURE",
      scheduledDate: palmaDay,
      paxCount: { gt: 0 }, // estimated pax from import
    },
    include: { visit: { include: { aircraft: true } } },
    orderBy: [{ etd: "asc" }, { callsign: "asc" }],
  });

  const sheets: BaggageSheetData[] = movements.map((m) => ({
    fecha: fmtFecha(m.scheduledDate),
    callsign: m.callsign || "",
    destination: m.destination || "",
    registration: m.visit?.aircraft?.registration || "",
    aircraftType: m.visit?.aircraft?.aircraftType || "",
    hora: m.etd || "",
    paxCount: m.paxCount,
  }));

  const pdf = await generateBaggageSheets(sheets);
  const filename = `hojas-equipaje-${fmtFecha(palmaDay).replace(/\//g, "-")}.pdf`;

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
