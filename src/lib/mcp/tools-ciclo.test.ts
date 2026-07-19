// Sprint 03 mcp-ciclo-completo — fase ROJA. TEST-WRITER.
// Unidad de las 5 tools nuevas del ciclo de vida (cancel/uncancel/create/fix/
// import). Contrato pineado: src/lib/mcp/contract.ts §Sprint 03.
//
// Mapeo test↔punto del test plan de la spec (1–8):
//   (1) Conservación cancel∘uncancel     → describe "conservación …"
//   (2) Guardia de evidencia + cancel     → describe "cancel_movement …"
//   (3) Dry-run / confirm de import_daily → describe "import_daily …"
//   (4) Regresión D-ASIM                  → cf_dasim + id_dasim
//   (5) fix_plan + disjunción de Sets     → describe "fix_plan …" + "disjunción …"
//   (6) create_flight                     → describe "create_flight …"
//   (7) EventLog atribuido al agente      → transversal en cada write
//
// Superficie de mock de BD pineada (el implementer se ata a ESTO):
//   aircraft.findUnique/create/update · operator.upsert/findFirst/findUnique ·
//   visit.findMany/findFirst/create/update/findUnique ·
//   movement.findUnique/upsert/update/updateMany/findFirst ·
//   eventLog.create/findFirst · incident.create.
// Además se mockean @/lib/autoTransition, @/lib/events (eventBus.emit),
// @/lib/noShowSweep (sweepNoShows espía → 0) y @/lib/pdfParser
// (parseCybermaxPdf enlatado; parseDate REPLICADO 1:1 del real — pura, sin DB).
// REALES (jamás mockeados): horas.ts, upsert.ts (upsertVisit/upsertMovement/
// upsertAircraft/upsertOperator corren contra el mock de prisma),
// resolveImportState y findOperator (@/lib/operators, tabla estática).
// horas.ts pasa por Intl real: vi.setSystemTime fija una fecha de VERANO para
// que el zulu no dependa del día en que corre la suite.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MOVEMENT_OPERATIONAL_FIELDS } from "@/lib/v2/upsert";
import { FIX_PLAN_FIELDS } from "@/lib/mcp/tools-ciclo";
import type {
  AgentAuth,
  CreateFlightResult,
  CancelMovementResult,
  UncancelMovementResult,
  FixPlanResult,
  ImportDailyPreviewResult,
  ImportDailyPersistResult,
} from "@/lib/mcp/contract";

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
  eventLogFindFirst: vi.fn(),
  incidentCreate: vi.fn(),
  applyAutoTransition: vi.fn(),
  emit: vi.fn(),
  sweepNoShows: vi.fn(),
  parseCybermaxPdf: vi.fn(),
}));

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
// parseDate REPLICADO 1:1 del real (pura, sin DB) — resolveImportState y el
// pipeline lo consumen; parseCybermaxPdf enlatado por test.
vi.mock("@/lib/pdfParser", () => ({
  parseCybermaxPdf: mocks.parseCybermaxPdf,
  parseDate: (ddmmyy: string) => {
    const [dd, mm, yy] = ddmmyy.split("/").map(Number);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
  },
}));

import {
  cancelMovement,
  uncancelMovement,
  createFlight,
  fixPlan,
  importDaily,
} from "@/lib/mcp/tools-ciclo";

const AUTH: AgentAuth = { tokenId: "tok-1", userId: "u-agent", userName: "agent-claude" };
const SUMMER = new Date(Date.UTC(2026, 6, 15, 12, 0)); // 15-07-2026, verano CEST (+02:00)

// --- typed call inspectors (sin `any`, patrón S2) ---------------------------
type Call = Record<string, unknown>;
const argsOf = (fn: { mock: { calls: unknown[][] } }): Call[] =>
  fn.mock.calls.map((c) => c[0] as Call);

let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

/**
 * Aserta que la promesa rechaza con un Error REAL (no el stub NotImplemented) —
 * así el test es rojo en rojo (el stub lanza NotImplemented) y verde cuando la
 * validación real lanza su Error en español. Patrón de S2 (tools-escritura.test).
 */
