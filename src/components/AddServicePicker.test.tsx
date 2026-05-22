// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/rtl";
import { AddServicePicker } from "./AddServicePicker";

// El hook hace un GET inicial vía fetch. Mockeamos siempre el fetch para
// devolver una lista vacía de presets por defecto. Cada test puede sobreescribir.
function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(window, "fetch").mockImplementation(impl as typeof window.fetch);
}

function emptyPresetsFetch(): typeof window.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/service-presets")) {
      return new Response(JSON.stringify({ presets: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200 });
  }) as typeof window.fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("AddServicePicker — built-in chips", () => {
  beforeEach(() => {
    mockFetch(emptyPresetsFetch() as Parameters<typeof mockFetch>[0]);
  });

  it("clicking a built-in chip calls onAddService with (flightId, type)", async () => {
    const onAddService = vi.fn();
    render(<AddServicePicker flightId="v-1" onAddService={onAddService} />);
    // Esperamos a que termine el fetch inicial — la lista built-in se renderiza
    // de inmediato porque no depende de presets.
    const cateringBtn = await screen.findByRole("button", { name: /^catering$/i });
    await userEvent.click(cateringBtn);
    expect(onAddService).toHaveBeenCalledWith("v-1", "CATERING");
  });

  it("clicking + Custom switches into custom mode with an input", async () => {
    render(<AddServicePicker flightId="v-1" onAddService={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /custom/i }));
    expect(screen.getByPlaceholderText(/nombre del servicio/i)).toBeTruthy();
  });
});

describe("AddServicePicker — custom flow", () => {
  it("'Solo este vuelo' calls onAddService with CUSTOM + name and does NOT POST", async () => {
    const fetchSpy = mockFetch(emptyPresetsFetch() as Parameters<typeof mockFetch>[0]);
    const onAddService = vi.fn();
    const onClose = vi.fn();
    render(<AddServicePicker flightId="v-1" onAddService={onAddService} onClose={onClose} />);

    await userEvent.click(await screen.findByRole("button", { name: /custom/i }));
    const input = screen.getByPlaceholderText(/nombre del servicio/i);
    await userEvent.type(input, "Champán especial");
    await userEvent.click(screen.getByRole("button", { name: /^solo este vuelo$/i }));

    expect(onAddService).toHaveBeenCalledWith("v-1", "CUSTOM", "Champán especial");
    // Solo el GET inicial — ningún POST.
    const postCalls = fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it("'Guardar como permanente' POSTs the preset and then calls onAddService", async () => {
    let postBody: unknown = null;
    const fetchSpy = mockFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/service-presets") && init?.method === "POST") {
        postBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ id: "p1", name: "Cubitos extra", defaultTarget: null, createdAt: new Date().toISOString() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/api/service-presets")) {
        return new Response(JSON.stringify({ presets: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    }) as Parameters<typeof mockFetch>[0]);

    const onAddService = vi.fn();
    render(<AddServicePicker flightId="v-1" onAddService={onAddService} />);

    await userEvent.click(await screen.findByRole("button", { name: /custom/i }));
    await userEvent.type(screen.getByPlaceholderText(/nombre del servicio/i), "Cubitos extra");
    await userEvent.click(screen.getByRole("button", { name: /guardar como permanente/i }));

    expect(postBody).toEqual({ name: "Cubitos extra", defaultTarget: null });
    expect(onAddService).toHaveBeenCalledWith("v-1", "CUSTOM", "Cubitos extra");
    // Confirmamos que sí hubo POST.
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });
});
