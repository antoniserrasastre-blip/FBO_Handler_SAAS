// /api/metrics — v2. Reads Visit + Movement aggregates.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOperator } from "@/lib/operators";
import { getRequiredAuthorities } from "@/lib/countries";
import { toFlightView } from "@/lib/flightView";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = Math.min(parseInt(req.nextUrl.searchParams.get("range") || "30"), 365);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - range);
  since.setUTCHours(0, 0, 0, 0);

  const visits = await prisma.visit.findMany({
    where: { palmaDay: { gte: since } },
    orderBy: { palmaDay: "desc" },
    include: {
      aircraft: true,
      movements: { include: { passengers: true } },
      services: true,
      lostItems: true,
    },
  });

  // Project to FlightView so we can reuse the legacy aggregation idioms
  const flights = visits.map(toFlightView);
  const allServices = visits.flatMap((v) => v.services);
  const allPassengers = visits.flatMap((v) => v.movements.flatMap((m) => m.passengers));
  const allLostItems = visits.flatMap((v) => v.lostItems);

  // KPIs
  const totalFlights = flights.length;
  const totalPax = flights.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0);
  const totalServices = allServices.length;
  const servicesDelivered = allServices.filter((s) => s.state === "DELIVERED").length;
  const servicesPending = allServices.filter((s) => s.state === "PENDING").length;
  const overnightFlights = flights.filter((f) => f.isOvernight).length;

  // Group visits by palmaDay
  const byDay = new Map<string, typeof flights>();
  for (const f of flights) {
    const key = f.daySheetId.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(f);
  }
  const dailyStats = Array.from(byDay.entries()).map(([key, list]) => ({
    date: new Date(key),
    flights: list.length,
    paxTotal: list.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0),
    servicesTotal: list.reduce((s, f) => s + (f.services?.length || 0), 0),
    servicesDelivered: list.reduce(
      (s, f) =>
        s +
        (((f.services as unknown[]) || []).filter((sv) => (sv as { state?: string }).state === "DELIVERED").length),
      0
    ),
  }));

  const avgFlightsPerDay = byDay.size > 0 ? (totalFlights / byDay.size).toFixed(1) : "0";
  const serviceDeliveryRate = totalServices > 0 ? ((servicesDelivered / totalServices) * 100).toFixed(1) : "0";

  // Turnaround
  const turnarounds = flights
    .filter((f) => f.eta && f.etd && !f.isOvernight)
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

  // Operators
  const operatorCounts: Record<string, { name: string; flights: number; pax: number; icao: string }> = {};
  for (const f of flights) {
    const op = findOperator(f.callsign);
    const key = op?.icao || "OTHER";
    const name = op?.name || "Otros";
    if (!operatorCounts[key]) operatorCounts[key] = { name, flights: 0, pax: 0, icao: key };
    operatorCounts[key].flights++;
    operatorCounts[key].pax += f.paxArrival + f.paxDeparture;
  }
  const topOperators = Object.values(operatorCounts).sort((a, b) => b.flights - a.flights).slice(0, 10);

  // Peak hours
  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, arrivals: 0, departures: 0 }));
  for (const f of flights) {
    if (f.eta) {
      const h = parseInt(f.eta.split(":")[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hourBuckets[h].arrivals++;
    }
    if (f.etd) {
      const h = parseInt(f.etd.split(":")[0]);
      if (!isNaN(h) && h >= 0 && h < 24) hourBuckets[h].departures++;
    }
  }

  // Weekday
  const WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const weekdayCounts = WEEKDAYS.map((day) => ({ day, flights: 0, pax: 0 }));
  for (const f of flights) {
    const dow = new Date(f.daySheetId).getDay();
    weekdayCounts[dow].flights++;
    weekdayCounts[dow].pax += f.paxArrival + f.paxDeparture;
  }

  // Authorities
  let policiaCount = 0;
  let guardaCivilCount = 0;
  for (const f of flights) {
    const auth = getRequiredAuthorities(f.origin);
    if (auth.policia) policiaCount++;
    if (auth.guardaCivil) guardaCivilCount++;
  }

  // Passengers
  const paxConfirmed = allPassengers.filter((p) => p.status === "CONFIRMED").length;
  const paxNoShow = allPassengers.filter((p) => p.status === "NO_SHOW").length;
  const paxAdded = allPassengers.filter((p) => p.status === "ADDED").length;
  const paxVerified = allPassengers.filter((p) => p.verified).length;
  const paxVerifiedRate = allPassengers.length > 0 ? ((paxVerified / allPassengers.length) * 100).toFixed(1) : "0";

  // Lost & Found
  const lostItemsFound = allLostItems.filter((li) => li.state === "FOUND").length;
  const lostItemsClaimed = allLostItems.filter((li) => li.state === "CLAIMED").length;
  const lostItemsDelivered = allLostItems.filter((li) => li.state === "DELIVERED").length;

  // Service types
  const serviceTypeCounts: Record<string, number> = {};
  for (const s of allServices) serviceTypeCounts[s.type] = (serviceTypeCounts[s.type] || 0) + 1;
  const topServices = Object.entries(serviceTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }));

  // Aircraft
  const aircraftCounts: Record<string, number> = {};
  for (const f of flights) aircraftCounts[f.aircraftType] = (aircraftCounts[f.aircraftType] || 0) + 1;
  const topAircraft = Object.entries(aircraftCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([type, count]) => ({ type, count }));

  return NextResponse.json({
    range,
    daysWithData: byDay.size,
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
    dailyStats,
    topOperators,
    hourBuckets,
    weekdayCounts,
    topServices,
    topAircraft,
    policiaCount,
    guardaCivilCount,
    passengers: {
      total: allPassengers.length,
      confirmed: paxConfirmed,
      noShow: paxNoShow,
      added: paxAdded,
      verified: paxVerified,
      verifiedRate: paxVerifiedRate,
    },
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
