import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Set a real test key BEFORE importing crypto, so the route handler's
// transitive decrypt() call works against ciphertext we produce here.
beforeAll(() => {
  // 32 zero bytes, base64-encoded.
  process.env.PASSPORT_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString("base64");
});

// Helpers (imported lazily so the env var is in place first)
async function encryptVal(plain: string): Promise<string> {
  const { encrypt } = await import("@/lib/crypto");
  return encrypt(plain) as string;
}

function mockPrismaVisit(visit: unknown) {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findMany: vi.fn(async () => [visit]) },
    },
  }));
}

function mockSessionHandler() {
  vi.doMock("next-auth", () => ({
    getServerSession: vi.fn(async () => ({
      user: { id: "u1", email: "u@test", name: "Test", role: "HANDLER" },
    })),
  }));
}

function buildVisit(opts: {
  arrivalPaxCipher: string;
  arrivalPaxSource: string;
  crewCipher: string;
}) {
  return {
    id: "v-1",
    aircraftId: "ac-1",
    operatorId: "op-1",
    palmaDay: new Date("2025-06-12T00:00:00.000Z"),
    type: "TURNAROUND",
    arrivalDate: new Date("2025-06-12T08:30:00.000Z"),
    departureDate: new Date("2025-06-12T11:00:00.000Z"),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    aircraft: { registration: "CS-DXX", aircraftType: "GLEX" },
    movements: [
      {
        id: "m-arr-1",
        direction: "ARRIVAL",
        callsign: "NJE721CK",
        eta: "08:30",
        origin: "LFPB",
        scheduledDate: new Date("2025-06-12T08:30:00.000Z"),
        paxCount: 4,
        crewCount: 2,
        state: "PARKED",
        passengers: [
          {
            id: "p-1",
            givenNames: "Alice",
            surname: "Smith",
            passportEncrypted: opts.arrivalPaxCipher,
            nationality: "GB",
            status: "BOOKED",
            verified: true,
            source: opts.arrivalPaxSource,
          },
        ],
        crewAssignments: [
          {
            crewMemberId: "c-1",
            roleOnFlight: "CAPTAIN",
            crewMember: {
              fullName: "Captain John",
              passportEncrypted: opts.crewCipher,
              nationality: "PT",
            },
          },
        ],
      },
      {
        id: "m-dep-1",
        direction: "DEPARTURE",
        callsign: "NJE721CK",
        etd: "11:00",
        destination: "EGGW",
        scheduledDate: new Date("2025-06-12T11:00:00.000Z"),
        paxCount: 4,
        crewCount: 2,
        state: "PARKED",
        passengers: [],
        crewAssignments: [],
      },
    ],
    services: [],
    lostItems: [],
  };
}

async function callGet(query: string) {
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost/api/flights?${query}`);
  return GET(req);
}

describe("GET /api/flights?include=people", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("next-auth");
  });

  it("returns the flight and decrypts the passenger's passport on the wire", async () => {
    // The VisitCard pax row relies on this end-to-end contract: server
    // decrypts so the browser never holds ciphertext, but never exposes
    // PII until the user explicitly reveals it in the UI.
    const passportCipher = await encryptVal("AB123456");
    const crewCipher = await encryptVal("CC999777");
    mockSessionHandler();
    mockPrismaVisit(buildVisit({
      arrivalPaxCipher: passportCipher,
      arrivalPaxSource: "NETJETS",
      crewCipher,
    }));
    const res = await callGet("date=2025-06-12&include=people");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.flights[0].id).toBe("v-1");
    expect(body.people["v-1"].passengers[0].passportNumber).toBe("AB123456");
  });

  it("sets paxSource from the first passenger encountered on a movement", async () => {
    // Mixed-source visits do happen (manual add on top of NETJETS import);
    // the hero pill should reflect the dominant provenance — using the
    // first record is the cheap-but-stable signal we settled on.
    const passportCipher = await encryptVal("AB123456");
    const crewCipher = await encryptVal("CC999777");
    mockSessionHandler();
    mockPrismaVisit(buildVisit({
      arrivalPaxCipher: passportCipher,
      arrivalPaxSource: "NETJETS",
      crewCipher,
    }));
    const res = await callGet("date=2025-06-12&include=people");
    const body = await res.json();
    expect(body.people["v-1"].paxSource).toBe("NETJETS");
  });

  it("uses a composite movementId__crewMemberId as the crew row id", async () => {
    // Crew members can recur across movements; the row id needs to be
    // unique per (movement, crew) pair to keep React's reconciliation sane
    // when the same captain appears on ARR and DEP of two consecutive visits.
    const passportCipher = await encryptVal("AB123456");
    const crewCipher = await encryptVal("CC999777");
    mockSessionHandler();
    mockPrismaVisit(buildVisit({
      arrivalPaxCipher: passportCipher,
      arrivalPaxSource: "NETJETS",
      crewCipher,
    }));
    const res = await callGet("date=2025-06-12&include=people");
    const body = await res.json();
    expect(body.people["v-1"].crew[0].id).toBe("m-arr-1__c-1");
    expect(body.people["v-1"].crew[0].passportNumber).toBe("CC999777");
  });

  it("does not include people in the response when the include flag is absent", async () => {
    // The old call sites (timeline page, dia, exports) call /api/flights
    // without include=people; the payload should stay narrow and the
    // people side-channel should be entirely absent.
    const passportCipher = await encryptVal("AB123456");
    const crewCipher = await encryptVal("CC999777");
    mockSessionHandler();
    mockPrismaVisit(buildVisit({
      arrivalPaxCipher: passportCipher,
      arrivalPaxSource: "NETJETS",
      crewCipher,
    }));
    const res = await callGet("date=2025-06-12");
    const body = await res.json();
    expect(body.people).toBeUndefined();
    expect(body.flights[0].id).toBe("v-1");
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.doMock("next-auth", () => ({
      getServerSession: vi.fn(async () => null),
    }));
    mockPrismaVisit(buildVisit({
      arrivalPaxCipher: "ignored",
      arrivalPaxSource: "NETJETS",
      crewCipher: "ignored",
    }));
    const res = await callGet("date=2025-06-12&include=people");
    expect(res.status).toBe(401);
  });
});
