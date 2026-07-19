// Sprint 02 mcp-escritura-lote — fase ROJA. TEST-WRITER.
// T3 (rango vía tool) · T4 (lote parcial + fila atómica) · T5 (EventLog +
// invariantes + autoTransition) · T6 (allowlist paridad por import) · T7
// (log_incident). Contrato pineado: src/lib/mcp/contract.ts §Sprint 02.
//
// Superficie de mock de BD pineada (el implementer se ata a esto):
//   movement.findUnique/update · eventLog.create · incident.create ·
//   visit.findMany (reuso findFlight) · visit.findUnique (vuelo=visitId exacto).
// Además se mockean @/lib/autoTransition (reuso del camino PATCH) y @/lib/events
// (emit flight_updated por fila). horas.ts es REAL: la conversión pasa por Intl,
// y vi.setSystemTime fija una fecha de verano para que el resultado no dependa
// del día en que corre la suite.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MOVEMENT_OPERATIONAL_FIELDS } from "@/lib/v2/upsert";
import type { AgentAuth, UpdateMovementsRow, UpdateMovementsRowOk } from "@/lib/mcp/contract";

const mocks = vi.hoisted(() => ({
  movementFindUnique: vi.fn(),
  movementUpdate: vi.fn(),
  eventLogCreate: vi.fn(),
  incidentCreate: vi.fn(),
  visitFindMany: vi.fn(),
  visitFindUnique: vi.fn(),
  applyAutoTransition: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    movement: { findUnique: mocks.movementFindUnique, update: mocks.movementUpdate },
    eventLog: { create: mocks.eventLogCreate },
    incident: { create: mocks.incidentCreate },
    visit: { findMany: mocks.visitFindMany, findUnique: mocks.visitFindUnique },
  },
}));
vi.mock("@/lib/autoTransition", () => ({ applyAutoTransition: mocks.applyAutoTransition }));
vi.mock("@/lib/events", () => ({ eventBus: { emit: mocks.emit } }));

import { updateMovements, logIncident } from "@/lib/mcp/tools-escritura";

const AUTH: AgentAuth = { tokenId: "tok-1", userId: "u-agent", userName: "agent-claude" };
const SUMMER = new Date(Date.UTC(2026, 6, 15, 12, 0)); // 15-07-2026, verano CEST

// --- typed helpers to inspect mock calls without `any` ----------------------
interface UpdateCall {
  where: { id: string };
  data: Record<string, unknown>;
}
interface CreateCall {
  data: Record<string, unknown>;
}
const updateCalls = (): UpdateCall[] => mocks.movementUpdate.mock.calls.map((c) => c[0] as UpdateCall);
const eventLogCalls = (): CreateCall[] => mocks.eventLogCreate.mock.calls.map((c) => c[0] as CreateCall);

