// useLongPress — long-press detector basado en Pointer Events.
//
// Funciona con touch, ratón y pen sin dependencias extra. Devuelve un set
// de handlers para esparcir sobre cualquier elemento que reciba pointer
// events, y una bandera `isPressing` para que el consumidor renderice
// feedback visual (escala, anillo, progreso) mientras la pulsación está
// en vuelo.
//
//   const { handlers, isPressing } = useLongPress({
//     onLongPress: () => cancel(),
//     onClick:     () => cycle(),
//     threshold:   600,
//   });
//
// El hook distingue tap corto de pulsación larga:
//   - pointerdown          → arranca timer (threshold ms)
//   - timer dispara        → onLongPress() y marca `triggered`
//   - pointermove > tol    → aborta timer (el usuario scrolleó/arrastró)
//   - pointerup sin trigger→ onClick() (si no se excedió la tolerancia)
//   - pointerleave/cancel  → aborta timer sin click

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  threshold?: number;      // ms, default 600
  moveTolerance?: number;  // px, default 8
}

export interface LongPressHandlers {
  onPointerDown:   (e: React.PointerEvent) => void;
  onPointerUp:     (e: React.PointerEvent) => void;
  onPointerLeave:  (e: React.PointerEvent) => void;
  onPointerMove:   (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface UseLongPressResult {
  handlers: LongPressHandlers;
  isPressing: boolean;
}

export function useLongPress(opts: UseLongPressOptions): UseLongPressResult {
  const { onLongPress, onClick, threshold = 600, moveTolerance = 8 } = opts;

  // Mantenemos las callbacks en refs para evitar recrear handlers en cada
  // render del consumidor (las cierran sobre la última versión).
  const onLongPressRef = useRef(onLongPress);
  const onClickRef = useRef(onClick);
  useEffect(() => { onLongPressRef.current = onLongPress; }, [onLongPress]);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const movedRef = useRef(false);
  const [isPressing, setIsPressing] = useState(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clear();
    startRef.current = null;
    triggeredRef.current = false;
    movedRef.current = false;
    setIsPressing(false);
  }, [clear]);

  // Limpia el timer si el componente se desmonta a mitad de pulsación.
  useEffect(() => () => clear(), [clear]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Sólo botón primario para mouse; touch/pen no exponen `button` útil.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    triggeredRef.current = false;
    movedRef.current = false;
    setIsPressing(true);
    clear();
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      timerRef.current = null;
      onLongPressRef.current();
      setIsPressing(false);
    }, threshold);
  }, [clear, threshold]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > moveTolerance) {
      movedRef.current = true;
      reset();
    }
  }, [moveTolerance, reset]);

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    const wasTriggered = triggeredRef.current;
    const wasMoved = movedRef.current;
    const wasPressing = startRef.current !== null;
    reset();
    if (wasPressing && !wasTriggered && !wasMoved) {
      onClickRef.current?.();
    }
  }, [reset]);

  const onPointerLeave = useCallback((_e: React.PointerEvent) => {
    if (startRef.current !== null) reset();
  }, [reset]);

  const onPointerCancel = useCallback((_e: React.PointerEvent) => {
    if (startRef.current !== null) reset();
  }, [reset]);

  return {
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerMove,
      onPointerCancel,
    },
    isPressing,
  };
}
