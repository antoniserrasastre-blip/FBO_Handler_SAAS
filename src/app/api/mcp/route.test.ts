import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { palmaDayUtc } from "@/lib/time";
import type { GetDayResult, GetEventLogResult } from "@/lib/mcp/contract";

// --- DB mock: exactly the surface the implementation is pinned to use. -------
const mocks = vi.hoisted(() => ({
  agentTokenFindUnique: vi.fn(),
  agentTokenUpdate: vi.fn(),
  visitFindMany: vi.fn(),
  eventLogFindMany: vi.fn(),
  eventLogCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agentToken: {
      findUnique: mocks.agentTokenFindUnique,
      update: mocks.agentTokenUpdate,
    },
    visit: { findMany: mocks.visitFindMany },
    eventLog: {
      findMany: mocks.eventLogFindMany,
      create: mocks.eventLogCreate,
    },
  },
}));

// --- fixtures ---------------------------------------------------------------
const VALID_TOKEN = "valid-token-la-bestia";
const REVOKED_TOKEN = "revoked-token-la-bestia";
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

interface MovementRow {
  id: string;
  direction: "ARRIVAL" | "DEPARTURE";
  callsign: string | null;
  origin: string | null;
  destination: string | null;
  eta: string | null;
  etd: string | null;
  ata: string | null;
  atd: string | null;
  state: string | null;
  parking: string | null;
  paxCount: number | null;
  paxCountReal: number | null;
  crewCount: number | null;
}
interface VisitRow {
  id: string;
  palmaDay: Date;
  aircraft: { registration: string | null } | null;
  operator: { name: string | null } | null;
  movements: MovementRow[];
}

function mov(over: Partial<MovementRow> = {}): MovementRow {
  return {
    id: "m-1",
    direction: "ARRIVAL",
    callsign: "NJE1CK",
    origin: "LFPB",
    destination: null,
    eta: "08:00",
    etd: null,
    ata: null,
    atd: null,
    state: "SCHEDULED",
    parking: "P1",
    paxCount: 4,
    paxCountReal: null,
    crewCount: 2,
    ...over,
  };
}
function vis(over: Partial<VisitRow> = {}): VisitRow {
  return {
    id: "v-1",
    palmaDay: palmaDayUtc("2026-07-19"),
    aircraft: { registration: "CS-XXX" },
    operator: { name: "Test Op" },
    movements: [mov()],
    ...over,
  };
}

// --- JSON-RPC helpers -------------------------------------------------------
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

interface RpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: {
    tools?: Array<{ name: string }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

async function rpcBody(res: Response): Promise<RpcResponse> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as RpcResponse;
  }
  // Streamable HTTP may answer as text/event-stream — take the last data: line.
  const dataLines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"));
  if (dataLines.length > 0) {
    return JSON.parse(dataLines[dataLines.length - 1].slice(5).trim()) as RpcResponse;
  }
  throw new Error(`Unparseable MCP response body: ${text.slice(0, 200)}`);
}

