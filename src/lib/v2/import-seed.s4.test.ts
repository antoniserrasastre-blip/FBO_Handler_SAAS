// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// T6 — property de SEED del import (C3): un import de visita NUEVA jamás
// siembra DEPARTURE con state > EXPECTED ni con atd poblado, sobre
// resolveImportState Y el pipeline entero de import-core. Contrato: §S4 C2/C3.
//
// NOTA (verde-en-rojo declarado): T6 es una PROPERTY-GUARD, no un bug a arreglar
// en S4 — pinea la invariante "plan del PDF, operativo intocable" para que los
// cambios de C1/C11 del implementer no la regresen. Estos tests PASAN ya contra
// el scaffold (verifican un hecho ya correcto) — así se documenta en el reporte.

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  emit: vi.fn(),
  sweepNoShows: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aircraft: { findUnique: mocks.aircraftFindUnique, create: mocks.aircraftCreate, update: mocks.aircraftUpdate },
    operator: { upsert: mocks.operatorUpsert, findFirst: mocks.operatorFindFirst, findUnique: mocks.operatorFindUnique },
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
    eventLog: { create: mocks.eventLogCreate },
  },
}));
vi.mock("@/lib/events", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("@/lib/noShowSweep", () => ({ sweepNoShows: mocks.sweepNoShows }));
vi.mock("@/lib/pdfParser", () => ({
  parseCybermaxPdf: vi.fn(),
  parseDate: (ddmmyy: string) => {
    const [dd, mm, yy] = ddmmyy.split("/").map(Number);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
  },
}));

import { persistImport } from "@/lib/v2/import-core";
import { resolveImportState } from "@/lib/v2/resolveImportState";
import type { ParsedFlight } from "@/lib/pdfParser";

type Call = Record<string, unknown>;
const argsOf = (fn: { mock: { calls: unknown[][] } }): Call[] => fn.mock.calls.map((c) => c[0] as Call);
let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

function flight(over: Partial<ParsedFlight> = {}): ParsedFlight {
  return {
    callsign: "NJE123",
    origin: "LFPB",
    arrivalDate: "23/07/26",
    eta: "09:00",
    registration: "9H-NEW",
    aircraftType: "C25A",
    parking: "P1",
    crewArrival: 2,
    crewDeparture: 2,
    paxArrival: 3,
    paxDeparture: 3,
    departureCallsign: "NJE123",
    destination: "LEMD",
    departureDate: "23/07/26",
    etd: "11:00",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  idSeq = 0;
  mocks.aircraftFindUnique.mockResolvedValue(null);
  mocks.aircraftCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("ac"), ...(data as Call) }));
  mocks.operatorUpsert.mockImplementation(async ({ create }: Call) => ({ id: nextId("op"), ...(create as Call) }));
  mocks.operatorFindFirst.mockResolvedValue(null);
  mocks.operatorFindUnique.mockResolvedValue(null);
  mocks.visitFindMany.mockResolvedValue([]); // rotación nueva (sin match previo)
  mocks.visitFindFirst.mockResolvedValue(null);
  mocks.visitCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("v"), ...(data as Call) }));
  mocks.visitUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.movementFindUnique.mockResolvedValue(null);
  mocks.movementUpsert.mockImplementation(async ({ create }: Call) => {
    const c = create as Call;
    return { id: `${c.visitId as string}-${c.direction as string}`, ata: null, atd: null, livePhase: null, ...c };
  });
  mocks.movementUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.movementUpdateMany.mockResolvedValue({ count: 0 });
  mocks.eventLogCreate.mockResolvedValue({ id: "el-1" });
  mocks.sweepNoShows.mockResolvedValue(0);
});

// ===========================================================================
// resolveImportState — DEPARTURE siempre EXPECTED, sobre permutaciones.
// ===========================================================================
describe("resolveImportState — DEPARTURE siempre EXPECTED (T6/C3)", () => {
  const target = new Date(Date.UTC(2026, 6, 23));
  const cases: Array<[string, string | undefined, string | undefined]> = [
    ["turnaround mismo día", "23/07/26", "23/07/26"],
    ["overnight llega antes", "20/07/26", "23/07/26"],
    ["overnight llega hoy sale mañana", "23/07/26", "24/07/26"],
    ["sin fechas", undefined, undefined],
    ["solo llegada", "23/07/26", undefined],
  ];
  it.each(cases)("%s → departureState EXPECTED", (_label, arr, dep) => {
    const r = resolveImportState(arr, dep, target);
    expect(r.departureState).toBe("EXPECTED");
    // la llegada nunca pasa de PARKED por el import (jamás ON_BLOCKS+).
    expect(["PARKED", "EXPECTED"]).toContain(r.arrivalState);
  });
});

// ===========================================================================
// Pipeline import-core — la pierna DEPARTURE nace EXPECTED y SIN atd.
// ===========================================================================
describe("persistImport — DEPARTURE nace EXPECTED sin atd (T6/C3)", () => {
  it("visita nueva: el upsert de la DEPARTURE lleva state EXPECTED y NUNCA atd", async () => {
    await persistImport({
      date: "23/07/26",
      flights: [flight()],
      userId: "u-agent",
      userName: "agent",
    });
    // upsertMovement aplana los campos sobre `create` (…allData): state/atd
    // van directos, no bajo `create.data`.
    const depCreates = argsOf(mocks.movementUpsert)
      .map((c) => c.create as Call)
      .filter((c) => c.direction === "DEPARTURE");
    expect(depCreates.length).toBeGreaterThan(0);
    for (const c of depCreates) {
      expect(c.state).toBe("EXPECTED");
      expect(c.atd).toBeUndefined();
    }
  });

  it("permutaciones de fechas: ninguna DEPARTURE se siembra con state > EXPECTED", async () => {
    const perms: ParsedFlight[] = [
      flight({ callsign: "AAA1", departureCallsign: "AAA1", registration: "9H-AA1", arrivalDate: "20/07/26", departureDate: "23/07/26" }),
      flight({ callsign: "BBB2", departureCallsign: "BBB2", registration: "9H-BB2", arrivalDate: "23/07/26", departureDate: "24/07/26" }),
      flight({ callsign: "CCC3", departureCallsign: "CCC3", registration: "9H-CC3", arrivalDate: "23/07/26", departureDate: "23/07/26" }),
    ];
    await persistImport({ date: "23/07/26", flights: perms, userId: "u-agent", userName: "agent" });
    const depCreates = argsOf(mocks.movementUpsert)
      .map((c) => c.create as Call)
      .filter((c) => c.direction === "DEPARTURE");
    for (const c of depCreates) {
      expect(c.state).toBe("EXPECTED");
    }
  });
});
