// Sprint 02 mcp-escritura-lote — fase ROJA. TEST-WRITER.
// T9 — endurecimiento m2 (deuda de la review de S1): el tokenizador de hora de
// find_flight sólo cuenta como HORA lo que cae en 00:00–23:59. Hoy el bug m2
// acepta "25:00" (y otras fuera de rango) como hora y produce un delta FANTASMA
// (25:00 -> 1500 min -> wrap a 01:00; 99:99 -> delta negativo). Estos tests
// NACEN ROJOS contra el código S1 vivo; verdes cuando el tokenizador acota rango.
// find_flight matchea en memoria sobre prisma.visit.findMany (patrón S1).

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({ visitFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { visit: { findMany: mocks.visitFindMany } } }));

import { findFlight } from "@/lib/mcp/tools";

function visitRow(o: { id: string; eta: string; callsign?: string; registration?: string }) {
  return {
    id: o.id,
    palmaDay: new Date(Date.UTC(2026, 6, 15)),
    aircraft: { registration: o.registration ?? "D-TEST" },
    operator: { name: "Op" },
    movements: [
      {
        id: `${o.id}-m`,
        direction: "ARRIVAL",
        callsign: o.callsign ?? "AAA111",
        origin: "LFPB",
        destination: null,
        eta: o.eta,
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
  mocks.visitFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// m2 — fuera de rango = token de TEXTO, jamás delta de tiempo fantasma. (ROJO)
// ---------------------------------------------------------------------------
describe("find_flight — T9 m2: HH:MM fuera de rango NO es hora", () => {
  // Cada caso usa una eta con la que el bug vivo produce hoy un match fantasma,
  // para que el rojo sea inequívoco.
  const casos: Array<{ label: string; texto: string; eta: string }> = [
    { label: "'25:00' (1500 -> wrap 01:00) vs eta 01:00", texto: "25:00", eta: "01:00" },
    { label: "'24:00' (1440 -> wrap 00:00) vs eta 00:00", texto: "24:00", eta: "00:00" },
    { label: "'12:60' (780 == 13:00) vs eta 13:00", texto: "12:60", eta: "13:00" },
    { label: "'99:99' (delta negativo) vs eta 01:00", texto: "99:99", eta: "01:00" },
  ];

  for (const c of casos) {
    it(`${c.label} -> CERO candidatos (hoy hay un fantasma matchedBy time)`, async () => {
      mocks.visitFindMany.mockResolvedValue([visitRow({ id: "v1", eta: c.eta })]);
      const res = await findFlight({ texto: c.texto });
      expect(res.candidates.filter((cand) => cand.matchedBy === "time")).toHaveLength(0);
      expect(res.candidates).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Regresión: dentro de rango SIGUE contando como hora (nace verde, guardián).
// ---------------------------------------------------------------------------
describe("find_flight — T9 regresión: HH:MM válida sigue siendo hora", () => {
  it("'23:59' (borde superior) vs eta 23:59 -> 1 candidato matchedBy time delta 0", async () => {
    mocks.visitFindMany.mockResolvedValue([visitRow({ id: "v1", eta: "23:59" })]);
    const res = await findFlight({ texto: "ZZZ999 23:59" });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].matchedBy).toBe("time");
    expect(res.candidates[0].timeDeltaMin).toBe(0);
  });

  it("property: toda '00:00'..'23:59' con eta igual se trata como hora (delta 0)", async () => {
    for (const t of ["00:00", "00:59", "09:05", "12:00", "13:30", "23:00", "23:59"]) {
      mocks.visitFindMany.mockResolvedValue([visitRow({ id: "v1", eta: t })]);
      const res = await findFlight({ texto: `ZZZ999 ${t}` });
      expect(res.candidates.some((c) => c.matchedBy === "time" && c.timeDeltaMin === 0)).toBe(true);
    }
  });
});
