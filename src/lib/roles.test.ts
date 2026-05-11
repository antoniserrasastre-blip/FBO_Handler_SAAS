import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockSession, resetSessionMock } from "../test/mock-session";

describe("requireAdmin / requireSupervisor / requireWriter", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    resetSessionMock();
  });

  it("requireAdmin returns 403 for SUPERVISOR", async () => {
    mockSession("SUPERVISOR");
    const { requireAdmin } = await import("./roles");
    const { error } = await requireAdmin();
    expect(error?.status).toBe(403);
  });

  it("requireAdmin succeeds for ADMIN", async () => {
    mockSession("ADMIN");
    const { requireAdmin } = await import("./roles");
    const { error, session } = await requireAdmin();
    expect(error).toBeUndefined();
    expect(session?.user.role).toBe("ADMIN");
  });

  it("requireSupervisor returns 403 for HANDLER", async () => {
    mockSession("HANDLER");
    const { requireSupervisor } = await import("./roles");
    const { error } = await requireSupervisor();
    expect(error?.status).toBe(403);
  });

  it("requireWriter returns 403 for VIEWER", async () => {
    mockSession("VIEWER");
    const { requireWriter } = await import("./roles");
    const { error } = await requireWriter();
    expect(error?.status).toBe(403);
  });

  it("requireWriter succeeds for HANDLER", async () => {
    mockSession("HANDLER");
    const { requireWriter } = await import("./roles");
    const { error } = await requireWriter();
    expect(error).toBeUndefined();
  });

  it("all helpers return 401 for unauthenticated", async () => {
    mockSession(null);
    const { requireAdmin, requireSupervisor, requireWriter } = await import("./roles");
    expect((await requireAdmin()).error?.status).toBe(401);
    expect((await requireSupervisor()).error?.status).toBe(401);
    expect((await requireWriter()).error?.status).toBe(401);
  });
});
