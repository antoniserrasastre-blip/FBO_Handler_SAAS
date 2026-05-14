"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { palmaDayUtc } from "@/lib/time";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Single source of truth for the operations date.
 * Reads `?d=YYYY-MM-DD` from the URL, falls back to today (Palma).
 * Writing replaces the URL — same tab, same session, no scroll jump.
 */
export function useDate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params?.get("d") ?? null;
  const date = useMemo(() => {
    if (raw && YMD_RE.test(raw)) return palmaDayUtc(raw);
    return palmaDayUtc();
  }, [raw]);

  const isToday = useMemo(() => date.getTime() === palmaDayUtc().getTime(), [date]);

  const setDate = useCallback(
    (next: Date) => {
      const nextRaw = toYMD(palmaDayUtc(next));
      const todayRaw = toYMD(palmaDayUtc());
      const sp = new URLSearchParams(params?.toString() ?? "");
      if (nextRaw === todayRaw) sp.delete("d");
      else sp.set("d", nextRaw);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  const shift = useCallback(
    (offsetDays: number) => {
      const d = new Date(date);
      d.setUTCDate(d.getUTCDate() + offsetDays);
      setDate(d);
    },
    [date, setDate],
  );

  const goToday = useCallback(() => setDate(palmaDayUtc()), [setDate]);

  return { date, isToday, setDate, shift, goToday };
}
