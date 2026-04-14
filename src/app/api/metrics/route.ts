import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/metrics — dashboard metrics
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all day sheets with flights and services
  const daySheets = await prisma.daySheet.findMany({
    orderBy: { date: "desc" },
    take: 30, // Last 30 days with data
    include: {
      flights: {
        include: { services: true },
      },
    },
  });

  // Per-day stats
  const dailyStats = daySheets.map((ds) => ({
    date: ds.date,
    flights: ds.flights.length,
    paxTotal: ds.flights.reduce((s, f) => s + f.paxArrival + f.paxDeparture, 0),
    servicesTotal: ds.flights.reduce((s, f) => s + f.services.length, 0),
    servicesDelivered: ds.flights.reduce(
      (s, f) => s + f.services.filter((sv) => sv.state === "DELIVERED").length, 0
    ),
  }));

  // Aggregate service type counts across all data
  const serviceTypeCounts: Record<string, number> = {};
  for (const ds of daySheets) {
    for (const f of ds.flights) {
      for (const s of f.services) {
        serviceTypeCounts[s.type] = (serviceTypeCounts[s.type] || 0) + 1;
      }
    }
  }
  const topServices = Object.entries(serviceTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }));

  // Aircraft type frequency
  const aircraftCounts: Record<string, number> = {};
  for (const ds of daySheets) {
    for (const f of ds.flights) {
      aircraftCounts[f.aircraftType] = (aircraftCounts[f.aircraftType] || 0) + 1;
    }
  }
  const topAircraft = Object.entries(aircraftCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  // Totals
  const totalFlights = daySheets.reduce((s, ds) => s + ds.flights.length, 0);
  const totalPax = daySheets.reduce(
    (s, ds) => s + ds.flights.reduce((fs, f) => fs + f.paxArrival + f.paxDeparture, 0), 0
  );
  const totalServices = daySheets.reduce(
    (s, ds) => s + ds.flights.reduce((fs, f) => fs + f.services.length, 0), 0
  );
  const avgFlightsPerDay = daySheets.length > 0 ? (totalFlights / daySheets.length).toFixed(1) : "0";

  return NextResponse.json({
    daysWithData: daySheets.length,
    totalFlights,
    totalPax,
    totalServices,
    avgFlightsPerDay,
    dailyStats,
    topServices,
    topAircraft,
  });
}
