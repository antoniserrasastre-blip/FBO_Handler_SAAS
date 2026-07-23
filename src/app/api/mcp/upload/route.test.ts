// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// T7 — POST /api/mcp/upload (C12): entrada del daily PDF por multipart con el
// MISMO Bearer AGENT que /api/mcp. Contrato: src/lib/mcp/contract.ts §S4 C12.
//
// El stub del orquestador devuelve 501 siempre → cada test cae por eso (razón
// correcta de rojo: endpoint aún sin implementar).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentAuth } from "@/lib/mcp/contract";

const AUTH: AgentAuth = { tokenId: "tok-1", userId: "u-agent", userName: "agent-claude" };

const mocks = vi.hoisted(() => ({ verifyAgentToken: vi.fn() }));
vi.mock("@/lib/mcp/auth", () => ({ verifyAgentToken: mocks.verifyAgentToken }));

let uploadDir: string;
let ORIG_DIR: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  ORIG_DIR = process.env.MCP_UPLOAD_DIR;
  uploadDir = mkdtempSync(join(tmpdir(), "fbo-upload-test-"));
  process.env.MCP_UPLOAD_DIR = uploadDir;
  mocks.verifyAgentToken.mockResolvedValue(AUTH);
});
afterEach(() => {
  rmSync(uploadDir, { recursive: true, force: true });
  if (ORIG_DIR === undefined) delete process.env.MCP_UPLOAD_DIR;
  else process.env.MCP_UPLOAD_DIR = ORIG_DIR;
});

function uploadReq(buf: Uint8Array, opts: { auth?: boolean; type?: string; name?: string } = {}): NextRequest {
  const fd = new FormData();
  const part = buf as unknown as BlobPart;
  fd.append("file", new File([part], opts.name ?? "daily.pdf", { type: opts.type ?? "application/pdf" }));
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.authorization = "Bearer valid";
  return new NextRequest("http://localhost/api/mcp/upload", { method: "POST", headers, body: fd });
}

async function callPost(req: NextRequest): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/mcp/upload/route");
  const res = await (POST as (r: NextRequest) => Promise<Response>)(req);
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* respuestas sin cuerpo JSON */
  }
  return { status: res.status, body };
}

const PDF = new TextEncoder().encode("%PDF-1.4\n%daily mock\n");

describe("POST /api/mcp/upload — auth (T7/C12)", () => {
  it("sin Bearer → 401 (mismo comportamiento que /api/mcp)", async () => {
    mocks.verifyAgentToken.mockResolvedValue(null);
    const { status } = await callPost(uploadReq(PDF, { auth: false }));
    expect(status).toBe(401);
  });
});

describe("POST /api/mcp/upload — camino feliz (T7/C12)", () => {
  it("multipart PDF válido → 200 { uploadId, bytes, expiresAt } y persiste el fichero", async () => {
    const { status, body } = await callPost(uploadReq(PDF));
    expect(status).toBe(200);
    expect(typeof body.uploadId).toBe("string");
    expect(body.bytes).toBe(PDF.length);
    expect(typeof body.expiresAt).toBe("string");
    // expiresAt en el futuro (TTL 1 h).
    expect(new Date(body.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    // el fichero quedó en el dir de uploads.
    expect(readdirSync(uploadDir).length).toBe(1);
  });
});

describe("POST /api/mcp/upload — guardas (T7/C12)", () => {
  it("contenido que NO empieza por %PDF → 4xx (jamás 200), fichero no persistido", async () => {
    const notPdf = new TextEncoder().encode("esto no es un pdf");
    const { status } = await callPost(uploadReq(notPdf));
    expect([400, 415]).toContain(status);
    expect(status).not.toBe(501);
    expect(readdirSync(uploadDir).length).toBe(0);
  });

  it("PDF que supera el límite de tamaño (10 MB) → 413", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-1.4\n"), 0);
    const { status } = await callPost(uploadReq(big));
    expect(status).toBe(413);
  });
});
