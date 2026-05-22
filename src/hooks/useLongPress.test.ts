// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { useLongPress } from "./useLongPress";

// Helper para fabricar un PointerEvent mínimo que el hook entiende.
// Solo se necesitan `clientX/Y`, `pointerType` y `button`.
function pe(opts: { x?: number; y?: number; type?: string; button?: number } = {}) {
  return {
    clientX: opts.x ?? 100,
    clientY: opts.y ?? 100,
    pointerType: opts.type ?? "touch",
    button: opts.button ?? 0,
  } as unknown as React.PointerEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLongPress", () => {
  it("fires onClick on a short tap (down → up before threshold)", () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onClick, onLongPress, threshold: 600 }));

    act(() => result.current.handlers.onPointerDown(pe()));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => result.current.handlers.onPointerUp(pe()));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("fires onLongPress when held past the threshold", () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onClick, onLongPress, threshold: 600 }));

    act(() => result.current.handlers.onPointerDown(pe()));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    // El pointerup posterior NO debe disparar onClick porque ya hubo trigger.
    act(() => result.current.handlers.onPointerUp(pe()));

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("aborts (no click, no long-press) when the pointer moves beyond tolerance", () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ onClick, onLongPress, threshold: 600, moveTolerance: 8 }),
    );

    act(() => result.current.handlers.onPointerDown(pe({ x: 100, y: 100 })));
    // Movimiento de 20px → supera tolerancia (8px) → debe cancelar.
    act(() => result.current.handlers.onPointerMove(pe({ x: 120, y: 100 })));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => result.current.handlers.onPointerUp(pe({ x: 120, y: 100 })));

    expect(onClick).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels on pointerleave without firing onClick", () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onClick, onLongPress, threshold: 600 }));

    act(() => result.current.handlers.onPointerDown(pe()));
    act(() => result.current.handlers.onPointerLeave(pe()));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onClick).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("exposes isPressing while pressed and clears it after up", () => {
    const { result } = renderHook(() => useLongPress({ onLongPress: () => {}, threshold: 600 }));

    expect(result.current.isPressing).toBe(false);
    act(() => result.current.handlers.onPointerDown(pe()));
    expect(result.current.isPressing).toBe(true);
    act(() => result.current.handlers.onPointerUp(pe()));
    expect(result.current.isPressing).toBe(false);
  });
});
