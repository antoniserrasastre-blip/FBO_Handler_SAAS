// GET /api/export/daily-control/pdf?date=YYYY-MM-DD
//
// Printable A4-landscape operational control sheet for the given Palma
// operating day: two blocks (Llegadas / Salidas), one row per movement, with
// catering services and the pax/transport columns the handler tracks by hand.
//
// Day selection mirrors GET /api/flights (visits whose palmaDay is today OR
// that have a movement scheduled today) and reuses the same ghost-arrival
// filter so the sheet matches what the live list shows. Rows are split by each
// leg's own scheduledDate, so an overnight lands in today's Llegadas and
// tomorrow's Salidas.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { palmaDayUtc, getSpainToday } from "@/lib/time";
import { resolveAirport } from "@/lib/airportsFallback";
import { SERVICE_LABELS, TRANSPORT_LABELS, type ServiceType, type TransportType } from "@/types";
import {
  generateDailyControl,
  type DailyControlRow,
  type DailyControlService,
} from "@/lib/pdfTemplates/dailyControl";

// Mallorcair / catering-family services the handler cares about on the sheet.
// Ramp/technical services (GPU, cleaning, stairs, ASU) are intentionally left out.
const CATERING_FAMILY: ReadonlySet<string> = new Set<ServiceType>([
  "CATERING",
  "DISHES",
  "COOLER_BAG",
  "STORAGE_BAG",
  "THERMOS",
  "NEWSPAPERS",
  "WATER",
  "ICE",
  "LAUNDRY",
  "CUSTOM",
]);

function fmtFechaLong(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}

function airportLabel(icao: string | null): string {
  if (!icao) return "";
  const info = resolveAirport(icao);
  return info?.city ? `${icao} · ${info.city}` : icao;
}

function transportLabel(type: string | null | undefined): string {
  if (!type || type === "UNDEFINED") return "—";
  return TRANSPORT_LABELS[type as TransportType] ?? "—";
}

type ServiceRow = {
  type: string;
  direction: string;
  target: string | null;
  customName: string | null;
  state: string;
};

function serviceLabel(s: ServiceRow): string {
  const base = s.type === "CUSTOM" && s.customName ? s.customName : SERVICE_LABELS[s.type as ServiceType] ?? s.type;
  const suffix = s.target === "CREW" ? " TRIP" : s.target === "PAX" ? " PAX" : "";
  return base + suffix;
}

function servicesForLeg(services: ServiceRow[], leg: "ARRIVAL" | "DEPARTURE"): DailyControlService[] {
  return services
    .filter((s) => CATERING_FAMILY.has(s.type))
    .filter((s) => s.direction === leg || s.direction === "BOTH")
    .map((s) => ({
      label: serviceLabel(s),
      done: s.state === "DELIVERED" || s.state === "CANCELLED",
    }));
}

function paxCrew(pax: number, paxReal: number | null, crew: number, crewReal: number | null): string {
  const p = paxReal ?? pax;
  const c = crewReal ?? crew;
  return `${p} / ${c}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const palmaDay = dateParam ? palmaDayUtc(dateParam) : getSpainToday();

  const visits = await prisma.visit.findMany({
    where: {
      OR: [{ palmaDay }, { movements: { some: { scheduledDate: palmaDay } } }],
    },
    include: {
      aircraft: { include: { currentOperator: true } },
      operator: true,
      movements: true,
      services: { orderBy: { createdAt: "asc" } },
    },
  });

  // Same ghost-arrival filter as GET /api/flights: drop stale EXPECTED/NO_SHOW
  // arrivals with no evidence of landing and scheduledDate < day-1.
  const dayMinus1 = new Date(palmaDay.getTime() - 24 * 60 * 60 * 1000);
  const visible = visits.filter((v) => {
    const arr = v.movements.find((m) => m.direction === "ARRIVAL");
    if (!arr) return true;
    if (arr.state !== "EXPECTED" && arr.state !== "NO_SHOW") return true;
    if (arr.ata || arr.livePhase === "LANDED" || arr.livePhase === "ON_BLOCKS") return true;
    return new Date(arr.scheduledDate).getTime() >= dayMinus1.getTime();
  });

  const today = palmaDay.getTime();
  const arrivals: DailyControlRow[] = [];
  const departures: DailyControlRow[] = [];

  for (const v of visible) {
    const opCode = v.operator?.icaoCode ?? v.aircraft?.currentOperator?.icaoCode ?? "";
    const reg = v.aircraft?.registration ?? "";
    const acType = v.aircraft?.aircraftType ?? "";
    const services = v.services as ServiceRow[];

    const arr = v.movements.find((m) => m.direction === "ARRIVAL");
    const dep = v.movements.find((m) => m.direction === "DEPARTURE");

    if (arr && new Date(arr.scheduledDate).getTime() === today) {
      arrivals.push({
        hora: arr.ata || arr.eta || "",
        callsign: arr.callsign || "",
        registration: reg,
        aircraftType: acType,
        operator: opCode,
        airport: airportLabel(arr.origin),
        stand: arr.parking || "",
        paxCrew: paxCrew(arr.paxCount, arr.paxCountReal, arr.crewCount, arr.crewCountReal),
        transport: transportLabel(arr.transportType),
        services: servicesForLeg(services, "ARRIVAL"),
        cancelled: arr.flightCategory === "CANCELLED",
        noShow: arr.state === "NO_SHOW",
      });
    }

    if (dep && new Date(dep.scheduledDate).getTime() === today) {
      departures.push({
        hora: dep.atd || dep.etd || "",
        callsign: dep.callsign || "",
        registration: reg,
        aircraftType: acType,
        operator: opCode,
        airport: airportLabel(dep.destination),
        stand: dep.parking || "",
        paxCrew: paxCrew(dep.paxCount, dep.paxCountReal, dep.crewCount, dep.crewCountReal),
        transport: transportLabel(dep.transportType),
        services: servicesForLeg(services, "DEPARTURE"),
        cancelled: dep.flightCategory === "CANCELLED",
        noShow: false,
      });
    }
  }

  const byTime = (a: DailyControlRow, b: DailyControlRow) => (a.hora || "99:99").localeCompare(b.hora || "99:99");
  arrivals.sort(byTime);
  departures.sort(byTime);

  const pdf = await generateDailyControl({
    fecha: fmtFechaLong(palmaDay),
    arrivals,
    departures,
  });

  const filename = `hoja-dia-${fmtFechaLong(palmaDay).replace(/\//g, "-")}.pdf`;
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