async function expectRejectsReal(p: Promise<unknown>, pattern?: RegExp) {
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

/** Todas las escrituras/efectos que NUNCA deben ocurrir en un rechazo. */
function expectNoMutations() {
  expect(mocks.aircraftCreate).not.toHaveBeenCalled();
  expect(mocks.aircraftUpdate).not.toHaveBeenCalled();
  expect(mocks.operatorUpsert).not.toHaveBeenCalled();
  expect(mocks.visitCreate).not.toHaveBeenCalled();
  expect(mocks.visitUpdate).not.toHaveBeenCalled();
  expect(mocks.movementUpsert).not.toHaveBeenCalled();
  expect(mocks.movementUpdate).not.toHaveBeenCalled();
  expect(mocks.movementUpdateMany).not.toHaveBeenCalled();
  expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  expect(mocks.emit).not.toHaveBeenCalled();
}

/** Movement tal cual lo devuelve movement.findUnique con include visit.aircraft. */
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
  vi.clearAllMocks();
  idSeq = 0;
  // upsertAircraft: matrícula nueva por defecto → create.
  mocks.aircraftFindUnique.mockResolvedValue(null);
  mocks.aircraftCreate.mockImplementation(async ({ data }: Call) => ({
    id: nextId("ac"),
    ...(data as Call),
  }));
  mocks.aircraftUpdate.mockImplementation(async ({ where, data }: Call) => ({
    id: (where as Call).id,
    ...(data as Call),
  }));
  mocks.operatorUpsert.mockImplementation(async ({ create }: Call) => ({
    id: nextId("op"),
    ...(create as Call),
  }));
  mocks.operatorFindFirst.mockResolvedValue(null);
  mocks.operatorFindUnique.mockResolvedValue(null);
  // upsertVisit sin match previo → create; findVisitByRotation → [] por defecto.
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindFirst.mockResolvedValue(null);
  mocks.visitCreate.mockImplementation(async ({ data }: Call) => ({
    id: nextId("v"),
    ...(data as Call),
  }));
  mocks.visitUpdate.mockImplementation(async ({ where, data }: Call) => ({
    id: (where as Call).id,
    ...(data as Call),
  }));
  mocks.visitFindUnique.mockResolvedValue(null);
  // movement.findUnique: composite (upsertMovement) → null (crea). Los tests de
  // cancel/uncancel/fix lo sobreescriben con una fila por { id }.
  mocks.movementFindUnique.mockResolvedValue(null);
  mocks.movementUpsert.mockImplementation(async ({ create }: Call) => {
    const c = create as Call;
    return { id: `${c.visitId as string}-${c.direction as string}`, ata: null, livePhase: null, ...c };
  });
  mocks.movementUpdate.mockImplementation(async ({ where, data }: Call) => ({
    id: (where as Call).id,
    ...(data as Call),
  }));
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

// ===========================================================================
// (5) Disjunción de Sets — PASA YA (verde en rojo): pinea un hecho del scaffold.
// ===========================================================================
describe("disjunción FIX_PLAN_FIELDS ∩ MOVEMENT_OPERATIONAL_FIELDS = ∅ (point 5)", () => {
  it("los dos Sets no comparten NINGÚN campo", () => {
    const inter = [...FIX_PLAN_FIELDS].filter((f) => MOVEMENT_OPERATIONAL_FIELDS.has(f));
    expect(inter).toEqual([]);
  });

  it("FIX_PLAN_FIELDS es EXACTAMENTE los 7 campos de plan del contrato", () => {
    expect([...FIX_PLAN_FIELDS].sort()).toEqual(
      ["callsign", "destination", "eta", "etd", "origin", "registration", "scheduledDate"].sort()
    );
  });
});

// ===========================================================================
// (2) cancel_movement — soft-cancel con guardia de evidencia.
// ===========================================================================
describe("cancel_movement — guardia de evidencia + soft-cancel (point 2, 7)", () => {
  it("COMMERCIAL sin ata/atd -> aplica sin confirmar + EventLog 'Cancelado por agente' atribuido", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow());
    const res: CancelMovementResult = await cancelMovement(
      { movementId: "m-1", motivo: "rutina" },
      AUTH
    );

    expect(mocks.movementUpdate).toHaveBeenCalledTimes(1);
    expect(argsOf(mocks.movementUpdate)[0]).toMatchObject({
      where: { id: "m-1" },
      data: { flightCategory: "CANCELLED" },
    });
    // EventLog: action EXACTA + atribución + details JSON con keys EXACTAS.
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(1);
    const log = argsOf(mocks.eventLogCreate)[0].data as Call;
    expect(log.action).toBe("Cancelado por agente");
    expect(log.userId).toBe("u-agent");
    expect(log.visitId).toBe("v-1");
    expect(log.movementId).toBe("m-1");
    const details = JSON.parse(String(log.details)) as Record<string, unknown>;
    expect(Object.keys(details).sort()).toEqual(["motivo", "previo"]);
    expect(details).toEqual({ motivo: "rutina", previo: "COMMERCIAL" });
    // SSE + jamás autoTransition (cancelar no es estado operativo).
    expect(argsOf(mocks.emit)[0].type ?? (mocks.emit.mock.calls[0]?.[0] as Call)?.type).toBe(
      "flight_updated"
    );
    expect(mocks.applyAutoTransition).not.toHaveBeenCalled();

    expect(res.previo).toBe("COMMERCIAL");
    expect(res.motivo).toBe("rutina");
    expect(res.callsign).toBe("NJE123");
    expect(res.registration).toBe("CS-LTO");
    expect(res.visitId).toBe("v-1");
  });

  it("con ata (ya operó) y SIN confirmar -> Error con callsign+matrícula+hora real, CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ ata: "11:23", callsign: "NJE123" }));
    let err: unknown;
    try {
      await cancelMovement({ movementId: "m-1", motivo: "CNX eSIA" }, AUTH);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).not.toMatch(/NotImplemented/i);
    expect(msg).toContain("NJE123"); // callsign
    expect(msg).toContain("CS-LTO"); // matrícula
    expect(msg).toContain("11:23"); // hora real
    expectNoMutations();
  });

  it("con atd y confirmar:true -> aplica + EventLog con details {motivo, previo}", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ atd: "12:05", flightCategory: "FERRY" }));
    const res = await cancelMovement(
      { movementId: "m-1", motivo: "error de plan", confirmar: true },
      AUTH
    );
    expect(mocks.movementUpdate).toHaveBeenCalledTimes(1);
    const log = argsOf(mocks.eventLogCreate)[0].data as Call;
    const details = JSON.parse(String(log.details)) as Record<string, unknown>;
    expect(details).toEqual({ motivo: "error de plan", previo: "FERRY" });
    expect(res.previo).toBe("FERRY");
  });

  it("ya CANCELLED -> Error ('ya está cancelado'), CERO escrituras (protege el previo)", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "CANCELLED" }));
    await expectRejectsReal(cancelMovement({ movementId: "m-1", motivo: "x" }, AUTH), /cancelad/i);
    expectNoMutations();
  });

  it("confirmar no-booleano ('1') -> Error (booleano estricto), CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ ata: "11:23" }));
    await expectRejectsReal(
      cancelMovement({ movementId: "m-1", motivo: "x", confirmar: "1" as unknown as boolean }, AUTH)
    );
    expectNoMutations();
  });

  it("motivo vacío -> Error; motivo ausente -> Error; CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow());
    await expectRejectsReal(cancelMovement({ movementId: "m-1", motivo: "" }, AUTH));
    await expectRejectsReal(
      cancelMovement({ movementId: "m-1" } as unknown as { movementId: string; motivo: string }, AUTH)
    );
    expectNoMutations();
  });

  it("movement inexistente -> Error, CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(null);
    await expectRejectsReal(cancelMovement({ movementId: "m-missing", motivo: "x" }, AUTH));
    expectNoMutations();
  });
});

