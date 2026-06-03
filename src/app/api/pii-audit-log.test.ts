/**
 * PII-in-EventLog compliance tests (Phase 5 / A3).
 *
 * Asserts that EventLog.action and related fields never contain a passenger's
 * or crew member's fullName, passportNumber, or dateOfBirth in plaintext.
 * Instead they must reference only the entity id (Passenger.id / CrewMember.id
 * / composite crew key) and the changed field name — never its value.
 *
 * Pattern mirrors src/app/api/flights/route.test.ts: vi.doMock so each test
 * gets a fresh module instance, letting us inspect prisma.eventLog.create args.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ------------------------------------------------------------------
// Encryption key must be set before any crypto import resolves
// ------------------------------------------------------------------
beforeAll(() => {
  process.env.PASSPORT_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString("base64");
});

// ------------------------------------------------------------------
// Shared mock helpers
// ------------------------------------------------------------------

/** Build a minimal Prisma mock that records eventLog.create calls. */
function makeEventLogSpy() {
  return vi.fn(async () => ({ id: "el-1" }));
}

function mockWriter() {
  vi.doMock("@/lib/roles", () => ({
    requireWriter: vi.fn(async () => ({ session: null, error: null })),
    requireSupervisor: vi.fn(async () => ({ session: null, error: null })),
    requireAdmin: vi.fn(async () => ({ session: null, error: null })),
  }));
  vi.doMock("next-auth", () => ({
    getServerSession: vi.fn(async () => ({
      user: { id: "u1", email: "u@test", name: "Tester", role: "HANDLER" },
    })),
  }));
}

// ------------------------------------------------------------------
// Helper: pull out the first call to prisma.eventLog.create
// ------------------------------------------------------------------
function captureEventLogCreate(prismaMock: ReturnType<typeof vi.fn>) {
  const calls = prismaMock.mock.calls;
  if (!calls.length) return null;
  // prisma.eventLog.create({ data: { ... } })
  return (calls[0][0] as { data: Record<string, string> }).data;
}

