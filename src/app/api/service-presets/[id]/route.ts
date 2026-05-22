// /api/service-presets/[id] — borrar preset compartido. Cualquier writer
// puede eliminar: la lista es compartida y la usabilidad pesa más que la
// autoría individual (ver requireWriter).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWriter } from "@/lib/roles";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireWriter();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.customServicePreset.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.customServicePreset.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