// ===========================================================================
// (2) uncancel_movement — restaura el previo desde el EventLog del cancel.
// ===========================================================================
describe("uncancel_movement — restaura previo desde EventLog (point 2, 7)", () => {
  it("restaura FERRY + EventLog 'Cancelación deshecha por agente' details {restaurado}", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "CANCELLED" }));
    mocks.eventLogFindFirst.mockResolvedValue({
      action: "Cancelado por agente",
      details: JSON.stringify({ motivo: "x", previo: "FERRY" }),
    });
    const res: UncancelMovementResult = await uncancelMovement({ movementId: "m-1" }, AUTH);

    expect(argsOf(mocks.movementUpdate)[0]).toMatchObject({
      where: { id: "m-1" },
      data: { flightCategory: "FERRY" },
    });
    const log = argsOf(mocks.eventLogCreate)[0].data as Call;
    expect(log.action).toBe("Cancelación deshecha por agente");
    expect(log.userId).toBe("u-agent");
    const details = JSON.parse(String(log.details)) as Record<string, unknown>;
    expect(details).toEqual({ restaurado: "FERRY" });
    expect(res.restaurado).toBe("FERRY");
    expect((mocks.emit.mock.calls[0]?.[0] as Call)?.type).toBe("flight_updated");
  });

  it("flightCategory ≠ CANCELLED -> Error ('no está cancelado'), CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "COMMERCIAL" }));
    await expectRejectsReal(uncancelMovement({ movementId: "m-1" }, AUTH), /cancelad/i);
    expectNoMutations();
  });

  it("sin EventLog de cancel previo -> Error (no hay previo fiable), CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "CANCELLED" }));
    mocks.eventLogFindFirst.mockResolvedValue(null);
    await expectRejectsReal(uncancelMovement({ movementId: "m-1" }, AUTH));
    expectNoMutations();
  });

  it("details del cancel ilegible -> Error claro, CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ flightCategory: "CANCELLED" }));
    mocks.eventLogFindFirst.mockResolvedValue({
      action: "Cancelado por agente",
      details: "no-es-json",
    });
    await expectRejectsReal(uncancelMovement({ movementId: "m-1" }, AUTH));
    expectNoMutations();
  });

  it("movement inexistente -> Error", async () => {
    mocks.movementFindUnique.mockResolvedValue(null);
    await expectRejectsReal(uncancelMovement({ movementId: "m-missing" }, AUTH));
  });
});

