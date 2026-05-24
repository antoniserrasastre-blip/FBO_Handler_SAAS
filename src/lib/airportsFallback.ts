// Server-side airport resolver.
//
// This module imports the large OurAirports fallback dataset
// (`airports.fallback.json`, ~19k entries) and therefore MUST stay
// server-side. It is only imported by `src/lib/flightView.ts` (which runs
// only in API routes). Do NOT import it from client components, or the big
// dataset will be bundled into the browser.

import rawFallback from "./airports.fallback.json";
import { getAirportInfo, type AirportInfo } from "./airports";

// Cast to keep TS from inferring a giant literal type for the JSON. The JSON
// arrays widen to `string[]`, so we go through `unknown` to assert the tuple
// shape we generated in scripts/buildAirports.ts (`[city, name]`).
const FALLBACK = rawFallback as unknown as Record<string, [string, string]>;

/**
 * Resolve an ICAO code to city/name, preferring the curated catalog (which
 * has Spanish names) and falling back to the large OurAirports dataset.
 */
export function resolveAirport(icao: string | null | undefined): AirportInfo | null {
  // Curated catalog wins so its Spanish names always take precedence.
  const curated = getAirportInfo(icao);
  if (curated) return curated;

  if (!icao) return null;
  const key = icao.trim().toUpperCase();
  if (!key) return null;

  const entry = FALLBACK[key];
  if (!entry) return null;

  const [city, name] = entry;
  // City falls back to name when the municipality is empty.
  return { city: city || name, name };
}
