// Sprint 02 mcp-escritura-lote — fase ROJA. TEST-WRITER.
// T8 — tools/list EXACTAMENTE 5 tools (3 de S1 intactas + update_movements +
// log_incident; ninguna de editar/borrar incidencias) y despacho end-to-end de
// update_movements contra el POST real con auth mockeada (patrón S1).
// Contrato: src/lib/mcp/contract.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import type { UpdateMovementsResult } from "@/lib/mcp/contract";

const mocks = vi.hoisted(() => ({
  agentTokenFindUnique: vi.fn(),
  agentTokenUpdate: vi.fn(),
  visitFindMany: vi.fn(),
  visitFindUnique: vi.fn(),
  movementFindUnique: vi.fn(),
  movementUpdate: vi.fn(),
  eventLogFindMany: vi.fn(),
  eventLogCreate: vi.fn(),
  incidentCreate: vi.fn(),
  applyAutoTransition: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agentToken: { findUnique: mocks.agentTokenFindUnique, update: mocks.agentTokenUpdate },
    visit: { findMany: mocks.visitFindMany, findUnique: mocks.visitFindUnique },
    movement: { findUnique: mocks.movementFindUnique, update: mocks.movementUpdate },
    eventLog: { findMany: mocks.eventLogFindMany, create: mocks.eventLogCreate },
    incident: { create: mocks.incidentCreate },
  },
}));
vi.mock("@/lib/autoTransition", () => ({ applyAutoTransition: mocks.applyAutoTransition }));
vi.mock("@/lib/events", () => ({ eventBus: { emit: mocks.emit } }));

const VALID_TOKEN = "valid-token-la-bestia";
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

function mcpPost(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

interface ToolDef {
  name: string;
  inputSchema?: { required?: string[]; properties?: Record<string, unknown> };
}
interface RpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: {
    tools?: ToolDef[];
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

async function rpcBody(res: Response): Promise<RpcResponse> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed) as RpcResponse;
  const dataLines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"));
  if (dataLines.length > 0) return JSON.parse(dataLines[dataLines.length - 1].slice(5).trim()) as RpcResponse;
  throw new Error(`Unparseable MCP response body: ${text.slice(0, 200)}`);
}

async function callRpc(body: unknown, token?: string): Promise<{ res: Response; rpc: RpcResponse }> {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(mcpPost(body, token));
  return { res, rpc: await rpcBody(res) };
}

function toolPayload<T>(rpc: RpcResponse): T {
  const text = rpc.result?.content?.[0]?.text;
  if (!text) throw new Error(`no tool content in result: ${JSON.stringify(rpc)}`);
  return JSON.parse(text) as T;
}

const toolsCall = (name: string, args: Record<string, unknown> = {}, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});
const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const validHash = sha256hex(VALID_TOKEN);
  mocks.agentTokenFindUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) => {
    if (where.tokenHash === validHash) {
      return {
        id: "tok-valid",
        userId: "u-agent",
        revokedAt: null,
        user: { id: "u-agent", name: "agent-claude", role: "AGENT" },
      };
    }
    return null;
  });
  mocks.agentTokenUpdate.mockResolvedValue({});
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.movementFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    visitId: "v-1",
  }));
  mocks.movementUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: where.id,
    ...data,
  }));
  mocks.eventLogFindMany.mockResolvedValue([]);
  mocks.eventLogCreate.mockResolvedValue({});
  mocks.incidentCreate.mockResolvedValue({ id: "inc-1", createdAt: new Date("2026-07-15T10:00:00Z") });
  mocks.applyAutoTransition.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// T8 — tools/list: las 5 tools de S1/S2 siguen presentes.
// NOTA S3: la regresión CANÓNICA del recuento total de tools/list (= 10) vive
// ahora en src/app/api/mcp/route.ciclo.test.ts. Aquí ya NO se pinea el recuento
// exacto (S3 añadió 5 tools de ciclo de vida): sólo se guarda que las 5 de
// S1/S2 no desaparecieron ni cambiaron de nombre.
// ---------------------------------------------------------------------------
describe("tools/list — S2 sigue exponiendo sus 5 tools", () => {
  it("get_day, find_flight, get_event_log, update_movements y log_incident siguen presentes", async () => {
    const { res, rpc } = await callRpc(toolsList, VALID_TOKEN);
    expect(res.status).toBe(200);
    const names = (rpc.result?.tools ?? []).map((t) => t.name);
    for (const n of ["find_flight", "get_day", "get_event_log", "log_incident", "update_movements"]) {
      expect(names).toContain(n);
    }
  });

  it("no expone NINGUNA tool de editar/borrar incidencias (append-only)", async () => {
    const { rpc } = await callRpc(toolsList, VALID_TOKEN);
    const names = (rpc.result?.tools ?? []).map((t) => t.name);
    for (const n of names) {
      expect(/incident/i.test(n) && /(edit|update|delete|remove|borra|edita)/i.test(n)).toBe(false);
    }
  });
});

// Regresión pura de S1: los inputSchema de las 3 tools de lectura siguen intactos.
describe("tools/list — regresión S1 (inputSchema intacto)", () => {
  it("find_flight sigue requiriendo 'texto'; get_day y get_event_log no requieren nada", async () => {
    const { rpc } = await callRpc(toolsList, VALID_TOKEN);
    const tools = rpc.result?.tools ?? [];
    expect(tools.find((t) => t.name === "find_flight")?.inputSchema?.required).toEqual(["texto"]);
    expect(tools.find((t) => t.name === "get_day")?.inputSchema?.required).toEqual([]);
    expect(tools.find((t) => t.name === "get_event_log")?.inputSchema?.required).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T8 — despacho end-to-end de update_movements con atribución al user del token.
// ---------------------------------------------------------------------------
describe("tools/call update_movements — T8 despacho end-to-end", () => {
  it("una fila válida -> resultado por fila (JSON en content[0].text), atribuido al user del token", async () => {
    const { res, rpc } = await callRpc(
      toolsCall("update_movements", { cambios: [{ movementId: "m-1", campos: { paxCount: 5 } }] }),
      VALID_TOKEN
    );
    expect(res.status).toBe(200);
    expect(rpc.result?.isError).toBeFalsy();

    const payload = toolPayload<UpdateMovementsResult>(rpc);
    expect(payload.resultados).toHaveLength(1);
    expect(payload.resultados[0].movementId).toBe("m-1");
    expect(payload.resultados[0].ok).toBe(true);

    expect(mocks.eventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u-agent" }) })
    );
  });
});

// Regresión pura de S1: las lecturas siguen sin escribir EventLog, aun con la
// superficie de escritura montada.
describe("reads still do not write — regresión S1", () => {
  it("get_day no llama eventLog.create", async () => {
    mocks.visitFindMany.mockResolvedValue([]);
    await callRpc(toolsCall("get_day", { fecha: "2026-07-15" }), VALID_TOKEN);
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });
});
