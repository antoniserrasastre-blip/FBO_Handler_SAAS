// Regresión B1 (vuelos fantasma) + eventLogs en GET /api/flights.
//
// B1: el reimport re-ancla el DEPARTURE de visits no-show viejas al día de
// hoy, y el arrastre (`movements.some.scheduledDate`) las traía a la hoja
// viva con "Esperando llegada" eterno. El GET debe excluir los ARRIVAL
// EXPECTED/NO_SHOW sin evidencia de llegada con scheduledDate < día-1,
// sin romper pernoctas legítimas ni los EXPECTED de ayer.
//
// eventLogs: /dia deriva ATA/ATD de los logs de transición — el GET debe
// serializarlos (orderBy timestamp desc, take 20) vía toFlightView.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const findManyMock = vi.fn();

function mockSessionHandler() {
  vi.doMock("next-auth", () => ({
    getServerSession: vi.fn(async () => ({
      user: { id: "u1", email: "u@test", name: "Test", role: "HANDLER" },
    })),
  }));
}

function mockPrismaVisits(visits: unknown[]) {
  findManyMock.mockReset().mockResolvedValue(visits);
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findMany: findManyMock },
    },
  }));
}

/**
 * Visit mínima para toFlightView. El DEPARTURE siempre cae en el día
 * consultado (2025-06-12) — es el caso del arrastre.
 */
function buildVisit(opts: {
  id: string;
  arrivalState: string;
  arrivalScheduled: string; // ISO del día de llegada
  ata?: string | null;
  livePhase?: string | null;
  eventLogs?: unknown[];
}) {
  const arrDate = new Date(opts.arrivalScheduled);
  return {
    id: opts.id,
    aircraftId: `ac-${opts.id}`,
    operatorId: null,
    palmaDay: arrDate,
    type: "OVERNIGHT",
    arrivalDate: arrDate,
    departureDate: new Date("2025-06-12T00:00:00.000Z"),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: `REG-${opts.id}`, aircraftType: "GLEX" },
    movements: [
      {
        id: `${opts.id}-arr`,
        direction: "ARRIVAL",
        callsign: "NJE001",
        eta: "08:30",
        origin: "LFPB",
        scheduledDate: arrDate,
        state: opts.arrivalState,
        ata: opts.ata ?? null,
        livePhase: opts.livePhase ?? null,
        paxCount: 0,
        crewCount: 0,
      },
      {
        id: `${opts.id}-dep`,
        direction: "DEPARTURE",
        callsign: "NJE001",
        etd: "11:00",
        destination: "EGGW",
        scheduledDate: new Date("2025-06-12T00:00:00.000Z"),
        state: "EXPECTED",
        atd: null,
        paxCount: 0,
        crewCount: 0,
      },
    ],
    services: [],
    lostItems: [],
    crewItems: [],
    ...(opts.eventLogs ? { eventLogs: opts.eventLogs } : {}),
  };
}

