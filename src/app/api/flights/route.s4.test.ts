// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// T2 — paridad de universo: /api/flights?date=D adopta el MISMO where que
// get_day (dayUniverseWhere de C1, arrastre incluido). T9 — huérfanas de
// extras invisibles también en el board web. Contrato: §S4 C1/C14.
//
// Patrón de mock del route: vi.doMock (como route.b1-filter.test.ts). El where
// capturado se compara con dayUniverseWhere (fuente única). En rojo el route
// usa el OR de 2 ramas (sin arrastre) y dayUniverseWhere lanza NotImplemented.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { dayUniverseWhere } from "@/lib/v2/dayUniverse";
import { palmaDayUtc } from "@/lib/time";

const findManyMock = vi.fn();

function mockSessionHandler() {
  vi.doMock("next-auth", () => ({
    getServerSession: vi.fn(async () => ({ user: { id: "u1", email: "u@test", name: "Test", role: "HANDLER" } })),
  }));
}
function mockPrismaVisits(visits: unknown[]) {
  findManyMock.mockReset().mockResolvedValue(visits);
  vi.doMock("@/lib/db", () => ({ prisma: { visit: { findMany: findManyMock } } }));
}

function buildVisit(opts: { id: string; movements?: unknown[]; palmaDay?: string }) {
  const day = new Date(opts.palmaDay ?? "2026-07-23T00:00:00.000Z");
  return {
    id: opts.id,
    aircraftId: `ac-${opts.id}`,
    operatorId: null,
    palmaDay: day,
    type: "TURNAROUND",
    arrivalDate: day,
    departureDate: day,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: `REG-${opts.id}`, aircraftType: "GLEX" },
    movements:
      opts.movements ??
      [
        {
          id: `${opts.id}-arr`,
          direction: "ARRIVAL",
          callsign: "NJE001",
          eta: "08:30",
          origin: "LFPB",
          scheduledDate: day,
          state: "PARKED",
          ata: "08:31",
          livePhase: null,
          paxCount: 0,
          crewCount: 0,
        },
      ],
    services: [],
    lostItems: [],
    crewItems: [],
  };
}

async function callGet(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/flights?${query}`));
}

describe("GET /api/flights — universo C1 (T2)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSessionHandler();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("next-auth");
  });

  it("el where incluye la rama de ARRASTRE (DEPARTURE atd null, no CANCELLED)", async () => {
    mockPrismaVisits([]);
    await callGet("date=2026-07-23");
    const where = findManyMock.mock.calls[0][0].where;
    const s = JSON.stringify(where);
    expect(s).toContain("DEPARTURE");
    expect(s).toContain("atd");
    expect(s).toContain("CANCELLED");
  });

  it("PARIDAD: el where del board == dayUniverseWhere(D) (fuente única con get_day)", async () => {
    mockPrismaVisits([]);
    await callGet("date=2026-07-23");
    const where = findManyMock.mock.calls[0][0].where;
    expect(where).toEqual(dayUniverseWhere(palmaDayUtc("2026-07-23")));
  });
});

describe("GET /api/flights — huérfanas de extras invisibles (T9/C14)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSessionHandler();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("next-auth");
  });

  it("una visita SIN movimientos NO aparece en body.flights", async () => {
    mockPrismaVisits([
      buildVisit({ id: "orphan", movements: [] }),
      buildVisit({ id: "real" }),
    ]);
    const res = await callGet("date=2026-07-23");
    const body = await res.json();
    const ids = body.flights.map((f: { id: string }) => f.id);
    expect(ids).not.toContain("orphan");
    expect(ids).toContain("real");
  });

  it("al enriquecerse (ya tiene movimientos) REAPARECE en el board", async () => {
    mockPrismaVisits([buildVisit({ id: "orphan" })]); // ahora con su ARRIVAL
    const res = await callGet("date=2026-07-23");
    const body = await res.json();
    expect(body.flights.map((f: { id: string }) => f.id)).toContain("orphan");
  });
});
