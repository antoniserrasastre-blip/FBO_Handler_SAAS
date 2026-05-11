import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { palmaDayUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Returns the live tracking snapshot (position + phase) for the day's flights.
 * Client polls this every ~20s for position updates; SSE handles phase
 * transitions separately as flight_updated events.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ? palmaDayUtc(dateParam) : palmaDayUtc();

  const daySheet = await prisma.daySheet.findUnique({ where: { date } });
  if (!daySheet) return NextResponse.json({ flights: [] });

  const flights = await prisma.flight.findMany({
    where: { daySheetId: daySheet.id, liveLastSeenAt: { not: null } },
    select: {
      id: true,
      callsign: true,
      registration: true,
      liveIcao24: true,
      liveLatitude: true,
      liveLongitude: true,
      liveAltitudeM: true,
      liveVelocityMs: true,
      liveHeading: true,
      liveVerticalRateMs: true,
      liveOnGround: true,
      livePhase: true,
      liveLastSeenAt: true,
    },
  });

  return NextResponse.json({ flights });
}