// ===================================================================
// 1. POST /api/flights/[id]/passengers — add passenger
// ===================================================================
describe("POST /api/flights/[id]/passengers — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findUnique: vi.fn(async () => null), // not used in the movement-resolve path we test
        },
        movement: {
          findUnique: vi.fn(async () => ({ id: "m-dep-1" })),
        },
        passenger: {
          create: vi.fn(async () => ({
            id: "pax-42",
            movementId: "m-dep-1",
            givenNames: "Juan",
            surname: "Garcia",
            passportEncrypted: null,
            passportType: null,
            passportCountry: "ES",
            passportExpiry: null,
            dobEncrypted: null,
            gender: "M",
            nationality: "ES",
            status: "CONFIRMED",
            verified: false,
            source: "MANUAL",
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName to EventLog.action when a passenger is added", async () => {
    const { POST } = await import("./flights/[id]/passengers/route");
    const req = new NextRequest("http://localhost/api/flights/v-1/passengers", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Juan Garcia",
        passportNumber: "ESP-001",
        dateOfBirth: "1990-01-01",
        nationality: "ES",
        gender: "M",
        direction: "DEPARTURE",
        status: "CONFIRMED",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(201);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    // Must NOT contain the real name
    expect(logData!.action).not.toContain("Juan Garcia");
    // Must NOT contain passport
    expect(logData!.action).not.toContain("ESP-001");
    // Must reference the entity id
    expect(logData!.action).toContain("pax-42");

    // eventBus.detail must also be clean
    const { eventBus } = await import("@/lib/events");
    const emitCalls = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls;
    if (emitCalls.length) {
      const emitted = emitCalls[0][0] as { detail?: string };
      if (emitted.detail) {
        expect(emitted.detail).not.toContain("Juan Garcia");
      }
    }
  });
});

// ===================================================================
// 2. PATCH /api/passengers/[id] — update passenger
// ===================================================================
describe("PATCH /api/passengers/[id] — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        passenger: {
          findUnique: vi.fn(async () => ({
            id: "pax-42",
            movementId: "m-dep-1",
            givenNames: "Juan",
            surname: "Garcia",
            passportEncrypted: "enc:ESP-001",
            passportHash: "hash:ESP-001",
            fullNameHash: "hash:Juan Garcia",
            dobEncrypted: "enc:1990-01-01",
            gender: "M",
            nationality: "ES",
            status: "CONFIRMED",
            verified: false,
            corrections: null,
            movement: { visitId: "v-1" },
          })),
          update: vi.fn(async () => ({
            id: "pax-42",
            givenNames: "Maria",
            surname: "Garcia",
            passportEncrypted: "enc:ESP-001",
            passportHash: "hash:ESP-001",
            fullNameHash: "hash:Maria Garcia",
            dobEncrypted: "enc:1990-01-01",
            gender: "F",
            nationality: "ES",
            status: "CONFIRMED",
            verified: false,
            corrections: null,
            movementId: "m-dep-1",
          })),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName value to EventLog.action when fullName is updated", async () => {
    const { PATCH } = await import("./passengers/[id]/route");
    const req = new NextRequest("http://localhost/api/passengers/pax-42", {
      method: "PATCH",
      body: JSON.stringify({ fullName: "Maria Garcia" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "pax-42" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    // action must NOT contain the actual name in plaintext
    expect(logData!.action).not.toContain("Maria Garcia");
    expect(logData!.action).not.toContain("Juan Garcia");
    // action must reference the passenger id and what changed
    expect(logData!.action).toContain("pax-42");
    expect(logData!.action).toContain("fullName");
  });

  it("does NOT write passport value to EventLog when passport is updated", async () => {
    const { PATCH } = await import("./passengers/[id]/route");
    const req = new NextRequest("http://localhost/api/passengers/pax-42", {
      method: "PATCH",
      body: JSON.stringify({ passportNumber: "ESP-999" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "pax-42" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();
    expect(logData!.action).not.toContain("ESP-999");
    expect(logData!.action).not.toContain("ESP-001");
    expect(logData!.action).toContain("pax-42");
  });

  it("does NOT write gender/nationality value to EventLog when they change", async () => {
    const { PATCH } = await import("./passengers/[id]/route");
    const req = new NextRequest("http://localhost/api/passengers/pax-42", {
      method: "PATCH",
      body: JSON.stringify({ gender: "F", nationality: "FR" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "pax-42" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();
    // must log the field name, never the value
    expect(logData!.action).not.toContain("gender: F");
    expect(logData!.action).not.toContain("nationality: FR");
    expect(logData!.action).toContain("gender");
    expect(logData!.action).toContain("nationality");
    expect(logData!.action).toContain("pax-42");
  });
});

// ===================================================================
// 3. DELETE /api/passengers/[id] — delete passenger
// ===================================================================
describe("DELETE /api/passengers/[id] — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        passenger: {
          findUnique: vi.fn(async () => ({
            id: "pax-42",
            movementId: "m-dep-1",
            givenNames: "Juan",
            surname: "Garcia",
            passportEncrypted: null,
            dobEncrypted: null,
            movement: { visitId: "v-1" },
          })),
          delete: vi.fn(async () => ({})),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName to EventLog.action when a passenger is deleted", async () => {
    const { DELETE } = await import("./passengers/[id]/route");
    const req = new NextRequest("http://localhost/api/passengers/pax-42", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "pax-42" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    expect(logData!.action).not.toContain("Juan Garcia");
    expect(logData!.action).toContain("pax-42");

    // eventBus detail must also be clean
    const { eventBus } = await import("@/lib/events");
    const emitCalls = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls;
    if (emitCalls.length) {
      const emitted = emitCalls[0][0] as { detail?: string };
      if (emitted.detail) {
        expect(emitted.detail).not.toContain("Juan Garcia");
      }
    }
  });
});

// ===================================================================
// 4. POST /api/flights/[id]/crew — add crew member
// ===================================================================
describe("POST /api/flights/[id]/crew — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        visit: {
          findUnique: vi.fn(async () => ({
            id: "v-1",
            operatorId: "op-1",
            movements: [{ id: "m-dep-1", direction: "DEPARTURE", callsign: "NJE001" }],
            operator: { id: "op-1" },
            aircraft: { registration: "CS-DXX" },
          })),
          update: vi.fn(async () => ({})),
        },
        crewMember: {
          findUnique: vi.fn(async () => null),
          create: vi.fn(async () => ({
            id: "cm-99",
            operatorId: "op-1",
            fullName: "Capitan Torres",
            nationality: "ES",
            passportEncrypted: "enc:ESP-PAX-001",
            passportHash: "hash:ESP-PAX-001",
            dobEncrypted: "enc:1980-05-15",
            role: "CAPTAIN",
          })),
        },
        crewAssignment: {
          upsert: vi.fn(async () => ({
            movementId: "m-dep-1",
            crewMemberId: "cm-99",
            roleOnFlight: "CAPTAIN",
            createdAt: new Date(),
          })),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));

    vi.doMock("@/lib/v2/upsert", () => ({
      upsertOperator: vi.fn(async () => ({ id: "op-1" })),
    }));

    vi.doMock("@/lib/operators", () => ({
      findOperator: vi.fn(() => null),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("@/lib/v2/upsert");
    vi.doUnmock("@/lib/operators");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName to EventLog.action when a crew member is added", async () => {
    const { POST } = await import("./flights/[id]/crew/route");
    const req = new NextRequest("http://localhost/api/flights/v-1/crew", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Capitan Torres",
        passportNumber: "ESP-PAX-001",
        dateOfBirth: "1980-05-15",
        nationality: "ES",
        role: "CAPTAIN",
        direction: "DEPARTURE",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(201);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    expect(logData!.action).not.toContain("Capitan Torres");
    expect(logData!.action).not.toContain("ESP-PAX-001");
    // Must reference the crew member id
    expect(logData!.action).toContain("cm-99");

    // eventBus detail must also be clean
    const { eventBus } = await import("@/lib/events");
    const emitCalls = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls;
    if (emitCalls.length) {
      const emitted = emitCalls[0][0] as { detail?: string };
      if (emitted.detail) {
        expect(emitted.detail).not.toContain("Capitan Torres");
      }
    }
  });
});

// ===================================================================
// 5. PATCH /api/crew/[id] — update crew member
// ===================================================================
describe("PATCH /api/crew/[id] — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        crewAssignment: {
          findUnique: vi.fn(async () => ({
            movementId: "m-dep-1",
            crewMemberId: "cm-99",
            roleOnFlight: "CAPTAIN",
            crewMember: {
              id: "cm-99",
              fullName: "Capitan Torres",
              nationality: "ES",
              passportEncrypted: "enc:ESP-PAX-001",
              passportHash: "hash:ESP-PAX-001",
              dobEncrypted: "enc:1980-05-15",
            },
            movement: { visitId: "v-1" },
          })),
          update: vi.fn(async () => ({})),
        },
        crewMember: {
          update: vi.fn(async () => ({})),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName value to EventLog.action when crew fullName is updated", async () => {
    const { PATCH } = await import("./crew/[id]/route");
    const req = new NextRequest("http://localhost/api/crew/m-dep-1__cm-99", {
      method: "PATCH",
      body: JSON.stringify({ fullName: "Nuevo Capitan" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "m-dep-1__cm-99" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    expect(logData!.action).not.toContain("Nuevo Capitan");
    expect(logData!.action).not.toContain("Capitan Torres");
    // Must reference crew member id and field name
    expect(logData!.action).toContain("cm-99");
    expect(logData!.action).toContain("fullName");
  });

  it("does NOT write passport value to EventLog when crew passport is updated", async () => {
    const { PATCH } = await import("./crew/[id]/route");
    const req = new NextRequest("http://localhost/api/crew/m-dep-1__cm-99", {
      method: "PATCH",
      body: JSON.stringify({ passportNumber: "NEW-PASSPORT-999" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "m-dep-1__cm-99" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();
    expect(logData!.action).not.toContain("NEW-PASSPORT-999");
    expect(logData!.action).not.toContain("ESP-PAX-001");
    expect(logData!.action).toContain("cm-99");
  });

  it("does NOT write nationality value to EventLog when crew nationality changes", async () => {
    const { PATCH } = await import("./crew/[id]/route");
    const req = new NextRequest("http://localhost/api/crew/m-dep-1__cm-99", {
      method: "PATCH",
      body: JSON.stringify({ nationality: "FR" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "m-dep-1__cm-99" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();
    expect(logData!.action).not.toContain("nationality: FR");
    expect(logData!.action).toContain("nationality");
    expect(logData!.action).toContain("cm-99");
  });
});

// ===================================================================
// 6. DELETE /api/crew/[id] — remove crew member
// ===================================================================
describe("DELETE /api/crew/[id] — EventLog PII compliance", () => {
  let eventLogCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    eventLogCreate = makeEventLogSpy();

    mockWriter();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        crewAssignment: {
          findUnique: vi.fn(async () => ({
            movementId: "m-dep-1",
            crewMemberId: "cm-99",
            roleOnFlight: "CAPTAIN",
            crewMember: {
              id: "cm-99",
              fullName: "Capitan Torres",
              nationality: "ES",
              passportEncrypted: null,
              dobEncrypted: null,
            },
            movement: { visitId: "v-1" },
          })),
          delete: vi.fn(async () => ({})),
        },
        eventLog: { create: eventLogCreate },
      },
    }));

    vi.doMock("@/lib/crypto", () => ({
      encrypt: vi.fn((v: string) => `enc:${v}`),
      decrypt: vi.fn((v: string) => v.replace("enc:", "")),
      tryDecrypt: vi.fn((v: string | null | undefined) => (v == null ? null : String(v).replace("enc:", ""))),
      hashPII: vi.fn((v: string) => `hash:${v}`),
    }));

    vi.doMock("@/lib/events", () => ({
      eventBus: { emit: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/roles");
    vi.doUnmock("@/lib/crypto");
    vi.doUnmock("@/lib/events");
    vi.doUnmock("next-auth");
  });

  it("does NOT write fullName to EventLog.action when a crew member is deleted", async () => {
    const { DELETE } = await import("./crew/[id]/route");
    const req = new NextRequest("http://localhost/api/crew/m-dep-1__cm-99", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "m-dep-1__cm-99" }) });
    expect(res.status).toBe(200);

    const logData = captureEventLogCreate(eventLogCreate);
    expect(logData).not.toBeNull();

    expect(logData!.action).not.toContain("Capitan Torres");
    expect(logData!.action).toContain("cm-99");

    // eventBus detail must also be clean
    const { eventBus } = await import("@/lib/events");
    const emitCalls = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls;
    if (emitCalls.length) {
      const emitted = emitCalls[0][0] as { detail?: string };
      if (emitted.detail) {
        expect(emitted.detail).not.toContain("Capitan Torres");
      }
    }
  });
});
