// /api/metrics — v2. Reads Visit + Movement aggregates.
//
// Devuelve un panel profundo: KPIs con delta vs período anterior, puntualidad
// real (ata/atd vs eta/etd), precisión de estimación de pax, SLA de servicios,
// carga por handler y una estimación (no ML) de los próximos 7 días basada en
// media móvil + estacionalidad por día de la semana.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOperator } from "@/lib/operators";
import { getRequiredAuthorities } from "@/lib/countries";
import { toFlightView } from "@/lib/flightView";
import {
  WEEKDAYS,
  computePunctuality,
  computePaxAccuracy,
  computeForecast,
  pctChange,
  round1,
} from "@/lib/metrics";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = Math.min(parseInt(req.nextUrl.searchParams.get("range") || "30"), 365);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - range);
  since.setUTCHours(0, 0, 0, 0);

  // Período anterior (misma longitud) para los deltas comparativos.
  const prevSince = new Date(since);
  prevSince.setUTCDate(prevSince.getUTCDate() - range);

  const visits = await prisma.visit.findMany({
    where: { palmaDay: { gte: since } },
    orderBy: { palmaDay: "desc" },
    include: {
      aircraft: true,
      movements: { include: { passengers: true } },
      services: true,
      lostItems: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Período anterior: consulta ligera, solo lo necesario para los deltas.
  const prevVisits = await prisma.visit.findMany({
    where: { palmaDay: { gte: prevSince, lt: since } },
    select: {
      movements: { select: { direction: true, eta: true, etd: true, ata: true, atd: true, paxCount: true } },
      services: { select: { state: true } },
    },
  });

  // Project to FlightView so we can reuse the legacy aggregation idioms
  const flights = visits.map(toFlightView);
  const allServices = visits.flatMap((v) => v.services);
  const allPassengers = visits.flatMap((v) => v.movements.flatMap((m) => m.passengers));
  const allLostItems = visits.flatMap((v) => v.lostItems);
  const allMovements = visits.flatMap((v) => v.movements);

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
  const dailyStats = Array.from(byDay.entries())
    .map(([key, list]) => ({
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
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

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
  const avgTurnaround =
    turnarounds.length > 0 ? Math.round(turnarounds.reduce((s, m) => s + m, 0) / turnarounds.length) : 0;
  const tightTurnarounds = turnarounds.filter((m) => m < 90).length;

  // Puntualidad (real vs programado)
  const punctuality = computePunctuality(allMovements);
  const prevPunctuality = computePunctuality(prevVisits.flatMap((v) => v.movements));

  // Precisión de estimación de pax (estimado vs real)
  const paxAccuracy = computePaxAccuracy(flights);

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

  // Nacionalidades (por país de pasaporte, fallback nacionalidad)
  const nationalityCounts: Record<string, number> = {};
  for (const p of allPassengers) {
    const code = (p.passportCountry || p.nationality || "").toUpperCase().trim();
    if (!code) continue;
    nationalityCounts[code] = (nationalityCounts[code] || 0) + 1;
  }
  const nationalities = Object.entries(nationalityCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  // Lost & Found
  const lostItemsFound = allLostItems.filter((li) => li.state === "FOUND").length;
  const lostItemsClaimed = allLostItems.filter((li) => li.state === "CLAIMED").length;
  const lostItemsDelivered = allLostItems.filter((li) => li.state === "DELIVERED").length;

  // Service types (con tasa de entrega por tipo)
  const serviceTypeAgg: Record<string, { total: number; delivered: number }> = {};
  for (const s of allServices) {
    if (!serviceTypeAgg[s.type]) serviceTypeAgg[s.type] = { total: 0, delivered: 0 };
    serviceTypeAgg[s.type].total++;
    if (s.state === "DELIVERED") serviceTypeAgg[s.type].delivered++;
  }
  const topServices = Object.entries(serviceTypeAgg)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 8)
    .map(([type, agg]) => ({
      type,
      count: agg.total,
      delivered: agg.delivered,
      rate: agg.total > 0 ? Math.round((agg.delivered / agg.total) * 100) : 0,
    }));

  // Servicios por origen (NetJets / Catering Aire / MCR / Otros)
  const serviceOriginAgg: Record<string, { total: number; delivered: number }> = {};
  for (const s of allServices) {
    const key = s.origin || "OTHER";
    if (!serviceOriginAgg[key]) serviceOriginAgg[key] = { total: 0, delivered: 0 };
    serviceOriginAgg[key].total++;
    if (s.state === "DELIVERED") serviceOriginAgg[key].delivered++;
  }
  const servicesByOrigin = Object.entries(serviceOriginAgg)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([origin, agg]) => ({ origin, total: agg.total, delivered: agg.delivered }));

  // Fuel / Toilet (en la pata de salida)
  let fuelRequested = 0;
  let fuelServed = 0;
  let toiletRequested = 0;
  let toiletServed = 0;
  for (const f of flights) {
    if (f.fuelState !== "NOT_REQUESTED") fuelRequested++;
    if (f.fuelState === "SERVED") fuelServed++;
    if (f.toiletState !== "NOT_REQUESTED") toiletRequested++;
    if (f.toiletState === "COMPLETED") toiletServed++;
  }

  // Categoría de vuelo + mascotas
  let commercial = 0;
  let ferry = 0;
  let cancelled = 0;
  let pets = 0;
  for (const f of flights) {
    if (f.flightCategory === "FERRY") ferry++;
    else if (f.flightCategory === "CANCELLED") cancelled++;
    else commercial++;
    pets += f.petCount || 0;
  }

  // Transporte (ambas patas, excluye UNDEFINED)
  const transportCounts: Record<string, number> = {};
  for (const f of flights) {
    for (const t of [f.paxArrTransportType, f.paxDepTransportType]) {
      if (!t || t === "UNDEFINED") continue;
      transportCounts[t] = (transportCounts[t] || 0) + 1;
    }
  }
  const transport = Object.entries(transportCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({ type, count }));

  // Carga por handler (visitas asignadas + eventos registrados)
  const handlerVisits: Record<string, { name: string; visits: number }> = {};
  for (const v of visits) {
    if (!v.assignedTo) continue;
    const key = v.assignedTo.id;
    const name = v.assignedTo.name || "—";
    if (!handlerVisits[key]) handlerVisits[key] = { name, visits: 0 };
    handlerVisits[key].visits++;
  }
  const eventGroups = await prisma.eventLog.groupBy({
    by: ["userId"],
    where: { timestamp: { gte: since }, userId: { not: null } },
    _count: { _all: true },
  });
  const eventByUser: Record<string, number> = {};
  for (const g of eventGroups) if (g.userId) eventByUser[g.userId] = g._count._all;
  // Resolver nombres de usuarios que tienen eventos pero no aparecen en visitas
  const missingUserIds = Object.keys(eventByUser).filter((id) => !handlerVisits[id]);
  if (missingUserIds.length > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: missingUserIds } }, select: { id: true, name: true } });
    for (const u of users) handlerVisits[u.id] = { name: u.name || "—", visits: 0 };
  }
  const handlers = Object.entries(handlerVisits)
    .map(([id, h]) => ({ name: h.name, visits: h.visits, events: eventByUser[id] || 0 }))
    .sort((a, b) => b.visits - a.visits || b.events - a.events)
    .slice(0, 12);

  // Aircraft
  const aircraftCounts: Record<string, number> = {};
  for (const f of flights) aircraftCounts[f.aircraftType] = (aircraftCounts[f.aircraftType] || 0) + 1;
  const topAircraft = Object.entries(aircraftCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([type, count]) => ({ type, count }));

  // ---- Deltas vs período anterior ----
  const prevFlights = prevVisits.length;
  const prevPax = prevVisits.reduce(
    (s, v) => s + v.movements.reduce((ms, m) => ms + (m.paxCount || 0), 0),
    0
  );
  const prevServicesTotal = prevVisits.reduce((s, v) => s + v.services.length, 0);
  const prevServicesDelivered = prevVisits.reduce(
    (s, v) => s + v.services.filter((sv) => sv.state === "DELIVERED").length,
    0
  );
  const prevDeliveryRate = prevServicesTotal > 0 ? (prevServicesDelivered / prevServicesTotal) * 100 : 0;

  const deltas = {
    flights: pctChange(totalFlights, prevFlights),
    pax: pctChange(totalPax, prevPax),
    serviceDeliveryRate: round1(parseFloat(serviceDeliveryRate) - prevDeliveryRate), // puntos porcentuales
    onTimeRate: round1(punctuality.onTimeRate - prevPunctuality.onTimeRate), // puntos porcentuales
  };

  // ---- Estimación próximos 7 días ----
  const forecast = computeForecast(dailyStats, byDay.size);

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
    // ---- nuevos bloques de análisis profundo ----
    deltas,
    previous: {
      totalFlights: prevFlights,
      totalPax: prevPax,
      serviceDeliveryRate: round1(prevDeliveryRate),
      onTimeRate: round1(prevPunctuality.onTimeRate),
    },
    punctuality,
    paxAccuracy,
    servicesByOrigin,
    fuelToilet: { fuelRequested, fuelServed, toiletRequested, toiletServed },
    flightCategories: { commercial, ferry, cancelled },
    pets,
    transport,
    nationalities,
    handlers,
    forecast,
  });
}

// Retraso firmado en minutos entre programado y real (cruce de medianoche tolerado).
function timeToMinutes(hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