// ===========================================================================
// (1) Conservación: cancel∘uncancel = flightCategory previo EXACTO.
// Property sobre COMMERCIAL|FERRY × {sin horas, con ata, con atd}. Mock stateful:
// cancel escribe CANCELLED y su EventLog; uncancel lee ese EventLog y restaura.
// ===========================================================================
describe("conservación cancel∘uncancel = previo EXACTO (point 1)", () => {
  const previos: Array<"COMMERCIAL" | "FERRY"> = ["COMMERCIAL", "FERRY"];
  const horasCombos: Array<{ label: string; horas: Record<string, string> }> = [
    { label: "sin horas", horas: {} },
    { label: "con ata", horas: { ata: "11:23" } },
    { label: "con atd", horas: { atd: "12:40" } },
  ];
  const table = previos.flatMap((previo) =>
    horasCombos.map((h) => [previo, h.label, h.horas] as const)
  );

  it.each(table)("previo=%s %s -> cancel∘uncancel deja el previo intacto", async (previo, _label, horas) => {
    let state: Record<string, unknown> = movRow({ flightCategory: previo, ...horas });
    const logs: Call[] = [];
    mocks.movementFindUnique.mockImplementation(async ({ where }: Call) =>
      (where as Call).id === "m-1" ? state : null
    );
    mocks.movementUpdate.mockImplementation(async ({ data }: Call) => {
      state = { ...state, ...(data as Call) };
      return state;
    });
    mocks.eventLogCreate.mockImplementation(async ({ data }: Call) => {
      logs.push(data as Call);
      return { id: "el" };
    });
    mocks.eventLogFindFirst.mockImplementation(async ({ where }: Call) => {
      const movementId = (where as Call).movementId;
      const found = [...logs]
        .reverse()
        .find((l) => l.action === "Cancelado por agente" && l.movementId === movementId);
      return found ?? null;
    });

    const hasEvidence = Boolean(horas.ata || horas.atd);
    await cancelMovement(
      { movementId: "m-1", motivo: "CNX", confirmar: hasEvidence ? true : undefined },
      AUTH
    );
    expect(state.flightCategory).toBe("CANCELLED"); // sanity: el cancel aplicó
    await uncancelMovement({ movementId: "m-1" }, AUTH);
    expect(state.flightCategory).toBe(previo); // conservación EXACTA
  });
});

