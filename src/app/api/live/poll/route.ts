import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pollOnce } from "@/lib/liveTracking";

export const dynamic = "force-dynamic";

/**
 * Manual trigger for one poll cycle. Useful for:
 *  - Local testing
 *  - External cron (GitHub Actions, k8s CronJob) if the in-process worker
 *    is ever disabled.
 * Auth: any logged-in user. We don't need write role because the worker
 * itself runs unauthenticated server-side; this endpoint just exposes it.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await pollOnce();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
