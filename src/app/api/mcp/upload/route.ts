// §S4 C12 — POST /api/mcp/upload: entrada del daily PDF por multipart con el
// MISMO token AGENT que /api/mcp. Contrato: src/lib/mcp/contract.ts §S4.
//
// Persiste el PDF en el dir de uploads (MCP_UPLOAD_DIR || tmp) como
// <uploadId>.pdf y devuelve { uploadId, bytes, expiresAt } (TTL 1 h). El
// uploadId lo consume import_daily al confirmar. Auth/guardas REUSADAS
// (verifyAgentToken, uploadValidation "pdf") — no amplía el allowlist REST.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyAgentToken } from "@/lib/mcp/auth";
import { validateUpload } from "@/lib/uploadValidation";

/** TTL del upload = 1 h (infra: no es estado de dominio). */
const UPLOAD_TTL_MS = 60 * 60 * 1000;

/** Dir de uploads: env pineada en contrato o tmp del server. */
function mcpUploadDir(): string {
  return process.env.MCP_UPLOAD_DIR || join(tmpdir(), "fbo-mcp-uploads");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: MISMO Bearer AGENT que /api/mcp (401 idéntico sin token).
  const auth = await verifyAgentToken(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo multipart inválido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el campo "file" con el PDF del daily.' }, { status: 400 });
  }

  // Guardas de tamaño/tipo REUSADAS de import_daily ("pdf").
  const val = validateUpload({ name: file.name, type: file.type, size: file.size }, "pdf");
  if (!val.ok) {
    return NextResponse.json({ error: val.message }, { status: val.status });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Guarda %PDF (magic bytes) — misma que el camino base64 del import.
  if (bytes.subarray(0, 4).toString("latin1") !== "%PDF") {
    return NextResponse.json(
      { error: "El contenido no es un PDF (no empieza por %PDF)." },
      { status: 415 }
    );
  }

  const dir = mcpUploadDir();
  await mkdir(dir, { recursive: true });
  const uploadId = randomUUID();
  await writeFile(join(dir, `${uploadId}.pdf`), bytes);
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();

  return NextResponse.json({ uploadId, bytes: bytes.length, expiresAt }, { status: 200 });
}