async function callGet(query: string) {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost/api/flights?${query}`);
  return GET(req);
}

describe("GET /api/flights — filtro B1 de vuelos fantasma", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSessionHandler();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("next-auth");
  });

  it("excludes a visit whose ARRIVAL is still EXPECTED with scheduledDate < day-1", async () => {
    mockPrismaVisits([
      buildVisit({ id: "ghost", arrivalState: "EXPECTED", arrivalScheduled: "2025-06-07T00:00:00.000Z" }),
      buildVisit({ id: "fresh", arrivalState: "EXPECTED", arrivalScheduled: "2025-06-12T00:00:00.000Z" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    const ids = body.flights.map((f: { id: string }) => f.id);
    expect(ids).not.toContain("ghost");
    expect(ids).toContain("fresh");
  });

  it("ALWAYS keeps legitimate pernoctas (ARRIVAL advanced past EXPECTED) from prior days", async () => {
    mockPrismaVisits([
      buildVisit({ id: "parked", arrivalState: "PARKED", arrivalScheduled: "2025-06-07T00:00:00.000Z" }),
      buildVisit({ id: "onblocks", arrivalState: "ON_BLOCKS", arrivalScheduled: "2025-06-05T00:00:00.000Z" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    const ids = body.flights.map((f: { id: string }) => f.id);
    expect(ids).toContain("parked");
    expect(ids).toContain("onblocks");
  });

  it("keeps yesterday's EXPECTED (delayed overnight flight is still valid)", async () => {
    mockPrismaVisits([
      buildVisit({ id: "yday", arrivalState: "EXPECTED", arrivalScheduled: "2025-06-11T00:00:00.000Z" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    expect(body.flights.map((f: { id: string }) => f.id)).toContain("yday");
  });

  it("keeps stale EXPECTED when there is arrival evidence (ata or livePhase)", async () => {
    mockPrismaVisits([
      buildVisit({ id: "with-ata", arrivalState: "EXPECTED", arrivalScheduled: "2025-06-07T00:00:00.000Z", ata: "08:41" }),
      buildVisit({ id: "with-live", arrivalState: "EXPECTED", arrivalScheduled: "2025-06-07T00:00:00.000Z", livePhase: "LANDED" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    const ids = body.flights.map((f: { id: string }) => f.id);
    expect(ids).toContain("with-ata");
    expect(ids).toContain("with-live");
  });

  it("excludes swept NO_SHOW arrivals dragged onto the live sheet", async () => {
    mockPrismaVisits([
      buildVisit({ id: "noshow", arrivalState: "NO_SHOW", arrivalScheduled: "2025-06-01T00:00:00.000Z" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    expect(body.flights).toHaveLength(0);
  });
});

describe("GET /api/flights — eventLogs en la respuesta", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSessionHandler();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("next-auth");
  });

  it("requests the visit's eventLogs ordered by timestamp desc, capped at 20, with user name", async () => {
    mockPrismaVisits([]);
    await callGet("date=2025-06-12");

    const include = findManyMock.mock.calls[0][0].include;
    expect(include.eventLogs).toEqual({
      orderBy: { timestamp: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    });
  });

  it("propagates eventLogs through toFlightView so /dia can derive ATA/ATD", async () => {
    const logs = [
      {
        id: "el-1",
        visitId: "v-logs",
        movementId: "v-logs-dep",
        userId: "u1",
        action: "Auto-transición → ON_BLOCKS",
        details: null,
        timestamp: new Date("2025-06-12T08:45:00.000Z"),
      },
    ];
    mockPrismaVisits([
      buildVisit({ id: "v-logs", arrivalState: "PARKED", arrivalScheduled: "2025-06-12T00:00:00.000Z", eventLogs: logs }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();

    const flight = body.flights.find((f: { id: string }) => f.id === "v-logs");
    expect(flight.eventLogs).toHaveLength(1);
    expect(flight.eventLogs[0].action).toBe("Auto-transición → ON_BLOCKS");
    expect(new Date(flight.eventLogs[0].timestamp).toISOString()).toBe("2025-06-12T08:45:00.000Z");
  });

  it("serializes only the whitelisted EventLog fields and trims user to { name } (no PII surface)", async () => {
    // Patrón pii-audit-log: el wire no debe arrastrar campos extra del modelo
    // (User completo con email/role, etc.) — proyección explícita.
    const logs = [
      {
        id: "el-2",
        visitId: "v-logs",
        movementId: null,
        userId: "u9",
        action: "Vuelo creado",
        details: "NJE001 (REG-v-logs)",
        timestamp: new Date("2025-06-12T07:00:00.000Z"),
        user: { name: "Tester", email: "secreto@test" }, // relación hidratada de más
      },
    ];
    mockPrismaVisits([
      buildVisit({ id: "v-logs", arrivalState: "PARKED", arrivalScheduled: "2025-06-12T00:00:00.000Z", eventLogs: logs }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();

    const log = body.flights[0].eventLogs[0];
    expect(log.user).toEqual({ name: "Tester" });
    expect(log.user).not.toHaveProperty("email");
    expect(Object.keys(log).sort()).toEqual(
      ["action", "details", "id", "timestamp", "user", "userId", "visitId"].sort()
    );
  });

  it("leaves eventLogs undefined when the query did not include them", async () => {
    mockPrismaVisits([
      buildVisit({ id: "no-logs", arrivalState: "PARKED", arrivalScheduled: "2025-06-12T00:00:00.000Z" }),
    ]);
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    expect(body.flights[0].eventLogs).toBeUndefined();
  });
});
