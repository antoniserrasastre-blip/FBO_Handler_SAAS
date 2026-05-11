import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured on the server; refusing to run /api/setup" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-setup-secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seedSpecs: Array<{ email: string; name: string; envVar: string; role: string }> = [
    { email: "admin@mallorcair.com", name: "Antoni", envVar: "SEED_ADMIN_PASSWORD", role: "ADMIN" },
    { email: "supervisor@mallorcair.com", name: "Supervisor", envVar: "SEED_SUPERVISOR_PASSWORD", role: "SUPERVISOR" },
    { email: "handler@mallorcair.com", name: "Maria", envVar: "SEED_HANDLER_PASSWORD", role: "HANDLER" },
    { email: "viewer@mallorcair.com", name: "Director", envVar: "SEED_VIEWER_PASSWORD", role: "VIEWER" },
  ];

  const log: string[] = [];
  try {
    for (const s of seedSpecs) {
      const password = process.env[s.envVar];
      if (!password) {
        log.push(`Skipping ${s.email}: ${s.envVar} not set`);
        continue;
      }
      const hash = await bcrypt.hash(password, 10);
      const result = await prisma.user.upsert({
        where: { email: s.email },
        update: { name: s.name, password: hash, role: s.role },
        create: { email: s.email, name: s.name, password: hash, role: s.role },
      });
      log.push(`User upserted: ${result.email} (${result.role})`);
    }
    return NextResponse.json({ success: true, log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, log }, { status: 500 });
  }
}