// A Visit row shaped like prisma.visit.findMany returns, for the find_flight
// reuse inside log_incident.
function visitRow(o: { id: string; callsign?: string; registration?: string; eta?: string }) {
  return {
    id: o.id,
    palmaDay: new Date(Date.UTC(2026, 6, 15)),
    aircraft: { registration: o.registration ?? "CS-XXX" },
    operator: { name: "Op" },
    movements: [
      {
        id: `${o.id}-m`,
        direction: "ARRIVAL",
        callsign: o.callsign ?? "AAA111",
        origin: "LFPB",
        destination: null,
        eta: o.eta ?? "08:00",
        etd: null,
        ata: null,
        atd: null,
        state: "SCHEDULED",
        parking: "P1",
        paxCount: 4,
        paxCountReal: null,
        crewCount: 2,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // movement id -> row on visit `v-<n>` (id "m-1" => visit "v-1"); "m-missing" => null.
  mocks.movementFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "m-missing" ? null : { id: where.id, visitId: where.id.replace(/^m/, "v") }
  );
  mocks.movementUpdate.mockImplementation(async ({ where, data }: UpdateCall) => ({ id: where.id, ...data }));
  mocks.eventLogCreate.mockResolvedValue({});
  mocks.incidentCreate.mockImplementation(async ({ data }: CreateCall) => ({
    id: "inc-1",
    createdAt: new Date("2026-07-15T10:00:00Z"),
    ...data,
  }));
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.applyAutoTransition.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

const rowById = (rows: UpdateMovementsRow[]) => Object.fromEntries(rows.map((r) => [r.movementId, r]));

// ---------------------------------------------------------------------------
// T3 — hora ilegible vía update_movements: esa fila se rechaza, las demás aplican.
// ---------------------------------------------------------------------------
describe("update_movements — T3 hora ilegible rechaza sólo su fila", () => {
  it("lote de 3 con ata '25:00' en la del medio -> 2 aplicadas + 1 rechazada con motivo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const { resultados } = await updateMovements(
      {
        cambios: [
          { movementId: "m-1", campos: { ata: "13:23" } },
          { movementId: "m-2", campos: { ata: "25:00" } },
          { movementId: "m-3", campos: { paxCount: 4 } },
        ],
      },
      AUTH
    );
    const by = rowById(resultados);
    expect(by["m-1"].ok).toBe(true);
    expect(by["m-3"].ok).toBe(true);
    expect(by["m-2"].ok).toBe(false);
    if (!by["m-2"].ok) expect(by["m-2"].motivo).toBeTruthy();

    const updated = updateCalls().map((c) => c.where.id);
    expect(updated).toContain("m-1");
    expect(updated).toContain("m-3");
    expect(updated).not.toContain("m-2");
  });
});

// ---------------------------------------------------------------------------
// T4 — lote parcial explícito (tres motivos) + fila atómica.
// ---------------------------------------------------------------------------
describe("update_movements — T4 lote parcial + fila atómica", () => {
  it("movementId inexistente -> fila rechazada, cero efectos, las demás aplican", async () => {
    const { resultados } = await updateMovements(
      {
        cambios: [
          { movementId: "m-1", campos: { paxCount: 2 } },
          { movementId: "m-missing", campos: { paxCount: 3 } },
          { movementId: "m-3", campos: { parking: "P9" } },
        ],
      },
      AUTH
    );
    const by = rowById(resultados);
    expect(by["m-1"].ok).toBe(true);
    expect(by["m-3"].ok).toBe(true);
    expect(by["m-missing"].ok).toBe(false);

    expect(updateCalls().map((c) => c.where.id)).not.toContain("m-missing");
    expect(eventLogCalls().map((c) => c.data.movementId)).not.toContain("m-missing");
  });

  it("campo fuera de allowlist -> fila rechazada, cero efectos, las demás aplican", async () => {
    const { resultados } = await updateMovements(
      {
        cambios: [
          { movementId: "m-1", campos: { paxCount: 2 } },
          { movementId: "m-2", campos: { eta: "08:00" } }, // campo de PLAN, fuera de allowlist
        ],
      },
      AUTH
    );
    const by = rowById(resultados);
    expect(by["m-1"].ok).toBe(true);
    expect(by["m-2"].ok).toBe(false);
    expect(updateCalls().map((c) => c.where.id)).not.toContain("m-2");
    expect(eventLogCalls().map((c) => c.data.movementId)).not.toContain("m-2");
  });

  it("fila ATÓMICA: un campo bueno y uno malo -> rechazada ENTERA, cero efectos", async () => {
    const { resultados } = await updateMovements(
      { cambios: [{ movementId: "m-1", campos: { paxCount: 2, eta: "08:00" } }] },
      AUTH
    );
    expect(resultados[0].ok).toBe(false);
    expect(mocks.movementUpdate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T5 — EventLog e invariantes + autoTransition reusada.
// ---------------------------------------------------------------------------
describe("update_movements — T5 EventLog, emit, autoTransition", () => {
  it("N filas aplicadas -> N eventLog.create atribuidos al user del token, dual en horas, N emit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const { resultados } = await updateMovements(
      {
        cambios: [
          { movementId: "m-1", campos: { ata: "13:23", paxCount: 4 } }, // sin state -> autoTransition
          { movementId: "m-2", campos: { atd: "10:30 local" } }, //          sin state -> autoTransition
        ],
      },
      AUTH
    );
    expect(resultados.every((r) => r.ok)).toBe(true);

    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(2);
    for (const c of eventLogCalls()) {
      expect(String(c.data.action).startsWith("Actualizado por agente")).toBe(true);
      expect(c.data.userId).toBe("u-agent");
    }
    const logByMov = Object.fromEntries(eventLogCalls().map((c) => [c.data.movementId, c.data]));
    expect(logByMov["m-1"].visitId).toBe("v-1");
    expect(logByMov["m-2"].visitId).toBe("v-2");
    // details lleva los campos y la confirmación dual de las horas
    expect(String(logByMov["m-1"].details)).toContain("11:23Z / 13:23 local");

    // emit flight_updated por fila aplicada
    expect(mocks.emit).toHaveBeenCalledTimes(2);
    for (const c of mocks.emit.mock.calls) {
      expect((c[0] as { type: string }).type).toBe("flight_updated");
    }

    // autoTransition REUSADA cuando la fila no trae state
    expect(mocks.applyAutoTransition).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: "v-1", userId: "u-agent", userName: "agent-claude" })
    );
  });

  it("la respuesta de una fila con hora expone la dual", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const { resultados } = await updateMovements(
      { cambios: [{ movementId: "m-1", campos: { ata: "13:23" } }] },
      AUTH
    );
    const row = resultados[0] as UpdateMovementsRowOk;
    expect(row.ok).toBe(true);
    expect(row.dual?.ata).toBe("11:23Z / 13:23 local");
  });

  it("fila con state EXPLÍCITO -> NO llama autoTransition", async () => {
    const { resultados } = await updateMovements(
      { cambios: [{ movementId: "m-1", campos: { state: "ON_BLOCKS" } }] },
      AUTH
    );
    expect(resultados[0].ok).toBe(true);
    expect(mocks.applyAutoTransition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T6 — allowlist paridad por import (Set REAL de upsert.ts) + rechazos de tipo.
// ---------------------------------------------------------------------------
describe("update_movements — T6 allowlist por import", () => {
  const INT_FIELDS = new Set(["paxCount", "paxCountReal", "bagsChecked", "bagsCabin"]);
  const HORA_FIELDS = new Set(["ata", "atd", "tobt"]);
  function valueFor(field: string): unknown {
    if (INT_FIELDS.has(field)) return 3;
    if (field === "state") return "ON_BLOCKS";
    if (HORA_FIELDS.has(field)) return "11:23Z";
    return "X";
  }

  it("cada campo del Set MOVEMENT_OPERATIONAL_FIELDS con valor de tipo correcto es ACEPTADO", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    const fields = [...MOVEMENT_OPERATIONAL_FIELDS];
    const cambios = fields.map((f, i) => ({ movementId: `m-${i}`, campos: { [f]: valueFor(f) } }));
    const { resultados } = await updateMovements({ cambios }, AUTH);
    const rejected = resultados.filter((r) => !r.ok);
    expect(rejected).toEqual([]);
    expect(resultados).toHaveLength(fields.length);
  });

  it("rechazos: eta/callsign (plan), campoInventado, paxCount -1 y '4' (tipo), state NO_EXISTE", async () => {
    const cambios = [
      { movementId: "r-eta", campos: { eta: "08:00" } },
      { movementId: "r-callsign", campos: { callsign: "NJE1CK" } },
      { movementId: "r-inventado", campos: { campoInventado: "x" } },
      { movementId: "r-paxneg", campos: { paxCount: -1 } },
      { movementId: "r-paxstr", campos: { paxCount: "4" } },
      { movementId: "r-badstate", campos: { state: "NO_EXISTE" } },
    ];
    const { resultados } = await updateMovements({ cambios }, AUTH);
    expect(resultados.every((r) => r.ok === false)).toBe(true);
  });

  it("ata:null LIMPIA el campo (update con ata:null) y no produce dual", async () => {
    const { resultados } = await updateMovements(
      { cambios: [{ movementId: "m-1", campos: { ata: null } }] },
      AUTH
    );
    expect(resultados[0].ok).toBe(true);
    expect(updateCalls()[0].data.ata).toBeNull();
    expect((resultados[0] as UpdateMovementsRowOk).dual?.ata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T7 — log_incident (append-only).
// ---------------------------------------------------------------------------
describe("log_incident — T7 append-only", () => {
  it("sin vuelo -> incident.create {text, authorId, visitId:null} + 1 eventLog 'Incidencia registrada'", async () => {
    const res = await logIncident({ texto: "derrame de combustible en P4" }, AUTH);
    expect(res.visitId).toBeNull();

    expect(mocks.incidentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          text: "derrame de combustible en P4",
          authorId: "u-agent",
          visitId: null,
        }),
      })
    );
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(1);
    const log = eventLogCalls()[0].data;
    expect(String(log.action).startsWith("Incidencia registrada")).toBe(true);
    expect(log.details).toBe("derrame de combustible en P4");
  });

  it("vuelo = visitId exacto -> asociado (vía visit.findUnique)", async () => {
    mocks.visitFindUnique.mockResolvedValue({ id: "v-exact", aircraft: { registration: "CS-XXX" } });
    const res = await logIncident({ texto: "APU KO", vuelo: "v-exact" }, AUTH);
    expect(res.visitId).toBe("v-exact");
    expect(mocks.incidentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitId: "v-exact" }) })
    );
  });

  it("vuelo texto libre con 1 candidato (find_flight sobre HOY) -> asociado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    mocks.visitFindMany.mockResolvedValue([visitRow({ id: "v-hit", callsign: "LTM604" })]);
    const res = await logIncident({ texto: "retraso de handling", vuelo: "LTM604" }, AUTH);
    expect(res.visitId).toBe("v-hit");
    expect(mocks.incidentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visitId: "v-hit" }) })
    );
  });

  it("vuelo AMBIGUO (2 candidatos) -> Error con los candidatos, CERO incident/eventLog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    mocks.visitFindMany.mockResolvedValue([
      visitRow({ id: "v-a", callsign: "LTM604" }),
      visitRow({ id: "v-b", callsign: "LTM604" }),
    ]);
    await expect(logIncident({ texto: "x", vuelo: "LTM604" }, AUTH)).rejects.toThrow(/v-a|v-b|ambig|candidat/i);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });

  it("vuelo con 0 candidatos -> Error (real, no NotImplemented), cero efectos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SUMMER);
    mocks.visitFindMany.mockResolvedValue([]);
    let err: unknown;
    try {
      await logIncident({ texto: "x", vuelo: "NOEXISTE99" }, AUTH);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/NotImplemented/i);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
  });
});
