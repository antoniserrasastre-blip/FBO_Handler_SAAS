// Sprint 02 mcp-escritura-lote — regresiones de la REVIEW ADVERSARIAL (fase
// fix). TEST-WRITER. Nacen ROJAS contra la implementación actual.
//
// MAYOR — robustez del lote (updateMovements): hoy un error fuera de la
// validación (findUnique/update/eventLog/emit/autoTransition o el propio
// destructuring de la fila) escapa del bucle → aborta el lote, comitea el
// prefijo y filtra el error interno de Prisma en inglés. El contrato pinea
// fila ATÓMICA + lote PARCIAL EXPLÍCITO: la fila mala se rechaza con
// {ok:false, motivo} y las demás aplican, SIEMPRE.
// MENOR 1 — campos {} (o no-objeto) hoy cuenta como fila aplicada.
// MENOR 2 — log_incident con texto inválido llega a la BD y filtra
// PrismaClientValidationError en vez de fallar claro en español antes.
//
// Los mocks simulan el comportamiento real de Prisma ante entradas ilegales
// (lanzar), para que el rojo reproduzca el escape exacto del hallazgo.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentAuth, LogIncidentArgs, UpdateMovementsArgs } from "@/lib/mcp/contract";

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
const INT32_MAX = 2147483647;
const INTERNALS = /prisma|invocation/i;

interface UpdateCall {
  where: { id: unknown };
  data: Record<string, unknown>;
}
interface CreateCall {
  data: Record<string, unknown>;
}
const updateCalls = (): UpdateCall[] => mocks.movementUpdate.mock.calls.map((c) => c[0] as UpdateCall);
const eventLogCalls = (): CreateCall[] => mocks.eventLogCreate.mock.calls.map((c) => c[0] as CreateCall);
const autoTransitionVisits = (): string[] =>
  mocks.applyAutoTransition.mock.calls.map((c) => (c[0] as { visitId: string }).visitId);

// args deliberadamente malformados sin `any`
const asArgs = (v: unknown) => v as UpdateMovementsArgs;
const asIncidentArgs = (v: unknown) => v as LogIncidentArgs;

