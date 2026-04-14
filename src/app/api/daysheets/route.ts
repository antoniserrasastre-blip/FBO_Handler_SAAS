import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/daysheets — list all day sheets with flight counts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const daySheets = await prisma.daySheet.findMany({
    orderBy: { date: "desc" },
    include: {
      _count: { select: { flights: true } },
      flights: {
        select: {
          state: true,
          paxDeparture: true,
          services: { select: { state: true } },
        },
      },
    },
  });

  const result = daySheets.map((ds) => {
    const totalFlights = ds._count.flights;
    const dispatched = ds.flights.filter((f) => f.state === "DISPATCHED").length;
    const totalPax = ds.flights.reduce((sum, f) => sum + f.paxDeparture, 0);
    const totalServices = ds.flights.reduce((sum, f) => sum + f.services.length, 0);
    const deliveredServices = ds.flights.reduce(
      (sum, f) => sum + f.services.filter((s) => s.state === "DELIVERED").length,
      0
    );

    return {
      id: ds.id,
      date: ds.date,
      totalFlights,
      dispatched,
      totalPax,
      totalServices,
      deliveredServices,
    };
  });

  return NextResponse.json(result);
}
