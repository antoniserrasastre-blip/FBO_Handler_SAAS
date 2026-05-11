import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

function mockLibsql(rowsByQuery: { rows: unknown[] } = { rows: [] }) {
  vi.doMock("@libsql/client", () => ({
    createClient: () => ({
      execute: vi.fn(async () => rowsByQuery),
    }),
  }));
}

describe("GET /api/setup", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TURSO_DATABASE_URL = "libsql://fake";
    process.env.TURSO_AUTH_TOKEN = "fake";
    process.env.SETUP_SECRET = "expected-secret";
    mockLibsql();
  });
  afterEach(() => {
    vi.doUnmock("@libsql/client");
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.SETUP_SECRET;
  });

  it("returns 401 without the setup secret header", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/setup");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong secret", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/setup", {
      headers: { "x-setup-secret": "wrong" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the correct secret", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/setup", {
      headers: { "x-setup-secret": "expected-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 if SETUP_SECRET is not configured (refuses to run)", async () => {
    delete process.env.SETUP_SECRET;
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/setup", {
      headers: { "x-setup-secret": "anything" },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
