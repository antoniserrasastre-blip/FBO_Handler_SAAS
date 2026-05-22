// /api/service-presets — CRUD de chips de servicios personalizados (CUSTOM)
// reutilizables. La lista es compartida entre handlers (no es localStorage):
// cualquier usuario logueado lee, los writers crean. El borrado vive en
// /api/service-presets/[id].

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";

const MAX_NAME = 64;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const presets = await prisma.customServicePreset.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireWriter();
  if (error) return error;

  let body: { name?: unknown; defaultTarget?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (!rawName) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (rawName.length > MAX_NAME) {
    return NextResponse.json({ error: `name must be ≤ ${MAX_NAME} chars` }, { status: 400 });
  }

  let defaultTarget: string | null = null;
  if (body.defaultTarget === "CREW" || body.defaultTarget === "PAX") {
    defaultTarget = body.defaultTarget;
  }

  // Idempotente: si el nombre ya existe (UNIQUE), devolvemos el existente
  // sin error — UX-friendly cuando el operador re-clica "Guardar".
  const existing = await prisma.customServicePreset.findUnique({ where: { name: rawName } });
  if (existing) return NextResponse.json(existing);

  const preset = await prisma.customServicePreset.create({
    data: {
      name: rawName,
      defaultTarget,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(preset);
}