beforeEach(() => {
  vi.clearAllMocks();
  // Prisma REAL lanza PrismaClientValidationError si `id` no es string.
  mocks.movementFindUnique.mockImplementation(async ({ where }: { where: { id: unknown } }) => {
    if (typeof where.id !== "string") {
      throw new Error(
        "PrismaClientValidationError: Invalid `prisma.movement.findUnique()` invocation — Argument `id`: Invalid value provided. Expected String."
      );
    }
    if (where.id === "m-missing") return null;
    return { id: where.id, visitId: where.id.replace(/^m/, "v") };
  });
  // Prisma REAL lanza si un Int no cabe en Int32.
  mocks.movementUpdate.mockImplementation(async ({ where, data }: UpdateCall) => {
    for (const v of Object.values(data)) {
      if (typeof v === "number" && v > INT32_MAX) {
        throw new Error(
          "Invalid `prisma.movement.update()` invocation: The provided value is too large for the column's type — value does not fit in an INT column."
        );
      }
    }
    return { id: where.id, ...data };
  });
  mocks.eventLogCreate.mockResolvedValue({});
  // Prisma REAL lanza PrismaClientValidationError si `text` no es string.
  mocks.incidentCreate.mockImplementation(async ({ data }: CreateCall) => {
    if (typeof data.text !== "string") {
      throw new Error(
        "PrismaClientValidationError: Invalid `prisma.incident.create()` invocation — Argument `text`: Invalid value provided. Expected String."
      );
    }
    return { id: "inc-1", createdAt: new Date("2026-07-15T10:00:00Z"), ...data };
  });
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.applyAutoTransition.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// MAYOR — el lote sobrevive a CUALQUIER fila mala; jamás filtra internals.
// ---------------------------------------------------------------------------
describe("update_movements — MAYOR robustez del lote", () => {
  it("M1: [buena, null, buena] -> la null rechazada con motivo (sin internals) y las otras DOS aplican", async () => {
    const { resultados } = await updateMovements(
      asArgs({
        cambios: [
          { movementId: "m-1", campos: { parking: "P1" } },
          null,
          { movementId: "m-3", campos: { parking: "P3" } },
        ],
      }),
      AUTH
    );
    expect(resultados).toHaveLength(3);
    expect(resultados[0].ok).toBe(true);
    expect(resultados[2].ok).toBe(true);
    const mala = resultados[1];
    expect(mala.ok).toBe(false);
    if (!mala.ok) {
      expect(mala.motivo).toBeTruthy();
      expect(mala.motivo).not.toMatch(INTERNALS);
      expect(mala.motivo).not.toMatch(/destructure|cannot read/i);
    }
    const ids = updateCalls().map((c) => c.where.id);
    expect(ids).toContain("m-1");
    expect(ids).toContain("m-3");
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(2);
  });

  it("M2: movementId no-string ({} y 123) -> filas rechazadas con motivo, la buena aplica", async () => {
    const { resultados } = await updateMovements(
      asArgs({
        cambios: [
          { movementId: {}, campos: { parking: "P1" } },
          { movementId: 123, campos: { parking: "P2" } },
          { movementId: "m-3", campos: { parking: "P3" } },
        ],
      }),
      AUTH
    );
    expect(resultados).toHaveLength(3);
    for (const i of [0, 1]) {
      const r = resultados[i];
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBeTruthy();
        expect(r.motivo).not.toMatch(INTERNALS);
      }
    }
    expect(resultados[2].ok).toBe(true);
    expect(updateCalls().map((c) => c.where.id)).toEqual(["m-3"]);
  });

  it("M3: paxCount 3000000000 (fuera de Int32) -> fila rechazada con motivo (sin internals), la otra aplica", async () => {
    const { resultados } = await updateMovements(
      asArgs({
        cambios: [
          { movementId: "m-1", campos: { paxCount: 3000000000 } },
          { movementId: "m-2", campos: { parking: "P5" } },
        ],
      }),
      AUTH
    );
    expect(resultados).toHaveLength(2);
    const mala = resultados[0];
    expect(mala.ok).toBe(false);
    if (!mala.ok) {
      expect(mala.motivo).toBeTruthy();
      expect(mala.motivo).not.toMatch(INTERNALS);
    }
    expect(resultados[1].ok).toBe(true);
    // efectos: solo la fila buena deja EventLog/emit
    expect(eventLogCalls().map((c) => c.data.movementId)).toEqual(["m-2"]);
    expect(mocks.emit).toHaveBeenCalledTimes(1);
  });

  it("M4: update lanza un error arbitrario en la fila 2 de 3 -> fila 2 {ok:false, motivo} sin internals; filas 1 y 3 aplicadas con EventLog; CERO efectos de la 2", async () => {
    mocks.movementUpdate.mockImplementation(async ({ where, data }: UpdateCall) => {
      if (where.id === "m-2") {
        throw new Error("Invalid `prisma.movement.update()` invocation: kaboom interno de motor");
      }
      return { id: where.id, ...data };
    });
    const { resultados } = await updateMovements(
      asArgs({
        cambios: [
          { movementId: "m-1", campos: { parking: "P1" } },
          { movementId: "m-2", campos: { parking: "P2" } },
          { movementId: "m-3", campos: { parking: "P3" } },
        ],
      }),
      AUTH
    );
    expect(resultados).toHaveLength(3);
    expect(resultados[0].ok).toBe(true);
    expect(resultados[2].ok).toBe(true);
    const mala = resultados[1];
    expect(mala.ok).toBe(false);
    if (!mala.ok) {
      expect(mala.motivo).toBeTruthy();
      expect(mala.motivo).not.toMatch(INTERNALS);
    }
    // filas 1 y 3: EventLog + emit + autoTransition (sin state en campos)
    expect(eventLogCalls().map((c) => c.data.movementId).sort()).toEqual(["m-1", "m-3"]);
    expect(mocks.emit).toHaveBeenCalledTimes(2);
    const visitas = autoTransitionVisits();
    expect(visitas).toContain("v-1");
    expect(visitas).toContain("v-3");
    // CERO efectos de la fila 2
    expect(visitas).not.toContain("v-2");
    expect(eventLogCalls().map((c) => c.data.movementId)).not.toContain("m-2");
  });

  it("M5: cambios no-array ({}, string, undefined) -> error claro en español sin internals, cero escrituras", async () => {
    const malformados: unknown[] = [{}, { cambios: "m-1 parking P1" }, { cambios: undefined }];
    for (const args of malformados) {
      vi.clearAllMocks();
      let err: unknown;
      try {
        await updateMovements(asArgs(args), AUTH);
      } catch (e) {
        err = e;
      }
      expect(err, `cambios malformado ${JSON.stringify(args)} debe rechazarse con Error`).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toMatch(/cambios/i); // menciona el arg ofensor
      expect(msg).not.toMatch(INTERNALS);
      expect(msg).not.toMatch(/is not iterable|not a function|undefined/i);
      expect(mocks.movementUpdate).not.toHaveBeenCalled();
      expect(mocks.eventLogCreate).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// MENOR 1 — campos vacío o no-objeto: fila RECHAZADA, cero efectos.
// ---------------------------------------------------------------------------
describe("update_movements — MENOR 1 campos vacío / no-objeto", () => {
  it("campos {} -> fila rechazada con motivo; cero update/EventLog/emit/autoTransition", async () => {
    const { resultados } = await updateMovements(
      asArgs({ cambios: [{ movementId: "m-1", campos: {} }] }),
      AUTH
    );
    expect(resultados).toHaveLength(1);
    const r = resultados[0];
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBeTruthy();
    expect(mocks.movementUpdate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.applyAutoTransition).not.toHaveBeenCalled();
  });

  it("campos string -> fila rechazada con motivo sin internals; cero efectos", async () => {
    const { resultados } = await updateMovements(
      asArgs({ cambios: [{ movementId: "m-1", campos: "parking=P1" }] }),
      AUTH
    );
    const r = resultados[0];
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBeTruthy();
      expect(r.motivo).not.toMatch(INTERNALS);
    }
    expect(mocks.movementUpdate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });

  it("campos null -> fila rechazada con motivo sin internals, el lote sigue", async () => {
    const { resultados } = await updateMovements(
      asArgs({
        cambios: [
          { movementId: "m-1", campos: null },
          { movementId: "m-2", campos: { parking: "P2" } },
        ],
      }),
      AUTH
    );
    expect(resultados).toHaveLength(2);
    const r = resultados[0];
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBeTruthy();
      expect(r.motivo).not.toMatch(INTERNALS);
      expect(r.motivo).not.toMatch(/cannot convert|object\.entries|null/i);
    }
    expect(resultados[1].ok).toBe(true);
    expect(updateCalls().map((c) => c.where.id)).toEqual(["m-2"]);
  });
});

// ---------------------------------------------------------------------------
// MENOR 2 — log_incident: texto inválido falla claro y ANTES de tocar la BD.
// ---------------------------------------------------------------------------
describe("log_incident — MENOR 2 texto inválido", () => {
  async function esperarErrorClaro(args: unknown): Promise<void> {
    let err: unknown;
    try {
      await logIncident(asIncidentArgs(args), AUTH);
    } catch (e) {
      err = e;
    }
    expect(err, `logIncident(${JSON.stringify(args)}) debe rechazar`).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/texto/i); // menciona el arg ofensor
    expect(msg).not.toMatch(INTERNALS);
    // ANTES de tocar la BD: cero filas creadas
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  }

  it("texto no-string (12345 y null) -> error claro en español, cero incident/eventLog", async () => {
    await esperarErrorClaro({ texto: 12345 });
    vi.clearAllMocks();
    await esperarErrorClaro({ texto: null });
  });

  it("texto '' -> error claro, cero incident/eventLog", async () => {
    await esperarErrorClaro({ texto: "" });
  });

  it("texto solo-espacios -> error claro, cero incident/eventLog", async () => {
    await esperarErrorClaro({ texto: "   " });
  });
});

// ---------------------------------------------------------------------------
// MENOR residual (re-verificación del reviewer) — `vuelo` inválido.
// `texto` se validó en la vuelta anterior; `vuelo` no: con vuelo no-string
// pasa el truthy-check, visit.findUnique da null y findFlight revienta con
// "args.texto.trim is not a function" que llega TAL CUAL al agente.
// Pin: vuelo PRESENTE pero no-string/vacío/blanco = dictado roto -> error
// claro en español que mencione `vuelo`, MISMO mensaje para los cuatro casos,
// sin internals, cero filas creadas. vuelo AUSENTE sigue siendo incidencia
// general válida (guardia, no romper).
// ---------------------------------------------------------------------------
describe("log_incident — MENOR residual: vuelo inválido", () => {
  const VETADOS = /prisma|invocation|trim|not a function/i;

  async function esperarErrorVuelo(vuelo: unknown): Promise<string> {
    let err: unknown;
    try {
      await logIncident(asIncidentArgs({ texto: "incidencia de prueba", vuelo }), AUTH);
    } catch (e) {
      err = e;
    }
    expect(err, `vuelo=${JSON.stringify(vuelo)} debe rechazarse con Error`).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/vuelo/i); // menciona el arg ofensor
    expect(msg).not.toMatch(VETADOS);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
    return msg;
  }

  it("vuelo {} -> error claro en español, cero incident/eventLog", async () => {
    await esperarErrorVuelo({});
  });

  it("vuelo 123 -> error claro en español, cero incident/eventLog", async () => {
    await esperarErrorVuelo(123);
  });

  it("vuelo '' -> error claro (presente pero vacío = dictado roto, NO incidencia general)", async () => {
    await esperarErrorVuelo("");
  });

  it("vuelo solo-espacios -> error claro, cero incident/eventLog", async () => {
    await esperarErrorVuelo("   ");
  });

  it("pin: los cuatro vuelos inválidos producen el MISMO mensaje", async () => {
    const mensajes: string[] = [];
    for (const vuelo of [{}, 123, "", "   "]) {
      vi.clearAllMocks();
      mensajes.push(await esperarErrorVuelo(vuelo));
    }
    expect(new Set(mensajes).size).toBe(1);
  });

  it("guardia: vuelo AUSENTE sigue siendo incidencia general válida", async () => {
    const res = await logIncident({ texto: "incidencia general del turno" }, AUTH);
    expect(res.visitId).toBeNull();
    expect(mocks.incidentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.eventLogCreate).toHaveBeenCalledTimes(1);
  });
});
