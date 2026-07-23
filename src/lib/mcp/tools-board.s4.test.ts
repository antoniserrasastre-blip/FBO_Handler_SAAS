// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// Lado LECTURA del board (get_day / find_flight): universo del día, estado de
// rotación compuesto, CANCELLED, matcher endurecido y huérfanas.
// Contrato pineado: src/lib/mcp/contract.ts §S4 (C1-C4, C11, C14).
//
// Mapeo test↔test plan de la spec:
//   T1 (marcado/dedupe del universo)      → describe "get_day — universo …"
//   T3 (CANCELLED)                        → describe "get_day — CANCELLED …"
//   T4 (matcher)                          → describe "find_flight — matcher …"
//   T5 (estado de rotación compuesto)     → describe "estadoRotacion …"
//   T9 (huérfanas)                        → describe "huérfanas …"
//
// get_day/find_flight resuelven en memoria sobre prisma.visit.findMany (mismo
// patrón que find-flight.test.ts). El where real (C1) se prueba aparte en
// dayUniverse.test.ts y flights/route.s4.test.ts; aquí se prueba la PROYECCIÓN.
// mostAdvancedState se importa REAL de flightView (oráculo del estado compuesto).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mostAdvancedState } from "@/lib/flightView";
import { dayUniverseWhere } from "@/lib/v2/dayUniverse";
import { palmaDayUtc } from "@/lib/time";

const mocks = vi.hoisted(() => ({
  visitFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { visit: { findMany: mocks.visitFindMany } },
}));

import { getDay, findFlight } from "./tools";

const D = new Date(Date.UTC(2026, 6, 23)); // 23-07-2026
const DAY_MS = 24 * 60 * 60 * 1000;

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
  flightCategory: "COMMERCIAL" | "FERRY" | "CANCELLED";
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
    state: "EXPECTED",
    flightCategory: "COMMERCIAL",
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
    palmaDay: new Date(D.getTime()),
    aircraft: { registration: "CS-XXX" },
    operator: { name: "Test Op" },
    movements: [mov()],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.visitFindMany.mockResolvedValue([]);
});

async function expectRejects(p: Promise<unknown>, pattern?: RegExp) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).not.toMatch(/NotImplemented/i);
  if (pattern) expect((err as Error).message).toMatch(pattern);
}

// ===========================================================================
// T1 — universo del día: marcado de arrastre + palmaDay + sin duplicados.
// ===========================================================================
describe("get_day — universo del día: arrastre, palmaDay, dedupe (T1/C1)", () => {
  it("PARIDAD: consulta con el where de dayUniverseWhere(D) (fuente única con /api/flights) (T2)", async () => {
    mocks.visitFindMany.mockResolvedValue([]);
    await getDay({ fecha: "2026-07-23" });
    const where = (mocks.visitFindMany.mock.calls[0][0] as { where: unknown }).where;
    expect(where).toEqual(dayUniverseWhere(palmaDayUtc("2026-07-23")));
  });

  it("cada visita se lista UNA sola vez (sin duplicar visitIds)", async () => {
    const sameDay = vis({ id: "v-today", palmaDay: new Date(D.getTime()) });
    const scheduledMatch = vis({
      id: "v-sched",
      palmaDay: new Date(D.getTime() - 2 * DAY_MS),
      movements: [mov({ id: "ms", direction: "DEPARTURE", etd: "18:00", atd: null })],
    });
    const arrastre = vis({
      id: "v-drag",
      palmaDay: new Date(D.getTime() - 3 * DAY_MS),
      movements: [mov({ id: "md", direction: "DEPARTURE", etd: "20:00", atd: null, state: "EXPECTED" })],
    });
    // Segunda rotación del MISMO avión el día D (doble rotación).
    const secondRot = vis({ id: "v-2nd", palmaDay: new Date(D.getTime()) });
    mocks.visitFindMany.mockResolvedValue([sameDay, scheduledMatch, arrastre, secondRot]);

    const res = await getDay({ fecha: "2026-07-23" });
    const ids = res.flights.map((f) => f.visitId);
    expect(ids).toEqual([...new Set(ids)]); // sin duplicados
    expect(new Set(ids)).toEqual(new Set(["v-today", "v-sched", "v-drag", "v-2nd"]));
  });

  it("una rotación arrastrada va marcada arrastre:true + su palmaDay REAL (día previo)", async () => {
    const arrastre = vis({
      id: "v-drag",
      palmaDay: new Date(D.getTime() - 3 * DAY_MS), // 20-07-2026
      movements: [mov({ id: "md", direction: "DEPARTURE", etd: "20:00", atd: null })],
    });
    mocks.visitFindMany.mockResolvedValue([arrastre]);

    const res = await getDay({ fecha: "2026-07-23" });
    const f = res.flights.find((x) => x.visitId === "v-drag")!;
    expect(f.arrastre).toBe(true);
    expect(f.palmaDay).toBe("2026-07-20");
  });

  it("una visita del propio día NO se marca como arrastre y expone su palmaDay == D", async () => {
    mocks.visitFindMany.mockResolvedValue([vis({ id: "v-today", palmaDay: new Date(D.getTime()) })]);
    const res = await getDay({ fecha: "2026-07-23" });
    const f = res.flights[0];
    expect(f.arrastre).toBeUndefined();
    expect(f.palmaDay).toBe("2026-07-23");
  });

  it("cada movimiento expone flightCategory (C11: siempre presente)", async () => {
    mocks.visitFindMany.mockResolvedValue([
      vis({ movements: [mov({ id: "m", flightCategory: "FERRY" })] }),
    ]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights[0].movements[0].flightCategory).toBe("FERRY");
  });
});

