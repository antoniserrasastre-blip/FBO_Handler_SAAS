import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";

export type { Role } from "@/types";
export { ROLES, ROLE_LABELS } from "@/types";

/** Returns the session if the user can write (ADMIN, SUPERVISOR, or HANDLER), or a 403 response. */
export async function requireWriter() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role === "VIEWER") {
    return { error: NextResponse.json({ error: "Forbidden: read-only role" }, { status: 403 }) };
  }
  return { session };
}

/** Returns the session if the user is ADMIN or SUPERVISOR, or a 403 response. */
export async function requireSupervisor() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR") {
    return { error: NextResponse.json({ error: "Forbidden: supervisor or admin only" }, { status: 403 }) };
  }
  return { session };
}

/** Returns the session if the user is ADMIN, or a 403 response. Only for user management. */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }) };
  }
  return { session };
}
