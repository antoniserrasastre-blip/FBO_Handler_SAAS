import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOperator } from "@/lib/operators";
import { getRequiredAuthorities } from "@/lib/countries";

// GET /api/metrics?range=30  (days, default 30)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = Math.min(parseInt(req.nextUrl.searchParams.get("range") || "30"), 365);

  const daySheets = await prisma.daySheet.findMany({
    orderBy: { date: "desc" },
    take: range,
    include: {
      flights: {
        include: {
          services: true,
          passengers: true,
          lostItems: true,
        },
      },
    },
  });

  const allFlights = daySheets.flatMap((ds) => ds.flights);
  const allServices = allFlights.flatMap((f) => f.services);
  const allPassengers = allFlights.flatMap((f) => f.passengers);
  const allLostItems = allFlights.flatMap((f) => f.lostItems);

  // ── KPIs ──────────────────────────────────────────────────────
  const totalFlights = allFlights.length;
  const totalPax = allFlights.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0);
  const totalServices = allServices.length;
  const servicesDelivered = allServices.filter((s) => s.state === "DELIVERED").length;
  const servicesPending = allServices.filter((s) => s.state === "PENDING").length;
  const overnightFlights = allFlights.filter((f) => f.arrivalDate && f.departureDate && f.arrivalDate !== f.departureDate).length;
  const avgFlightsPerDay = daySheets.length > 0 ? (totalFlights / daySheets.length).toFixed(1) : "0";
  const serviceDeliveryRate = totalServices > 0 ? ((servicesDelivered / totalServices) * 100).toFixed(1) : "0";

  // Turnaround stats: flights with both ETA and ETD that weren't overnight
  const turnarounds = allFlights
    .filter((f) => f.eta && f.etd && (!f.arrivalDate || !f.departureDate || f.arrivalDate === f.departureDate))
    .map((f) => {
      const etaMin = timeToMinutes(f.eta!);
      const etdMin = timeToMinutes(f.etd!);
      return etdMin > etaMin ? etdMin - etaMin : null;
    })
    .filter((m): m is number => m !== null && m > 0 && m < 720);
  const avgTurnaround = turnarounds.length > 0
    ? Math.round(turnarounds.reduce((s, m) => s + m, 0) / turnarounds.length)
    : 0;
  const tightTurnarounds = turnarounds.filter((m) => m < 90).length;

  // ── Daily stats ────────────────────────────────────────────────
  const dailyStats = daySheets.map((ds) => ({
    date: ds.date,
    flights: ds.flights.length,
    paxTotal: ds.flights.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0),
    servicesTotal: ds.flights.reduce((s, f) => s + f.services.length, 0),
    servicesDelivered: ds.flights.reduce((s, f) => s + f.services.filter((sv) => sv.state === "DELIVERED").length, 0),
  }));

  // ── By operator ────────────────────────────────────────────────
  const operatorCounts: Record<string, { name: string; flights: number; pax: number; icao: string }> = {};
  for (const f of allFlights) {
    const op = findOperator(f.callsign);
    const key = op?.icao || "OTHER";
    const name = op?.name || "Otros";
    if (!operatorCounts[key]) operatorCounts[key] = { name, flights: 0, pax: 0, icao: key };
    operatorCounts[key].flights++;
    operatorCounts[key].pax += f.paxArrival + f.paxDeparture;
  }
  const topOperators = Object.values(operatorCounts)
    .sort((a, b) => b.flights - a.flights)
    .slice(0, 10);

  // ── Peak hours (arrivals + departures) ─────────────────────────
  const hourBuckets: { hour: number; arrivals: number; departures: number }[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, arrivals: 0, departures: 0 }));
  for (const f of allFlights) {
    if (f.eta) {
      const h = parseInt(f.eta.split(":")[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hourBuckets[h].arrivals++;
    }
    if (f.etd) {
      const h = parseInt(f.etd.split(":")[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hourBuckets[h].departures++;
    }
  }

  // ── By day of week ─────────────────────────────────────────────
  const WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const weekdayCounts: { day: string; flights: number; pax: number }[] = WEEKDAYS.map((day) => ({ day, flights: 0, pax: 0 }));
  for (const ds of daySheets) {
    const dow = new Date(ds.date).getDay();
    weekdayCounts[dow].flights += ds.flights.length;
    weekdayCounts[dow].pax += ds.flights.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0);
  }

  // ── Authorities (Schengen/EU) ──────────────────────────────────
  let policiaCount = 0;
  let guardaCivilCount = 0;
  for (const f of allFlights) {
    const auth = getRequiredAuthorities(f.origin);
    if (auth.policia) policiaCount++;
    if (auth.guardaCivil) guardaCivilCount++;
  }

  // ── Passengers stats ───────────────────────────────────────────
  const paxConfirmed = allPassengers.filter((p) => p.status === "CONFIRMED").length;
  const paxNoShow = allPassengers.filter((p) => p.status === "NO_SHOW").length;
  const paxAdded = allPassengers.filter((p) => p.status === "ADDED").length;
  const paxVerified = allPassengers.filter((p) => p.verified).length;
  const paxVerifiedRate = allPassengers.length > 0 ? ((paxVerified / allPassengers.length) * 100).toFixed(1) : "0";

  // ── Lost & Found stats ─────────────────────────────────────────
  const lostItemsFound = allLostItems.filter((li) => li.state === "FOUND").length;
  const lostItemsClaimed = allLostItems.filter((li) => li.state === "CLAIMED").length;
  const lostItemsDelivered = allLostItems.filter((li) => li.state === "DELIVERED").length;

  // ── Service types ──────────────────────────────────────────────
  const serviceTypeCounts: Record<string, number> = {};
  for (const s of allServices) serviceTypeCounts[s.type] = (serviceTypeCounts[s.type] || 0) + 1;
  const topServices = Object.entries(serviceTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }));

  // ── Aircraft types ─────────────────────────────────────────────
  const aircraftCounts: Record<string, number> = {};
  for (const f of allFlights) aircraftCounts[f.aircraftType] = (aircraftCounts[f.aircraftType] || 0) + 1;
  const topAircraft = Object.entries(aircraftCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([type, count]) => ({ type, count }));

  return NextResponse.json({
    range,
    daysWithData: daySheets.length,

    // Core KPIs
    totalFlights,
    totalPax,
    totalServices,
    servicesDelivered,
    servicesPending,
    serviceDeliveryRate,
    avgFlightsPerDay,
    overnightFlights,
    avgTurnaround,
    tightTurnarounds,

    // Charts data
    dailyStats,
    topOperators,
    hourBuckets,
    weekdayCounts,
    topServices,
    topAircraft,

    // Authorities
    policiaCount,
    guardaCivilCount,

    // Passengers
    passengers: {
      total: allPassengers.length,
      confirmed: paxConfirmed,
      noShow: paxNoShow,
      added: paxAdded,
      verified: paxVerified,
      verifiedRate: paxVerifiedRate,
    },

    // Lost & found
    lostItems: {
      total: allLostItems.length,
      found: lostItemsFound,
      claimed: lostItemsClaimed,
      delivered: lostItemsDelivered,
    },
  });
}

function timeToMinutes(hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
