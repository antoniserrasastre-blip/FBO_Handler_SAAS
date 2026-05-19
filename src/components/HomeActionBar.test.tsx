// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@/test/rtl";
import { HomeActionBar } from "./HomeActionBar";

function installMatchMedia(isMobile: boolean) {
  const mql = {
    matches: isMobile,
    media: "(max-width: 640px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue(mql),
    configurable: true,
    writable: true,
  });
}

const baseProps = {
  hasFlights: true,
  overdueCount: 0,
  soundEnabled: false,
  date: new Date("2025-06-12T10:00:00Z"),
  onPrint: vi.fn(),
  onHandover: vi.fn(),
  onToggleSound: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
  onNewFlight: vi.fn(),
};

afterEach(() => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("HomeActionBar", () => {
  it("desktop: shows Imprimir, Traspaso, Sonido, Exportar, Importar, Nuevo vuelo", () => {
    installMatchMedia(false);
    render(<HomeActionBar {...baseProps} />);
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /traspaso/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /importar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /\+ nuevo vuelo/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^más$/i })).toBeNull();
  });

  it("mobile: only Nuevo vuelo + Más are visible; secondaries are behind the menu", () => {
    installMatchMedia(true);
    render(<HomeActionBar {...baseProps} />);
    expect(screen.getByRole("button", { name: /\+ nuevo vuelo/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^más$/i })).toBeTruthy();
    // Secondary actions not in the direct DOM until menu is opened
    expect(screen.queryByRole("button", { name: /imprimir/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /traspaso/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /importar/i })).toBeNull();
  });

  it("mobile: opening Más reveals the secondary actions", async () => {
    installMatchMedia(true);
    const { userEvent } = await import("@/test/rtl");
    const user = userEvent.setup();
    render(<HomeActionBar {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /^más$/i }));
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /traspaso/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /importar/i })).toBeTruthy();
  });

  it("renders Nuevo vuelo even when there are no flights yet", () => {
    installMatchMedia(false);
    render(<HomeActionBar {...baseProps} hasFlights={false} />);
    expect(screen.getByRole("button", { name: /\+ nuevo vuelo/i })).toBeTruthy();
    // Imprimir/Traspaso/Exportar require flights to make sense
    expect(screen.queryByRole("button", { name: /imprimir/i })).toBeNull();
  });
});
