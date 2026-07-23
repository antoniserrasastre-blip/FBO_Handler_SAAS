// Sprint 03 mcp-ciclo-completo — fase ROJA. TEST-WRITER.
// (8) tools/list = 10 (las 5 de S1/S2 INTACTAS + cancel/uncancel/create/fix/
// import) y despacho end-to-end de las 5 nuevas por el POST del route.
// Contrato: src/lib/mcp/contract.ts §Sprint 03.
//
// Esta es la regresión CANÓNICA de tools/list para S3 (la de route.escritura
// pasa a comprobar sólo que las 5 de S2 siguen presentes — ver nota allí).
//
// El route se testea como S1/S2 pero mockeando @/lib/mcp/auth (verifyAgentToken
// → AUTH) para no depender de la capa AgentToken. El resto de la superficie de
// mock replica la de tools-ciclo.test.ts para que el despacho de las tools
// nuevas alcance su comportamiento FINAL (en rojo fallan con NotImplemented —
// ESA es la razón correcta).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AgentAuth } from "@/lib/mcp/contract";

const AUTH: AgentAuth = { tokenId: "tok-1", userId: "u-agent", userName: "agent-claude" };
const SUMMER = new Date(Date.UTC(2026, 6, 15, 12, 0));

const mocks = vi.hoisted(() => ({
  verifyAgentToken: vi.fn(),
  aircraftFindUnique: vi.fn(),
  aircraftCreate: vi.fn(),
  aircraftUpdate: vi.fn(),
  operatorUpsert: vi.fn(),
  operatorFindFirst: vi.fn(),
  operatorFindUnique: vi.fn(),
  visitFindMany: vi.fn(),
  visitFindFirst: vi.fn(),
  visitCreate: vi.fn(),
  visitUpdate: vi.fn(),
  visitFindUnique: vi.fn(),
  movementFindUnique: vi.fn(),
  movementUpsert: vi.fn(),
  movementUpdate: vi.fn(),
  movementUpdateMany: vi.fn(),
  movementFindFirst: vi.fn(),
  eventLogCreate: vi.fn(),
  eventLogFindFirst: vi.fn(),
  incidentCreate: vi.fn(),
  applyAutoTransition: vi.fn(),
  emit: vi.fn(),
  sweepNoShows: vi.fn(),
  parseCybermaxPdf: vi.fn(),
}));

vi.mock("@/lib/mcp/auth", () => ({ verifyAgentToken: mocks.verifyAgentToken }));
vi.mock("@/lib/db", () => ({
  prisma: {
    aircraft: {
      findUnique: mocks.aircraftFindUnique,
      create: mocks.aircraftCreate,
      update: mocks.aircraftUpdate,
    },
    operator: {
      upsert: mocks.operatorUpsert,
      findFirst: mocks.operatorFindFirst,
      findUnique: mocks.operatorFindUnique,
    },
    visit: {
      findMany: mocks.visitFindMany,
      findFirst: mocks.visitFindFirst,
      create: mocks.visitCreate,
      update: mocks.visitUpdate,
      findUnique: mocks.visitFindUnique,
    },
    movement: {
      findUnique: mocks.movementFindUnique,
      upsert: mocks.movementUpsert,
      update: mocks.movementUpdate,
      updateMany: mocks.movementUpdateMany,
      findFirst: mocks.movementFindFirst,
    },
    eventLog: { create: mocks.eventLogCreate, findFirst: mocks.eventLogFindFirst },
    incident: { create: mocks.incidentCreate },
  },
}));
vi.mock("@/lib/autoTransition", () => ({ applyAutoTransition: mocks.applyAutoTransition }));
vi.mock("@/lib/events", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("@/lib/noShowSweep", () => ({ sweepNoShows: mocks.sweepNoShows }));
vi.mock("@/lib/pdfParser", () => ({
  parseCybermaxPdf: mocks.parseCybermaxPdf,
  parseDate: (ddmmyy: string) => {
    const [dd, mm, yy] = ddmmyy.split("/").map(Number);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
  },
}));

// --- helpers ----------------------------------------------------------------
type Call = Record<string, unknown>;
let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

function mcpPost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer valid",
    },
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

async function callRpc(body: unknown): Promise<{ res: Response; rpc: RpcResponse }> {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(mcpPost(body));
  const text = await res.text();
  return { res, rpc: JSON.parse(text) as RpcResponse };
}

function toolPayload<T>(rpc: RpcResponse): T {
  const text = rpc.result?.content?.[0]?.text;
  if (!text) throw new Error(`no tool content: ${JSON.stringify(rpc)}`);
  return JSON.parse(text) as T;
}

const toolsCall = (name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name, arguments: args },
});
const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

const S3_TOOLS = [
  "cancel_movement",
  "create_flight",
  "find_flight",
  "fix_plan",
  "get_day",
  "get_event_log",
  "import_daily",
  "log_incident",
  "uncancel_movement",
  "update_movements",
];

function movRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m-1",
    visitId: "v-1",
    direction: "ARRIVAL",
    callsign: "NJE123",
    flightCategory: "COMMERCIAL",
    eta: "09:00",
    etd: null,
    ata: null,
    atd: null,
    origin: "LFPB",
    destination: null,
    visit: { id: "v-1", aircraft: { registration: "CS-LTO" } },
    ...over,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  idSeq = 0;
  mocks.verifyAgentToken.mockResolvedValue(AUTH);
  mocks.aircraftFindUnique.mockResolvedValue(null);
  mocks.aircraftCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("ac"), ...(data as Call) }));
  mocks.aircraftUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.operatorUpsert.mockImplementation(async ({ create }: Call) => ({ id: nextId("op"), ...(create as Call) }));
  mocks.operatorFindFirst.mockResolvedValue(null);
  mocks.operatorFindUnique.mockResolvedValue(null);
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindFirst.mockResolvedValue(null);
  mocks.visitCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("v"), ...(data as Call) }));
  mocks.visitUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.movementFindUnique.mockResolvedValue(null);
  mocks.movementUpsert.mockImplementation(async ({ create }: Call) => {
    const c = create as Call;
    return { id: `${c.visitId as string}-${c.direction as string}`, ata: null, livePhase: null, ...c };
  });
  mocks.movementUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.movementUpdateMany.mockResolvedValue({ count: 0 });
  mocks.movementFindFirst.mockResolvedValue(null);
  mocks.eventLogCreate.mockResolvedValue({ id: "el-1" });
  mocks.eventLogFindFirst.mockResolvedValue(null);
  mocks.incidentCreate.mockResolvedValue({ id: "inc-1", createdAt: new Date("2026-07-15T10:00:00Z") });
  mocks.applyAutoTransition.mockResolvedValue(null);
  mocks.sweepNoShows.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// (8) tools/list = 10 — PASA YA (verde en rojo): el route ya registra las 10.
// ---------------------------------------------------------------------------
describe("tools/list — S3 expone EXACTAMENTE 10 tools (point 8)", () => {
  it("las 5 de S1/S2 INTACTAS + las 5 nuevas, y nada más", async () => {
    const { res, rpc } = await callRpc(toolsList);
    expect(res.status).toBe(200);
    const names = (rpc.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(S3_TOOLS);
  });

  it("inputSchema.required de las tools nuevas según contrato", async () => {
    const { rpc } = await callRpc(toolsList);
    const tools = rpc.result?.tools ?? [];
    const req = (n: string) => tools.find((t) => t.name === n)?.inputSchema?.required;
    const props = (n: string) => tools.find((t) => t.name === n)?.inputSchema?.properties;
    expect(req("cancel_movement")).toEqual(["movementId", "motivo"]);
    expect(req("uncancel_movement")).toEqual(["movementId"]);
    expect(req("create_flight")).toEqual(["registration", "callsign"]);
    expect(req("fix_plan")).toEqual(["movementId", "campos"]);
    // §S4 C12: import_daily acepta pdf_base64 XOR upload_id — NINGUNO es
    // individualmente obligatorio en el schema (el runtime hace cumplir el XOR);
    // pinear "pdf_base64" como required mentía al cliente MCP.
    expect(req("import_daily")).toEqual([]);
    expect(props("import_daily")).toHaveProperty("upload_id");
    expect(props("import_daily")).toHaveProperty("pdf_base64");
    // las 5 de S1/S2 siguen presentes.
    for (const n of ["get_day", "find_flight", "get_event_log", "update_movements", "log_incident"]) {
      expect(tools.some((t) => t.name === n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (8) Despacho end-to-end de las 5 tools nuevas — comportamiento FINAL.
// En rojo fallan con NotImplemented (route → isError). Esa ES la razón correcta.
// ---------------------------------------------------------------------------
describe("tools/call — despacho de las 5 tools nuevas (point 8)", () => {
  it("cancel_movement -> payload con previo (no isError)", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow());
    const { rpc } = await callRpc(toolsCall("cancel_movement", { movementId: "m-1", motivo: "rutina" }));
    expect(rpc.result?.isError).toBeFalsy();
    const payload = toolPayload<{ previo: string }>(rpc);
    expect(payload.previo).toBe("COMMERCIAL");
    expect(mocks.eventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u-agent" }) })
    );
  });

  it("uncancel_movement -> payload con restaurado", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "CANCELLED" }));
    mocks.eventLogFindFirst.mockResolvedValue({
      action: "Cancelado por agente",
      details: JSON.stringify({ previo: "FERRY" }),
    });
    const { rpc } = await callRpc(toolsCall("uncancel_movement", { movementId: "m-1" }));
    expect(rpc.result?.isError).toBeFalsy();
    const payload = toolPayload<{ restaurado: string }>(rpc);
    expect(payload.restaurado).toBe("FERRY");
  });

  it("create_flight -> payload con 1 pierna ARRIVAL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const { rpc } = await callRpc(
      toolsCall("create_flight", { registration: "9H-ABC", callsign: "VJT123", llegada: { hora: "13:23" } })
    );
    expect(rpc.result?.isError).toBeFalsy();
    const payload = toolPayload<{ piernas: Array<{ direction: string }> }>(rpc);
    expect(payload.piernas).toHaveLength(1);
    expect(payload.piernas[0].direction).toBe("ARRIVAL");
  });

  it("fix_plan -> payload con aplicado.callsign normalizado", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    const { rpc } = await callRpc(toolsCall("fix_plan", { movementId: "m-1", campos: { callsign: "vjt9" } }));
    expect(rpc.result?.isError).toBeFalsy();
    const payload = toolPayload<{ aplicado: { callsign: string } }>(rpc);
    expect(payload.aplicado.callsign).toBe("VJT9");
  });

  it("import_daily dry-run -> payload con toCancel (array) y CERO escrituras", async () => {
    mocks.parseCybermaxPdf.mockResolvedValue({ date: "15/07/26", flights: [], errors: [], warnings: [] });
    mocks.visitFindMany.mockResolvedValue([]);
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64");
    const { rpc } = await callRpc(toolsCall("import_daily", { pdf_base64: pdf }));
    expect(rpc.result?.isError).toBeFalsy();
    const payload = toolPayload<{ toCancel: unknown[] }>(rpc);
    expect(Array.isArray(payload.toCancel)).toBe(true);
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
    expect(mocks.visitCreate).not.toHaveBeenCalled();
  });
});
