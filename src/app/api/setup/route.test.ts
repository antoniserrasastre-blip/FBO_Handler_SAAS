import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      upsert: vi.fn(async ({ create }: { create: { email: string; role: string } }) => ({
        email: create.email,
        role: create.role,
      })),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async (pw: string) => `hashed-${pw}`) },
}));

describe("GET /api/setup", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SETUP_SECRET = "expected-secret";
  });
  afterEach(() => {
    delete process.env.SETUP_SECRET;
    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_SUPERVISOR_PASSWORD;
    delete process.env.SEED_HANDLER_PASSWORD;
    delete process.env.SEED_VIEWER_PASSWORD;
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

  it("skips users whose SEED_*_PASSWORD env var is not set", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/setup", {
      headers: { "x-setup-secret": "expected-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.log.every((line: string) => line.startsWith("Skipping"))).toBe(true);
  });
});
