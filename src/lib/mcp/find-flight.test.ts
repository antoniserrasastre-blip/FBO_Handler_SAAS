import { describe, it, expect, beforeEach, vi } from "vitest";
import { timeDelta } from "@/lib/v2/upsert";

// find_flight matches in memory over prisma.visit.findMany rows of the day.
const mocks = vi.hoisted(() => ({
  visitFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { visit: { findMany: mocks.visitFindMany } },
}));

import { findFlight } from "./tools";

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
    palmaDay: new Date(Date.UTC(2026, 6, 19)),
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

// ---------------------------------------------------------------------------
// Test plan 4 — identity anchor
// ---------------------------------------------------------------------------
describe("find_flight — identity anchor", () => {
  it("resolves the registration-errata query 'CS-CHH LTM604' to visit A by callsign", async () => {
    const visitA = vis({
      id: "vA",
      aircraft: { registration: "CS-CHD" },
      movements: [mov({ id: "mA", callsign: "LTM604", eta: "08:00" })],
    });
    const visitB = vis({
      id: "vB",
      aircraft: { registration: "D-EFGH" },
      movements: [mov({ id: "mB", callsign: "DIFF01", eta: "14:00" })],
    });
    mocks.visitFindMany.mockResolvedValue([visitA, visitB]);

    const res = await findFlight({ texto: "CS-CHH LTM604" });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].visitId).toBe("vA");
    expect(res.candidates[0].matchedBy).toBe("callsign");
  });

  it("returns BOTH rotations for an ambiguous registration 'D-ASIM' — never chooses on its own", async () => {
    const rot1 = vis({
      id: "r1",
      aircraft: { registration: "D-ASIM" },
      movements: [mov({ id: "m1", callsign: "DASIM1", eta: "08:00" })],
    });
    const rot2 = vis({
      id: "r2",
      aircraft: { registration: "D-ASIM" },
      movements: [mov({ id: "m2", callsign: "DASIM2", eta: "18:00" })],
    });
    mocks.visitFindMany.mockResolvedValue([rot1, rot2]);

    const res = await findFlight({ texto: "D-ASIM" });

    expect(res.candidates).toHaveLength(2);
    expect(res.candidates.map((c) => c.visitId).sort()).toEqual(["r1", "r2"]);
    for (const c of res.candidates) expect(c.matchedBy).toBe("registration");
  });
});

// ---------------------------------------------------------------------------
// Test plan 5 — time anchor (property-based sweep; no fast-check in devDeps)
// callsign in the query does NOT match the visit → identity falls to time,
// exactly like upsert.findVisitByRotation: same rotation iff timeDelta <= 90.
// ---------------------------------------------------------------------------
describe("find_flight — time anchor", () => {
  const ETA = "00:20";
  const QUERY_CALLSIGN = "ZZZ999"; // never matches the visit's callsign

  it(`matches 'CALLSIGN HH:MM' as the same rotation iff min(diff,1440-diff) <= 90 over all 1440 minutes`, async () => {
    const base = vis({
      id: "vt",
      aircraft: { registration: "D-TEST" },
      movements: [mov({ id: "mt", callsign: "AAA111", eta: ETA, etd: null, ata: null, atd: null })],
    });
    mocks.visitFindMany.mockResolvedValue([base]);

    const mismatches: string[] = [];
    for (let minute = 0; minute < 1440; minute++) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const hhmm = `${hh}:${mm}`;
      const delta = timeDelta(hhmm, ETA);
      const shouldMatch = delta !== null && delta <= 90;

      const res = await findFlight({ texto: `${QUERY_CALLSIGN} ${hhmm}` });

      if (shouldMatch) {
        const c = res.candidates[0];
        const ok =
          res.candidates.length === 1 &&
          c?.visitId === "vt" &&
          c?.matchedBy === "time" &&
          c?.timeDeltaMin === delta;
        if (!ok) {
          mismatches.push(`${hhmm}: expected time-match delta=${delta}, got ${JSON.stringify(res.candidates)}`);
        }
      } else if (res.candidates.length !== 0) {
        mismatches.push(`${hhmm}: expected no match (delta=${delta}), got ${JSON.stringify(res.candidates)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("explicit midnight-wrap case: query 23:50 matches eta 00:20 as the same rotation (delta 30)", async () => {
    const base = vis({
      id: "vt",
      aircraft: { registration: "D-TEST" },
      movements: [mov({ id: "mt", callsign: "AAA111", eta: "00:20", etd: null, ata: null, atd: null })],
    });
    mocks.visitFindMany.mockResolvedValue([base]);

    const res = await findFlight({ texto: `${QUERY_CALLSIGN} 23:50` });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].visitId).toBe("vt");
    expect(res.candidates[0].matchedBy).toBe("time");
    expect(res.candidates[0].timeDeltaMin).toBe(30);
  });
});
