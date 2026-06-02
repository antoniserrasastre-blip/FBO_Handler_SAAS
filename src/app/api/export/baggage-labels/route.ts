// GET /api/export/baggage-labels?bags=N&callsign=..&dest=..&reg=..&type=..&fecha=..&hora=..
//
// Generates a PDF of N baggage labels (62 × 29 mm, one per page) for a single
// departure — one label per piece of hold baggage, numbered i/N. Stateless by
// query params: the caller (flight detail view) already holds the trusted data,
// which avoids coupling to the movement/visit id mapping and works identically
// from /dia and the Lista. Printed via the Brother TD-46/4750 OS driver.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateBaggageLabels } from "@/lib/pdfTemplates/baggageLabels";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const bags = Math.max(1, Math.min(99, parseInt(p.get("bags") || "1", 10) || 1));

  const data = {
    callsign: p.get("callsign") || "",
    destination: p.get("dest") || "",
    registration: p.get("reg") || "",
    aircraftType: p.get("type") || "",
    fecha: p.get("fecha") || "",
    hora: p.get("hora") || "",
  };

  const pdf = await generateBaggageLabels(data, bags);
  const safeCallsign = data.callsign.replace(/[^A-Za-z0-9-]/g, "") || "vuelo";
  const filename = `etiquetas-${safeCallsign}-${bags}bultos.pdf`;

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
