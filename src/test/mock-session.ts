import { vi } from "vitest";

type Role = "ADMIN" | "SUPERVISOR" | "HANDLER" | "VIEWER";

export function mockSession(role: Role | null) {
  const session =
    role === null
      ? null
      : { user: { id: "u1", email: "u@test", name: "Test", role } };
  vi.doMock("next-auth", () => ({
    getServerSession: vi.fn(async () => session),
  }));
}

export function resetSessionMock() {
  vi.doUnmock("next-auth");
  vi.resetModules();
}