// ===========================================================================
// (6) create_flight — rotación fuera del daily sobre upsertVisit (hint D-ASIM).
// ===========================================================================
describe("create_flight — piernas, Zulu, EventLog (point 6, 7)", () => {
  it("(a) solo llegada -> 1 movement ARRIVAL con eta Zulu + state EXPECTED + dual", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const res: CreateFlightResult = await createFlight(
      { registration: "9H-ABC", callsign: "VJT123", llegada: { hora: "13:23", origen: "LFPB" } },
      AUTH
    );
    expect(mocks.movementUpsert).toHaveBeenCalledTimes(1);
    const create = argsOf(mocks.movementUpsert)[0].create as Call;
    expect(create.direction).toBe("ARRIVAL");
    expect(create.eta).toBe("11:23"); // 13:23 local verano -> 11:23 Zulu
    expect(create.state).toBe("EXPECTED");
    expect(create.origin).toBe("LFPB");

    expect(res.creada).toBe(true);
    expect(res.piernas).toHaveLength(1);
    expect(res.piernas[0]).toMatchObject({ direction: "ARRIVAL", creada: true });
    expect(res.piernas[0].dual).toBe("11:23Z / 13:23 local");
    expect(res.fecha).toBe("2026-07-15");

    const log = argsOf(mocks.eventLogCreate)[0].data as Call;
    expect(log.action).toBe("Vuelo creado por agente");
    expect(log.userId).toBe("u-agent");
    expect((mocks.emit.mock.calls[0]?.[0] as Call)?.type).toBe("flight_created");
  });

  it("(b) solo salida -> 1 movement DEPARTURE con etd Zulu + state EXPECTED", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const res = await createFlight(
      { registration: "9H-ABC", callsign: "VJT123", salida: { hora: "15:00", destino: "LEMD" } },
      AUTH
    );
    expect(mocks.movementUpsert).toHaveBeenCalledTimes(1);
    const create = argsOf(mocks.movementUpsert)[0].create as Call;
    expect(create.direction).toBe("DEPARTURE");
    expect(create.etd).toBe("13:00"); // 15:00 local verano -> 13:00 Zulu
    expect(create.state).toBe("EXPECTED");
    expect(create.destination).toBe("LEMD");
    expect(res.piernas[0]).toMatchObject({ direction: "DEPARTURE", creada: true });
  });

  it("(c) rotación completa -> ARRIVAL+DEPARTURE, type TURNAROUND (Visit nueva), dual por pierna", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const res = await createFlight(
      {
        registration: "9H-ABC",
        callsign: "VJT123",
        llegada: { hora: "13:23" },
        salida: { hora: "15:00" },
      },
      AUTH
    );
    expect(mocks.movementUpsert).toHaveBeenCalledTimes(2);
    // type SOLO en Visit nueva -> TURNAROUND con las dos piernas.
    const visitUpdData = argsOf(mocks.visitUpdate).map((c) => c.data as Call);
    expect(visitUpdData.some((d) => d.type === "TURNAROUND")).toBe(true);
    expect(res.piernas).toHaveLength(2);
    const duals = res.piernas.map((p) => p.dual);
    expect(duals).toContain("11:23Z / 13:23 local");
    expect(duals).toContain("13:00Z / 15:00 local");
  });

  it("(d) sin ninguna pierna -> Error, CERO escrituras", async () => {
    await expectRejectsReal(createFlight({ registration: "9H-ABC", callsign: "VJT123" }, AUTH));
    expectNoMutations();
  });

  it("(e) pierna sin `hora` -> Error, CERO escrituras", async () => {
    await expectRejectsReal(
      createFlight(
        { registration: "9H-ABC", callsign: "VJT123", llegada: { origen: "LFPB" } as unknown as { hora: string } },
        AUTH
      )
    );
    expectNoMutations();
  });

  it("(f) clave desconocida en una pierna -> Error, CERO escrituras", async () => {
    await expectRejectsReal(
      createFlight(
        {
          registration: "9H-ABC",
          callsign: "VJT123",
          llegada: { hora: "13:23", zzz: "x" } as unknown as { hora: string },
        },
        AUTH
      )
    );
    expectNoMutations();
  });

  it("(g) `operador` que no existe -> Error sin crear NADA", async () => {
    mocks.operatorFindFirst.mockResolvedValue(null);
    mocks.operatorFindUnique.mockResolvedValue(null);
    await expectRejectsReal(
      createFlight(
        { registration: "9H-ABC", callsign: "VJT123", llegada: { hora: "13:23" }, operador: "NOEXISTE" },
        AUTH
      )
    );
    expectNoMutations();
  });

  it("(4a) D-ASIM: existe visita del mismo avión+día con callsign/horas alejadas -> visit.create, 1ª intacta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    // rotation lookup (upsertVisit → findVisitByRotation) devuelve la 1ª rotación,
    // con callsign y hora que NO casan la nueva (11:23 vs 06:00, >90').
    mocks.visitFindMany.mockResolvedValue([
      {
        id: "v-old",
        operatorId: null,
        createdAt: new Date("2026-07-15T05:00:00Z"),
        movements: [{ direction: "ARRIVAL", callsign: "OTHER99", eta: "06:00", etd: null }],
      },
    ]);
    const res = await createFlight(
      { registration: "9H-ABC", callsign: "VJT123", llegada: { hora: "13:23" } },
      AUTH
    );
    expect(mocks.visitCreate).toHaveBeenCalledTimes(1); // Visit PROPIA
    // cero updates a la 1ª rotación (v-old jamás se toca).
    expect(argsOf(mocks.visitUpdate).map((c) => (c.where as Call).id)).not.toContain("v-old");
    expect(res.creada).toBe(true);
  });
});

