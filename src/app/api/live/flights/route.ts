// v2 stub: live tracking columns are not yet ported from the deprecated
// Flight model to Movement. Returning an empty payload keeps the polling
// client happy while the new ingestion path is being designed.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ flights: [] });
}
