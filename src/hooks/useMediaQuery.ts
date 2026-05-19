"use client";

import { useEffect, useState } from "react";

/** Suscribe a un media query y devuelve si el viewport lo cumple ahora. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent | { matches: boolean }) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
  }, [query]);

  return matches;
}

/** Atajo: viewport ≤ 640px (Tailwind `sm` y debajo). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 640px)");
}
