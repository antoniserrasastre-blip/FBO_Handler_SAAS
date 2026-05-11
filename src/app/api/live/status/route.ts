import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWorkerStatus } from "@/lib/liveTrackingWorker";

export const dynamic = "force-dynamic";

/** Worker introspection: enabled flag, last run timestamp, last error, counts. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getWorkerStatus());
}
