// /api/import — Cybermax PDF import. v2 implementation.
//
// Wrapper fino sobre el pipeline compartido (src/lib/v2/import-core.ts):
//   POST → preview (parse + reconciliación, sin escrituras)
//   PUT  → persist (altas/cambios + cancelIds + sweepNoShows)
// Comportamiento HTTP byte-idéntico (hard-rule #1); el MCP import_daily reusa
// la MISMA lib. El route sólo hace auth + validación de subida + forma HTTP.

import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/roles";
import type { ParsedFlight } from "@/lib/pdfParser";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { previewImport, persistImport } from "@/lib/v2/import-core";

// POST — preview
export async function POST(req: NextRequest) {
  const { error } = await requireWriter();
  if (error) return error;

  const lenCheck = validateContentLength(req.headers.get("content-length"), "pdf");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("pdf") as File[];
  if (!files.length) return NextResponse.json({ error: "No se envio ningun archivo PDF" }, { status: 400 });

  for (const file of files) {
    const v = validateUpload(file, "pdf");
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status });
  }

  const inputs = await Promise.all(
    files.map(async (file) => ({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }))
  );

  const preview = await previewImport(inputs);

  if (!preview.flights.length && preview.errors.length) {
    return NextResponse.json(
      { error: preview.errors.join("; "), flights: [], errors: preview.errors, warnings: preview.warnings },
      { status: 500 }
    );
  }

  // El shape REST de toCancel NO gana el campo `movements` (enriquecimiento
  // sólo del lado MCP) — se retira para quedar byte-idéntico.
  return NextResponse.json({
    date: preview.date,
    flights: preview.flights,
    errors: preview.errors,
    warnings: preview.warnings,
    toCancel: preview.toCancel.map(({ movements: _movements, ...rest }) => rest),
  });
}

// PUT — persist
export async function PUT(req: NextRequest) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const body = await req.json();
  const { date, flights, cancelIds } = body as {
    date: string;
    flights: ParsedFlight[];
    cancelIds?: string[];
  };
  if (!date || !flights || !Array.isArray(flights)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const result = await persistImport({
    date,
    flights,
    cancelIds,
    userId: session.user.id,
    userName: session.user.name ?? null,
  });

  return NextResponse.json(result);
}