// ===========================================================================
// (5) fix_plan — corrige plan sin tocar operativos ni identidad de la Visit.
// ===========================================================================
describe("fix_plan — allowlist de plan, validación atómica (point 5, 7)", () => {
  it("registration+callsign+eta(ARRIVAL) -> movement.update SIN operativos/visitId, visit re-apuntada, visitId intacto", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    mocks.movementFindUnique.mockResolvedValue(
      movRow({ direction: "ARRIVAL", callsign: "OLD", eta: "05:00" })
    );
    const res: FixPlanResult = await fixPlan(
      { movementId: "m-1", campos: { registration: "9H-NEW", callsign: "vjt9", eta: "13:23" } },
      AUTH
    );

    expect(mocks.movementUpdate).toHaveBeenCalledTimes(1);
    const data = argsOf(mocks.movementUpdate)[0].data as Call;
    expect(data.eta).toBe("11:23");
    expect(data.callsign).toBe("VJT9"); // uppercase/trim
    // jamás toca operativos, visitId ni registration en el movement.
    expect(data.visitId).toBeUndefined();
    expect(data.registration).toBeUndefined();
    expect(data.ata).toBeUndefined();
    expect(data.state).toBeUndefined();

    // registration re-apunta la Visit a otro Aircraft: visit.update aircraftId,
    // sobre el MISMO visitId, sin tocar palmaDay.
    expect(mocks.visitUpdate).toHaveBeenCalledTimes(1);
    const vUpd = argsOf(mocks.visitUpdate)[0];
    expect((vUpd.where as Call).id).toBe("v-1");
    expect((vUpd.data as Call).aircraftId).toBeTruthy();
    expect((vUpd.data as Call).palmaDay).toBeUndefined();

    expect(res.visitId).toBe("v-1"); // identidad intacta
    expect(res.dual?.eta).toBe("11:23Z / 13:23 local");

    const log = argsOf(mocks.eventLogCreate)[0].data as Call;
    expect(log.action).toBe("Plan corregido por agente");
    expect(log.userId).toBe("u-agent");
  });

  it("campo operativo (ata / state) -> Error, CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    await expectRejectsReal(fixPlan({ movementId: "m-1", campos: { ata: "11:00" } }, AUTH));
    await expectRejectsReal(fixPlan({ movementId: "m-1", campos: { state: "PARKED" } }, AUTH));
    expectNoMutations();
  });

  it("campo desconocido -> Error", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    await expectRejectsReal(fixPlan({ movementId: "m-1", campos: { foo: "x" } }, AUTH));
    expectNoMutations();
  });

  it("`eta` en un DEPARTURE -> Error (eta sólo ARRIVAL)", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "DEPARTURE", eta: null, etd: "10:00" }));
    await expectRejectsReal(fixPlan({ movementId: "m-1", campos: { eta: "13:23" } }, AUTH));
    expectNoMutations();
  });

  it("validación ATÓMICA: un campo malo en el lote -> CERO escrituras", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    await expectRejectsReal(
      fixPlan({ movementId: "m-1", campos: { callsign: "VJT9", ata: "11:00" } }, AUTH)
    );
    expect(mocks.movementUpdate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });

  it("`campos` vacío o no-objeto -> Error", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    await expectRejectsReal(fixPlan({ movementId: "m-1", campos: {} }, AUTH));
    await expectRejectsReal(
      fixPlan({ movementId: "m-1", campos: null as unknown as Record<string, unknown> }, AUTH)
    );
    expectNoMutations();
  });

  it("movement inexistente -> Error", async () => {
    mocks.movementFindUnique.mockResolvedValue(null);
    await expectRejectsReal(fixPlan({ movementId: "m-missing", campos: { callsign: "X" } }, AUTH));
  });

  it("`scheduledDate` sólo toca movement.scheduledDate (Date), la Visit NO se toca", async () => {
    mocks.movementFindUnique.mockResolvedValue(movRow({ direction: "ARRIVAL" }));
    await fixPlan({ movementId: "m-1", campos: { scheduledDate: "20-07-2026" } }, AUTH);
    const data = argsOf(mocks.movementUpdate)[0].data as Call;
    expect(data.scheduledDate).toBeInstanceOf(Date);
    expect(mocks.visitUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// (3) import_daily — dry-run por defecto / confirm por el camino del PUT.
// ===========================================================================
const FLIGHT = {
  callsign: "NJE123",
  origin: "LFPB",
  arrivalDate: "15/07/26",
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
  departureDate: "15/07/26",
  etd: "11:00",
};
const PARSE_OK = { date: "15/07/26", flights: [FLIGHT], errors: [], warnings: [] };
const PDF_B64 = Buffer.from("%PDF-1.4\n%daily mock\n").toString("base64");
const NOTPDF_B64 = Buffer.from("esto no es un pdf").toString("base64");
// Visita en BD del día del PDF cuya matrícula NO aparece -> candidata a cancelar.
const CANCEL_VISIT = {
  id: "v-cancel",
  aircraft: { registration: "CS-OLD" },
  movements: [
    { id: "mc-arr", direction: "ARRIVAL", flightCategory: "COMMERCIAL", callsign: "OLD1", eta: "07:00", etd: null, origin: "LEMD", destination: null },
    { id: "mc-dep", direction: "DEPARTURE", flightCategory: "COMMERCIAL", callsign: "OLD1", eta: null, etd: "08:30", origin: null, destination: "LEMD" },
  ],
};

describe("import_daily — dry-run vs confirm (point 3, 7)", () => {
  it("DRY-RUN (sin confirmar): preview + toCancel enriquecido con movements + CERO escrituras", async () => {
    mocks.parseCybermaxPdf.mockResolvedValue(PARSE_OK);
    mocks.visitFindMany.mockResolvedValue([CANCEL_VISIT]); // reconciliación

    const res = (await importDaily({ pdf_base64: PDF_B64 }, AUTH)) as ImportDailyPreviewResult;

    // shape del preview
    expect(res.flights).toHaveLength(1);
    expect(String(res.date)).toContain("15");
    expect(res.toCancel).toHaveLength(1);
    expect(res.toCancel[0].visitId).toBe("v-cancel");
    expect(res.toCancel[0].registration).toBe("CS-OLD");
    // enriquecido: movements [{movementId, direction, flightCategory}] para cancelar 1 a 1
    expect(res.toCancel[0].movements).toEqual([
      { movementId: "mc-arr", direction: "ARRIVAL", flightCategory: "COMMERCIAL" },
      { movementId: "mc-dep", direction: "DEPARTURE", flightCategory: "COMMERCIAL" },
    ]);

    // CERO escrituras en TODO el mock (ni BD ni EventLog), ni sweep ni emit.
    expectNoMutations();
    expect(mocks.sweepNoShows).not.toHaveBeenCalled();
  });

  it("CONFIRM (confirmar:true): persiste por el PUT, EventLogs del agente, sweepNoShows(userId), updateMany JAMÁS", async () => {
    mocks.parseCybermaxPdf.mockResolvedValue(PARSE_OK);
    mocks.visitFindMany.mockResolvedValue([]); // rotación nueva + sin toCancel

    const res = (await importDaily({ pdf_base64: PDF_B64, confirmar: true }, AUTH)) as ImportDailyPersistResult;

    // persistió por el camino real (upsertVisit → visit.create).
    expect(mocks.visitCreate).toHaveBeenCalled();
    // EventLogs del pipeline atribuidos al user del token.
    expect(mocks.eventLogCreate).toHaveBeenCalled();
    for (const c of argsOf(mocks.eventLogCreate)) {
      expect((c.data as Call).userId).toBe("u-agent");
    }
    // sweepNoShows atribuido al agente.
    expect(mocks.sweepNoShows).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-agent" }));
    // hard-rule #8: toCancel NUNCA en bloque -> movement.updateMany jamás.
    expect(mocks.movementUpdateMany).not.toHaveBeenCalled();

    // shape del confirm
    expect(res.creados).toBe(1);
    expect(res.actualizados).toBe(0);
    expect(res.noShows).toBe(0);
    expect(res.total).toBe(1);
    expect(Array.isArray(res.toCancel)).toBe(true);
  });

  it("(4b) D-ASIM confirm: el PDF trae una fila que NO casa la visita existente -> visit.create", async () => {
    mocks.parseCybermaxPdf.mockResolvedValue(PARSE_OK);
    // rotation lookup (where.aircraftId) devuelve una visita con callsign/hora
    // alejadas; la reconciliación (where.movements) devuelve [].
    mocks.visitFindMany.mockImplementation(async ({ where }: Call) => {
      if ((where as Call).aircraftId) {
        return [
          {
            id: "v-old",
            operatorId: null,
            createdAt: new Date("2026-07-15T03:00:00Z"),
            movements: [{ direction: "ARRIVAL", callsign: "ZZZ999", eta: "03:00", etd: null }],
          },
        ];
      }
      return [];
    });

    await importDaily({ pdf_base64: PDF_B64, confirmar: true }, AUTH);
    expect(mocks.visitCreate).toHaveBeenCalledTimes(1); // rotación PROPIA
    expect(argsOf(mocks.visitUpdate).map((c) => (c.where as Call).id)).not.toContain("v-old");
  });

  it("pdf_base64 que no empieza por %PDF -> Error, jamás se parsea", async () => {
    await expectRejectsReal(importDaily({ pdf_base64: NOTPDF_B64 }, AUTH));
    expect(mocks.parseCybermaxPdf).not.toHaveBeenCalled();
    expectNoMutations();
  });

  it("pdf_base64 vacío -> Error", async () => {
    await expectRejectsReal(importDaily({ pdf_base64: "" }, AUTH));
    expect(mocks.parseCybermaxPdf).not.toHaveBeenCalled();
  });
});