async function callRpc(body: unknown, token?: string): Promise<{ res: Response; rpc: RpcResponse }> {
  const { POST } = await import("./route");
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const validHash = sha256hex(VALID_TOKEN);
  const revokedHash = sha256hex(REVOKED_TOKEN);
  mocks.agentTokenFindUnique.mockImplementation(
    async ({ where }: { where: { tokenHash: string } }) => {
      if (where.tokenHash === validHash) {
        return {
          id: "tok-valid",
          userId: "u-agent",
          revokedAt: null,
          user: { id: "u-agent", name: "agent-claude", role: "AGENT" },
        };
      }
      if (where.tokenHash === revokedHash) {
        return {
          id: "tok-revoked",
          userId: "u-agent",
          revokedAt: new Date("2026-07-01T00:00:00Z"),
          user: { id: "u-agent", name: "agent-claude", role: "AGENT" },
        };
      }
      return null;
    }
  );
  mocks.agentTokenUpdate.mockResolvedValue({});
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.eventLogFindMany.mockResolvedValue([]);
  mocks.eventLogCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Test plan 1 — Auth
// ---------------------------------------------------------------------------
describe("POST /api/mcp — auth", () => {
  it("401 with the pinned JSON-RPC envelope when no Authorization header is sent", async () => {
    const { res, rpc } = await callRpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(res.status).toBe(401);
    expect(rpc.jsonrpc).toBe("2.0");
    expect(rpc.id).toBeNull();
    expect(rpc.error?.code).toBe(-32001);
    expect(rpc.error?.message).toBe("Unauthorized");
  });

  it("401 when the bearer token is unknown", async () => {
    const { res, rpc } = await callRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      "nope-not-a-real-token"
    );
    expect(res.status).toBe(401);
    expect(rpc.error?.code).toBe(-32001);
  });

  it("401 when the token exists but is revoked", async () => {
    const { res, rpc } = await callRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      REVOKED_TOKEN
    );
    expect(res.status).toBe(401);
    expect(rpc.error?.code).toBe(-32001);
  });

  // S2 (mcp-escritura-lote): tools/list pasó de 3 a 5 tools. El EXACTO-5 (y
  // los inputSchema S1 intactos) viven en route.escritura.test.ts (T8) — un
  // hecho en un solo sitio. Aquí queda la regresión S1 como SUBSET: las 3
  // tools de lectura siguen presentes para un token válido.
  it("200 on tools/list for a valid token — the 3 S1 read tools are present", async () => {
    const { res, rpc } = await callRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      VALID_TOKEN
    );
    expect(res.status).toBe(200);
    const names = (rpc.result?.tools ?? []).map((t) => t.name);
    for (const lectura of ["find_flight", "get_day", "get_event_log"]) {
      expect(names).toContain(lectura);
    }
  });
});

// ---------------------------------------------------------------------------
// Test plan 2 — get_day partition by palmaDay + zero time conversion
// ---------------------------------------------------------------------------
describe("POST /api/mcp — get_day", () => {
  it("returns only the requested palmaDay's visits with Zulu strings passed through verbatim", async () => {
    const dayX = palmaDayUtc("2026-07-19");
    const dayY = palmaDayUtc("2026-07-20");
    const vA = vis({
      id: "vA",
      palmaDay: dayX,
      aircraft: { registration: "CS-CHD" },
      operator: { name: "Luxaviation" },
      movements: [
        mov({
          id: "mA-arr",
          direction: "ARRIVAL",
          callsign: "LTM604",
          origin: "GCLP",
          eta: "08:00",
          etd: null,
          ata: "08:05",
          atd: null,
          state: "LANDED",
          parking: "P12",
        }),
        mov({
          id: "mA-dep",
          direction: "DEPARTURE",
          callsign: "LTM604",
          origin: null,
          destination: "EGGW",
          eta: null,
          etd: "10:30",
          ata: null,
          atd: "10:40",
          parking: "P12",
        }),
      ],
    });
    const vB = vis({ id: "vB", palmaDay: dayX, aircraft: { registration: "D-EFGH" } });
    const vC = vis({ id: "vC", palmaDay: dayY, aircraft: { registration: "OO-IJKL" } });
    const dataset = [vA, vB, vC];
    mocks.visitFindMany.mockImplementation(
      async ({ where }: { where: { palmaDay: Date } }) =>
        dataset.filter((v) => v.palmaDay.getTime() === where.palmaDay.getTime())
    );

    const { res, rpc } = await callRpc(toolsCall("get_day", { fecha: "2026-07-19" }), VALID_TOKEN);
    expect(res.status).toBe(200);

    // the palmaDay handed to prisma is X (midnight UTC of the Palma civil day)
    expect(mocks.visitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ palmaDay: dayX }) })
    );

    const payload = toolPayload<GetDayResult>(rpc);
    expect(payload.flights).toHaveLength(2);
    expect(payload.flights.map((f) => f.visitId).sort()).toEqual(["vA", "vB"]);

    const flightA = payload.flights.find((f) => f.visitId === "vA");
    expect(flightA?.registration).toBe("CS-CHD");
    const arr = flightA?.movements.find((m) => m.direction === "ARRIVAL");
    const dep = flightA?.movements.find((m) => m.direction === "DEPARTURE");
    // strings identical to the mock — zero timezone conversion
    expect(arr?.eta).toBe("08:00");
    expect(arr?.ata).toBe("08:05");
    expect(dep?.etd).toBe("10:30");
    expect(dep?.atd).toBe("10:40");
  });

  // Test plan 3 — default fecha resolves via the Palma civil day, not naive UTC
  it("without fecha, resolves the palmaDay from the clock (00:30 Palma summer = 22:30Z day D → civil day D+1)", async () => {
    vi.useFakeTimers();
    // 2026-07-19 22:30Z == 00:30 Europe/Madrid (summer, UTC+2) on 20-07 —
    // the Palma civil day is already D+1 while the naive UTC date is still D.
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 19, 22, 30)));

    const { res } = await callRpc(toolsCall("get_day", {}), VALID_TOKEN);
    expect(res.status).toBe(200);

    const expectedDay = new Date(Date.UTC(2026, 6, 20, 0, 0, 0, 0));
    expect(mocks.visitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ palmaDay: expectedDay }) })
    );
  });
});