// ===========================================================================
// T3 — CANCELLED: exclusión default por pierna, summary, rotación muerta,
// incluirCancelados booleano estricto.
// ===========================================================================
describe("get_day — CANCELLED: exclusión, summary, estricto (T3/C11)", () => {
  it("por defecto EXCLUYE las piernas CANCELLED del listado, pero la rotación viva permanece", async () => {
    const v = vis({
      id: "v-mix",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", flightCategory: "COMMERCIAL", state: "ON_BLOCKS" }),
        mov({ id: "dep", direction: "DEPARTURE", flightCategory: "CANCELLED", state: "EXPECTED", etd: "12:00" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await getDay({ fecha: "2026-07-23" });
    const f = res.flights.find((x) => x.visitId === "v-mix")!;
    const ids = f.movements.map((m) => m.movementId);
    expect(ids).toContain("arr");
    expect(ids).not.toContain("dep"); // pierna cancelada fuera
  });

  it("summary cuenta PIERNAS del universo: vivos + cancelados = total real", async () => {
    const v = vis({
      id: "v-mix",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", flightCategory: "COMMERCIAL" }),
        mov({ id: "dep", direction: "DEPARTURE", flightCategory: "CANCELLED", etd: "12:00" }),
      ],
    });
    const otra = vis({ id: "v-live", movements: [mov({ id: "a2", flightCategory: "COMMERCIAL" })] });
    mocks.visitFindMany.mockResolvedValue([v, otra]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.summary).toEqual({ vivos: 2, cancelados: 1 });
  });

  it("una rotación con TODAS las piernas canceladas se omite entera por defecto", async () => {
    const dead = vis({
      id: "v-dead",
      movements: [
        mov({ id: "a", direction: "ARRIVAL", flightCategory: "CANCELLED" }),
        mov({ id: "d", direction: "DEPARTURE", flightCategory: "CANCELLED", etd: "12:00" }),
      ],
    });
    const alive = vis({ id: "v-alive" });
    mocks.visitFindMany.mockResolvedValue([dead, alive]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights.map((f) => f.visitId)).toEqual(["v-alive"]);
  });

  it("incluirCancelados:true → las lista MARCADAS (flightCategory visible)", async () => {
    const v = vis({
      id: "v-mix",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", flightCategory: "COMMERCIAL" }),
        mov({ id: "dep", direction: "DEPARTURE", flightCategory: "CANCELLED", etd: "12:00" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await getDay({ fecha: "2026-07-23", incluirCancelados: true });
    const f = res.flights.find((x) => x.visitId === "v-mix")!;
    const dep = f.movements.find((m) => m.movementId === "dep");
    expect(dep).toBeDefined();
    expect(dep!.flightCategory).toBe("CANCELLED");
  });

  it("incluirCancelados no-booleano ('true') → Error (booleano ESTRICTO, como confirmar)", async () => {
    mocks.visitFindMany.mockResolvedValue([vis()]);
    await expectRejects(
      getDay({ fecha: "2026-07-23", incluirCancelados: "true" as unknown as boolean })
    );
  });
});

// ===========================================================================
// T5 — estadoRotacion compuesto (mostAdvancedState sobre piernas VIVAS).
// Simetría ata→ON_BLOCKS ≡ atd→OFF_BLOCKS; regresión 19-07 (llegada EXPECTED
// + salida ya avanzada por autoTransition sobre el primario) → rotación avanza.
// ===========================================================================
describe("get_day — estadoRotacion compuesto (T5/C2/C3)", () => {
  it("regresión 19-07: ARRIVAL EXPECTED + DEPARTURE ON_BLOCKS → estadoRotacion ON_BLOCKS (no EXPECTED)", async () => {
    // autoTransition persiste el estado en el DEPARTURE primario: la llegada
    // queda EXPECTED verbatim, pero la ROTACIÓN ya está ON_BLOCKS.
    const v = vis({
      id: "v-19",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", state: "EXPECTED", ata: "07:41" }),
        mov({ id: "dep", direction: "DEPARTURE", state: "ON_BLOCKS", etd: "10:00" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await getDay({ fecha: "2026-07-23" });
    const f = res.flights.find((x) => x.visitId === "v-19")!;
    expect(f.estadoRotacion).toBe("ON_BLOCKS");
    expect(f.estadoRotacion).toBe(mostAdvancedState("EXPECTED", "ON_BLOCKS")); // oráculo
    // el state POR PIERNA se mantiene verbatim (compat interna).
    expect(f.movements.find((m) => m.movementId === "arr")!.state).toBe("EXPECTED");
  });

  it("simetría atd: ARRIVAL PARKED + DEPARTURE OFF_BLOCKS → estadoRotacion OFF_BLOCKS", async () => {
    const v = vis({
      id: "v-out",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", state: "PARKED" }),
        mov({ id: "dep", direction: "DEPARTURE", state: "OFF_BLOCKS", etd: "10:00", atd: "10:12" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights[0].estadoRotacion).toBe("OFF_BLOCKS");
  });

  it("property: estadoRotacion == mostAdvancedState(arr,dep) sobre TODOS los pares alcanzables", async () => {
    const STATES = ["EXPECTED", "ON_BLOCKS", "PARKED", "TURNAROUND", "BOARDING", "OFF_BLOCKS"];
    const visits: VisitRow[] = [];
    let i = 0;
    for (const a of STATES) {
      for (const d of STATES) {
        visits.push(
          vis({
            id: `v-${i++}`,
            movements: [
              mov({ id: "arr", direction: "ARRIVAL", state: a }),
              mov({ id: "dep", direction: "DEPARTURE", state: d, etd: "10:00" }),
            ],
          })
        );
      }
    }
    mocks.visitFindMany.mockResolvedValue(visits);
    const res = await getDay({ fecha: "2026-07-23" });
    let idx = 0;
    for (const a of STATES) {
      for (const d of STATES) {
        const id = `v-${idx++}`; // capturar el id ANTES: idx++ no debe correr dentro del predicado de .find
        const f = res.flights.find((x) => x.visitId === id)!;
        expect(f.estadoRotacion).toBe(mostAdvancedState(a, d));
      }
    }
  });

  it("estadoRotacion se compone SOLO sobre piernas vivas (salida cancelada NO luce 'salida')", async () => {
    const v = vis({
      id: "v-c",
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", state: "ON_BLOCKS", flightCategory: "COMMERCIAL" }),
        mov({ id: "dep", direction: "DEPARTURE", state: "OFF_BLOCKS", flightCategory: "CANCELLED", etd: "10:00", atd: "10:05" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await getDay({ fecha: "2026-07-23" });
    // la salida cancelada NO cuenta: la rotación va sólo por la llegada viva.
    expect(res.flights[0].estadoRotacion).toBe("ON_BLOCKS");
  });
});

// ===========================================================================
// T4 — matcher endurecido (registrationMatches): registration vacía/corta
// jamás candidata; substring solo si ambos lados ≥3; callsign exacto ancla.
// ===========================================================================
describe("find_flight — guardias del matcher (T4/C4)", () => {
  it("registration VACÍA jamás candidata por matrícula (bug ZJONES: includes(''))", async () => {
    const zjones = vis({
      id: "v-zj",
      aircraft: { registration: "" },
      movements: [mov({ id: "m", callsign: "ZJONES", eta: "09:00" })],
    });
    mocks.visitFindMany.mockResolvedValue([zjones]);
    // Un token cualquiera NO debe engancharla por matrícula vacía.
    const res = await findFlight({ texto: "N546XJ", fecha: "2026-07-23" });
    expect(res.candidates).toHaveLength(0);
  });

  it("registration NULL jamás candidata por matrícula", async () => {
    const v = vis({ id: "v-null", aircraft: { registration: null }, movements: [mov({ callsign: "ABC123", eta: "09:00" })] });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await findFlight({ texto: "N600CK", fecha: "2026-07-23" });
    expect(res.candidates).toHaveLength(0);
  });

  it("registration < 3 chars → SOLO igualdad exacta (jamás substring)", async () => {
    const v = vis({ id: "v-short", aircraft: { registration: "AB" }, movements: [mov({ callsign: "XY123", eta: "09:00" })] });
    mocks.visitFindMany.mockResolvedValue([v]);
    // "CAB" contiene "AB" pero reg<3 ⇒ NO candidata.
    const noHit = await findFlight({ texto: "CAB", fecha: "2026-07-23" });
    expect(noHit.candidates).toHaveLength(0);
    // igualdad exacta SÍ.
    const hit = await findFlight({ texto: "AB", fecha: "2026-07-23" });
    expect(hit.candidates.map((c) => c.visitId)).toContain("v-short");
  });

  it("substring bidireccional sigue válido cuando AMBOS lados ≥ 3 (N546XJ)", async () => {
    const v = vis({ id: "v-546", aircraft: { registration: "N546XJ" }, movements: [mov({ callsign: "JHU546", eta: "09:00" })] });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await findFlight({ texto: "546XJ", fecha: "2026-07-23" });
    expect(res.candidates.map((c) => c.visitId)).toContain("v-546");
    expect(res.candidates[0].matchedBy).toBe("registration");
  });

  it("callsign exacto SIEMPRE ancla y va PRIMERO (por delante de un match de matrícula)", async () => {
    const byCall = vis({ id: "v-call", aircraft: { registration: "D-EFGH" }, movements: [mov({ id: "mc", callsign: "VJA546", eta: "08:00" })] });
    const byReg = vis({ id: "v-reg", aircraft: { registration: "VJA546X" }, movements: [mov({ id: "mr", callsign: "OTHER1", eta: "14:00" })] });
    mocks.visitFindMany.mockResolvedValue([byReg, byCall]);
    const res = await findFlight({ texto: "VJA546", fecha: "2026-07-23" });
    expect(res.candidates[0].visitId).toBe("v-call");
    expect(res.candidates[0].matchedBy).toBe("callsign");
  });

  it("find_flight NO excluye cancelados: los devuelve marcados (para desambiguar/uncancel)", async () => {
    const v = vis({
      id: "v-cx",
      aircraft: { registration: "CS-CANX" },
      movements: [mov({ id: "m", callsign: "CNX999", eta: "09:00", flightCategory: "CANCELLED" })],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await findFlight({ texto: "CNX999", fecha: "2026-07-23" });
    expect(res.candidates.map((c) => c.visitId)).toContain("v-cx");
    expect(res.candidates[0].movements[0].flightCategory).toBe("CANCELLED");
  });

  it("find_flight expone estadoRotacion + palmaDay en el candidato (C1/C2)", async () => {
    const v = vis({
      id: "v-cand",
      palmaDay: new Date(D.getTime()),
      movements: [
        mov({ id: "arr", direction: "ARRIVAL", callsign: "NJE010", state: "PARKED", eta: "08:00" }),
        mov({ id: "dep", direction: "DEPARTURE", callsign: "NJE010", state: "EXPECTED", etd: "10:00" }),
      ],
    });
    mocks.visitFindMany.mockResolvedValue([v]);
    const res = await findFlight({ texto: "NJE010", fecha: "2026-07-23" });
    expect(res.candidates[0].estadoRotacion).toBe("PARKED");
    expect(res.candidates[0].palmaDay).toBe("2026-07-23");
  });
});

// ===========================================================================
// T9 — huérfanas de extras: Visit sin movimientos invisible en get_day y
// find_flight; reaparece al enriquecerse.
// ===========================================================================
describe("huérfanas de EXTRAS invisibles en lecturas (T9/C14)", () => {
  it("get_day NO lista una visita sin movimientos", async () => {
    const orphan = vis({ id: "v-orphan", movements: [] });
    const real = vis({ id: "v-real" });
    mocks.visitFindMany.mockResolvedValue([orphan, real]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights.map((f) => f.visitId)).toEqual(["v-real"]);
  });

  it("find_flight NO propone una visita sin movimientos", async () => {
    const orphan = vis({ id: "v-orphan", aircraft: { registration: "CS-ORPH" }, movements: [] });
    mocks.visitFindMany.mockResolvedValue([orphan]);
    const res = await findFlight({ texto: "CS-ORPH", fecha: "2026-07-23" });
    expect(res.candidates).toHaveLength(0);
  });

  it("al enriquecerse (ya tiene movimientos) REAPARECE en get_day", async () => {
    const enriched = vis({ id: "v-orphan", movements: [mov({ id: "m", callsign: "NEW1", eta: "09:00" })] });
    mocks.visitFindMany.mockResolvedValue([enriched]);
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights.map((f) => f.visitId)).toContain("v-orphan");
  });
});

// ===========================================================================
// C1 SMOKE FIX — el arrastre NO debe traer estados TERMINALES (OFF_BLOCKS /
// NO_SHOW). Smoke prod: 184/224 arrastre, 115 fantasmas (103 NO_SHOW + 12
// OFF_BLOCKS) inundaban el board. El fix añade `state NOT IN
// ("OFF_BLOCKS","NO_SHOW")` a la rama de arrastre de dayUniverseWhere.
//
// Como la partición del universo la aplica la BD via el where (findMany está
// mockeado), aquí el mock RESUELVE el dataset interpretando FIELMENTE el where
// que produce dayUniverseWhere (la fuente real): así el test es una regresión
// del CONTENIDO del where, no de una copia. Con el where actual (sin exclusión
// de state) los fantasmas de arrastre aparecen → ROJO; con el fix, se van.
// ===========================================================================
type WhereCond = Record<string, unknown>;

function matchMovementCond(m: MovementRow, cond: WhereCond): boolean {
  for (const [k, v] of Object.entries(cond)) {
    const mv = (m as unknown as Record<string, unknown>)[k];
    if (v === null) {
      if (mv !== null && mv !== undefined) return false;
    } else if (v instanceof Date) {
      if (!(mv instanceof Date) || mv.getTime() !== v.getTime()) return false;
    } else if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if ("not" in o && mv === o.not) return false;
      if ("notIn" in o && (o.notIn as unknown[]).includes(mv)) return false;
    } else if (mv !== v) {
      return false;
    }
  }
  return true;
}

function matchArm(v: VisitRow, arm: WhereCond): boolean {
  for (const [k, cond] of Object.entries(arm)) {
    if (k === "palmaDay") {
      if (cond instanceof Date) {
        if (v.palmaDay.getTime() !== cond.getTime()) return false;
      } else {
        const o = cond as { gte?: Date; lt?: Date };
        if (o.gte && v.palmaDay.getTime() < o.gte.getTime()) return false;
        if (o.lt && v.palmaDay.getTime() >= o.lt.getTime()) return false;
      }
    } else if (k === "movements") {
      const some = (cond as { some: WhereCond }).some;
      if (!v.movements.some((m) => matchMovementCond(m, some))) return false;
    }
  }
  return true;
}

function matchesUniverse(v: VisitRow, where: { OR: WhereCond[] }): boolean {
  return where.OR.some((arm) => matchArm(v, arm));
}

/** Mock de findMany que RESUELVE el dataset con el where REAL de dayUniverseWhere. */
function universeMock(dataset: VisitRow[]) {
  mocks.visitFindMany.mockImplementation(
    async (args: { where: { OR: WhereCond[] } }) => dataset.filter((v) => matchesUniverse(v, args.where))
  );
}

/** Visita de arrastre (palmaDay dentro de [D−14, D)) con una DEPARTURE dada. */
function arrastreVisit(id: string, depState: string): VisitRow {
  return vis({
    id,
    palmaDay: new Date(D.getTime() - 3 * DAY_MS), // 20-07-2026, en ventana
    aircraft: { registration: `REG-${id}` },
    movements: [
      mov({
        id: `${id}-dep`,
        direction: "DEPARTURE",
        callsign: `CS${id}`,
        etd: "20:00",
        atd: null,
        state: depState,
        flightCategory: "COMMERCIAL",
      }),
    ],
  });
}

const ALIVE_STATES = ["EXPECTED", "ON_BLOCKS", "PARKED", "TURNAROUND", "BOARDING"];
const TERMINAL_STATES = ["OFF_BLOCKS", "NO_SHOW"];

describe("get_day / find_flight — el arrastre excluye estados terminales (C1 smoke)", () => {
  it("arrastre con DEPARTURE NO_SHOW (nunca llegó) NO aparece en get_day", async () => {
    universeMock([arrastreVisit("noshow", "NO_SHOW"), arrastreVisit("vivo", "EXPECTED")]);
    const res = await getDay({ fecha: "2026-07-23" });
    const ids = res.flights.map((f) => f.visitId);
    expect(ids).not.toContain("noshow");
    expect(ids).toContain("vivo");
  });

  it("arrastre con DEPARTURE OFF_BLOCKS (ya salió) NO aparece en get_day", async () => {
    universeMock([arrastreVisit("gone", "OFF_BLOCKS"), arrastreVisit("vivo", "PARKED")]);
    const res = await getDay({ fecha: "2026-07-23" });
    const ids = res.flights.map((f) => f.visitId);
    expect(ids).not.toContain("gone");
    expect(ids).toContain("vivo");
  });

  it("arrastre con DEPARTURE NO_SHOW tampoco lo propone find_flight", async () => {
    universeMock([arrastreVisit("noshow", "NO_SHOW")]);
    const res = await findFlight({ texto: "CSnoshow", fecha: "2026-07-23" });
    expect(res.candidates).toHaveLength(0);
  });

  it("anti-regresión: arrastre VIVO (atd null, no terminal, no cancelado) SÍ aparece", async () => {
    universeMock(ALIVE_STATES.map((s, i) => arrastreVisit(`alive${i}`, s)));
    const res = await getDay({ fecha: "2026-07-23" });
    expect(res.flights).toHaveLength(ALIVE_STATES.length);
  });

  it("property: un arrastre aparece SII su DEPARTURE está VIVA (no OFF_BLOCKS ni NO_SHOW)", async () => {
    const all = [...ALIVE_STATES, ...TERMINAL_STATES];
    universeMock(all.map((s, i) => arrastreVisit(`s${i}`, s)));
    const res = await getDay({ fecha: "2026-07-23" });
    const present = new Set(res.flights.map((f) => f.visitId));
    all.forEach((s, i) => {
      const shouldAppear = !TERMINAL_STATES.includes(s);
      expect(present.has(`s${i}`)).toBe(shouldAppear);
    });
  });
});
