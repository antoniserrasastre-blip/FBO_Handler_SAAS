"use client";
// Estado del turno fichado del usuario y de los turnos activos (cliente).

import { useCallback, useEffect, useState } from "react";
import type { ShiftPost } from "@/types";

export interface ShiftDTO {
  id: string;
  userId: string;
  userName: string;
  posts: ShiftPost[];
  startedAt: string; // ISO
}

export interface UseShift {
  myShift: ShiftDTO | null;
  activeShifts: ShiftDTO[];
  loading: boolean;
  clockIn: (posts: ShiftPost[]) => Promise<void>;
  setPosts: (posts: ShiftPost[]) => Promise<void>;
  clockOut: (handoverNotes?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

interface ShiftGetResponse {
  myShift: ShiftDTO | null;
  activeShifts: ShiftDTO[];
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    /* sin cuerpo JSON */
  }
  return `Error ${res.status}`;
}

export function useShift(): UseShift {
  const [myShift, setMyShift] = useState<ShiftDTO | null>(null);
  const [activeShifts, setActiveShifts] = useState<ShiftDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/shift", { method: "GET", cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data: ShiftGetResponse = await res.json();
      setMyShift(data.myShift ?? null);
      setActiveShifts(Array.isArray(data.activeShifts) ? data.activeShifts : []);
    } catch (err) {
      // No rompemos el estado; el componente decide cómo notificar.
      throw err;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
      } catch {
        /* silenciado en montaje; loading queda consistente */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const mutate = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", body: unknown) => {
      setLoading(true);
      try {
        const res = await fetch("/api/shift", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readError(res));
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const clockIn = useCallback(
    (posts: ShiftPost[]) => mutate("POST", { posts }),
    [mutate],
  );

  const setPosts = useCallback(
    (posts: ShiftPost[]) => mutate("PATCH", { posts }),
    [mutate],
  );

  const clockOut = useCallback(
    (handoverNotes?: string) => mutate("DELETE", { handoverNotes }),
    [mutate],
  );

  return { myShift, activeShifts, loading, clockIn, setPosts, clockOut, refresh };
}