// ---------------------------------------------------------------------------
// Test plan 6 — get_event_log user filter, chronological
// ---------------------------------------------------------------------------
describe("POST /api/mcp — get_event_log", () => {
  it("filters by usuario in memory (exact user.name) and keeps chronological order", async () => {
    const rows = [
      {
        action: "CREATE_VISIT",
        details: "alta manual",
        timestamp: new Date("2026-07-19T06:00:00Z"),
        user: { name: "claude" },
        visit: { movements: [{ callsign: "NJE1CK" }] },
      },
      {
        action: "UPDATE_STATE",
        details: "parked",
        timestamp: new Date("2026-07-19T07:00:00Z"),
        user: { name: "toni" },
        visit: { movements: [{ callsign: "NJE2CK" }] },
      },
      {
        action: "UPDATE_PAX",
        details: "pax real",
        timestamp: new Date("2026-07-19T08:00:00Z"),
        user: { name: "claude" },
        visit: null,
      },
    ];
    mocks.eventLogFindMany.mockResolvedValue(rows);

    const { res, rpc } = await callRpc(
      toolsCall("get_event_log", { fecha: "2026-07-19", usuario: "claude" }),
      VALID_TOKEN
    );
    expect(res.status).toBe(200);

    // day window handed to prisma (loose: gte/lt of the day)
    expect(mocks.eventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      })
    );

    const payload = toolPayload<GetEventLogResult>(rpc);
    expect(payload.entries).toHaveLength(2);
    expect(payload.entries.every((e) => e.user === "claude")).toBe(true);
    const times = payload.entries.map((e) => new Date(e.timestamp).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(payload.entries[0].callsign).toBe("NJE1CK");
    expect(payload.entries[1].callsign).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test plan 7 — reads never write; only lastUsedAt moves
// ---------------------------------------------------------------------------
describe("POST /api/mcp — reads do not write", () => {
  it("after get_day/find_flight/get_event_log, no EventLog.create and only lastUsedAt updates", async () => {
    mocks.visitFindMany.mockResolvedValue([vis({ id: "vR", aircraft: { registration: "CS-CHD" } })]);
    mocks.eventLogFindMany.mockResolvedValue([]);

    const day = await callRpc(toolsCall("get_day", { fecha: "2026-07-19" }, 1), VALID_TOKEN);
    const find = await callRpc(toolsCall("find_flight", { texto: "CS-CHD" }, 2), VALID_TOKEN);
    const log = await callRpc(toolsCall("get_event_log", { fecha: "2026-07-19" }, 3), VALID_TOKEN);

    // positive behavior (fails against the 501 stub)
    for (const { res, rpc } of [day, find, log]) {
      expect(res.status).toBe(200);
      expect(rpc.error).toBeUndefined();
      expect(rpc.result).toBeDefined();
    }

    // the invariant
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
    expect(mocks.agentTokenUpdate).toHaveBeenCalled();
    for (const call of mocks.agentTokenUpdate.mock.calls) {
      const arg = call[0] as { data?: Record<string, unknown> };
      expect(Object.keys(arg.data ?? {})).toEqual(["lastUsedAt"]);
    }
  });
});
