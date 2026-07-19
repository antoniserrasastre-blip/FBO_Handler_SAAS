// Regresión M1 (review adversarial): la ventana de get_event_log debe ser el
// DÍA CIVIL DE PALMA, no [palmaDay, palmaDay+24h) UTC-naive. palmaDay NO es un
// instante — el día civil D en verano es [D-1 22:00Z, D 22:00Z), en invierno
// [D-1 23:00Z, D 23:00Z). La implementación debe derivar los límites vía Intl,
// jamás sumando offsets a mano; aquí solo se PINEAN los instantes esperados.

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventLogFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { eventLog: { findMany: mocks.eventLogFindMany } },
}));

import { getEventLog } from "./tools";

interface EventLogRow {
  action: string;
  details: string | null;
  timestamp: Date;
  user: { name: string } | null;
  visit: { movements: Array<{ callsign: string | null }> } | null;
}

function row(timestamp: string, action: string): EventLogRow {
  return {
    action,
    details: null,
    timestamp: new Date(timestamp),
    user: { name: "claude" },
    visit: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventLogFindMany.mockResolvedValue([]);
});

describe("get_event_log — ventana del día civil de Palma", () => {
  it("verano: fecha 2026-07-19 → where.timestamp = [2026-07-18T22:00Z, 2026-07-19T22:00Z)", async () => {
    await getEventLog({ fecha: "2026-07-19" });

    expect(mocks.eventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: {
            gte: new Date("2026-07-18T22:00:00.000Z"),
            lt: new Date("2026-07-19T22:00:00.000Z"),
          },
        }),
      })
    );
  });

  it("invierno (discrimina DST): fecha 2026-01-15 → [2026-01-14T23:00Z, 2026-01-15T23:00Z)", async () => {
    await getEventLog({ fecha: "2026-01-15" });

    expect(mocks.eventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: {
            gte: new Date("2026-01-14T23:00:00.000Z"),
            lt: new Date("2026-01-15T23:00:00.000Z"),
          },
        }),
      })
    );
  });

  it("atribución end-to-end: 2026-07-18T22:30Z (00:30 local del 19) SALE en el día 19", async () => {
    // El mock aplica el where RECIBIDO sobre el dataset — si la implementación
    // pide la ventana errónea, la entrada del wrap se pierde y el test falla.
    const dataset = [
      row("2026-07-18T21:30:00Z", "DIA_18"), // 23:30 local del 18 → día civil 18
      row("2026-07-18T22:30:00Z", "WRAP_19"), // 00:30 local del 19 → día civil 19
      row("2026-07-19T21:30:00Z", "DIA_19"), // 23:30 local del 19 → día civil 19
    ];
    mocks.eventLogFindMany.mockImplementation(
      async ({ where }: { where: { timestamp: { gte: Date; lt: Date } } }) =>
        dataset.filter(
          (r) =>
            r.timestamp.getTime() >= where.timestamp.gte.getTime() &&
            r.timestamp.getTime() < where.timestamp.lt.getTime()
        )
    );

    const res = await getEventLog({ fecha: "2026-07-19" });

    expect(res.entries.map((e) => e.action)).toEqual(["WRAP_19", "DIA_19"]);
    expect(res.entries.map((e) => e.timestamp)).toEqual([
      "2026-07-18T22:30:00.000Z",
      "2026-07-19T21:30:00.000Z",
    ]);
  });
});
