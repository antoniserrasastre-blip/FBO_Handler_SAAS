"use client";

import { useCallback, useEffect } from "react";
import { Flight, Service, LostItem, EventLog } from "@/types/compat";
import { findOperator } from "@/lib/operators";
import { getRequiredAuthorities } from "@/lib/countries";
import { isFarFromGA } from "@/lib/parkingStands";
import { FLIGHT_STATE_CONFIG, FlightState } from "@/types";
import { CloseIcon } from "./Icons";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

// Quick filter chips — one-click access to common searches
const QUICK_FILTERS = [
  { label: "Fuel pendiente", query: "fuel" },
  { label: "Calzos", query: "calzos" },
  { label: "Catering", query: "catering" },
  { label: "Policia", query: "policia" },
  { label: "Pernocta", query: "pernocta" },
  { label: "Lejos del FBO", query: "lejos" },
  { label: "NetJets", query: "netjets" },
  { label: "VistaJet", query: "vistajet" },
] as const;

// Search with boolean operators:
// - Space = AND (default): "fuel netjets" = fuel AND netjets
// - "or" keyword = OR: "catering or prensa"
// - "!" prefix or "not" keyword = NOT: "!dispatched" or "not dispatched"
// - Quoted strings: "catering aire" treated as single token
function flightMatchesQuery(flight: FlightWithRelations, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // Tokenize respecting quoted strings
  const tokens = tokenizeQuery(q);
  return evaluateTokens(flight, tokens);
}

function tokenizeQuery(q: string): string[] {
  const result: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = regex.exec(q)) !== null) {
    result.push(m[1] || m[2]);
  }
  return result;
}

// Evaluate tokens with OR and NOT support
function evaluateTokens(flight: FlightWithRelations, tokens: string[]): boolean {
  // Pre-process: merge "not X" into "!X", drop "and" keyword
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "and" || t === "y" || t === "&") continue;
    if ((t === "not" || t === "no") && i + 1 < tokens.length) {
      merged.push("!" + tokens[i + 1]);
      i++;
      continue;
    }
    merged.push(t);
  }

  // Split into OR groups
  const orGroups: string[][] = [[]];
  for (const tok of merged) {
    if (tok === "or" || tok === "o" || tok === "|") {
      orGroups.push([]);
    } else {
      orGroups[orGroups.length - 1].push(tok);
    }
  }

  // Any OR group must match (AND within each group)
  return orGroups.some((group) =>
    group.every((tok) => {
      let negate = false;
      let clean = tok;
      if (clean.startsWith("!") || clean.startsWith("-")) {
        negate = true;
        clean = clean.slice(1);
      }
      if (!clean) return true;
      const match = matchesSingleToken(flight, clean);
      return negate ? !match : match;
    })
  );
}

function matchesSingleToken(flight: FlightWithRelations, token: string): boolean {
  // --- Flight identifiers ---
  if (flight.callsign.toLowerCase().includes(token)) return true;
  if (flight.registration.toLowerCase().replace(/-/g, "").includes(token.replace(/-/g, ""))) return true;
  if (flight.aircraftType.toLowerCase().includes(token)) return true;
  if (flight.parking?.toLowerCase().includes(token)) return true;

  // --- Notes ---
  if (flight.notes?.toLowerCase().includes(token)) return true;

  // --- Flight state ---
  const stateConfig = FLIGHT_STATE_CONFIG[flight.state as FlightState];
  if (stateConfig?.label.toLowerCase().includes(token)) return true;
  if (token === "calzos" && flight.state === "ON_GROUND") return true;
  if (token === "esperado" && flight.state === "EXPECTED") return true;
  if (token === "embarque" && flight.state === "BOARDING") return true;
  if (token === "despachado" && flight.state === "DISPATCHED") return true;

  // --- Origins / destinations ---
  if (flight.origin?.toLowerCase().includes(token)) return true;
  if (flight.destination?.toLowerCase().includes(token)) return true;

  // --- Fuel ---
  if ((token === "fuel" || token === "combustible") && flight.fuelState !== "SERVED") return true;
  if (token === "fuel:servido" && flight.fuelState === "SERVED") return true;
  if (token === "fuel:pedido" && flight.fuelState === "REQUESTED") return true;

  // --- Toilet ---
  if (token === "toilet" && flight.toiletState !== "COMPLETED" && flight.toiletState !== "NOT_REQUESTED") return true;

  // --- Services ---
  if (token === "catering" && flight.services.some((s) => s.type === "CATERING" && s.state !== "DELIVERED" && s.state !== "CANCELLED")) return true;
  if (token === "prensa" && flight.services.some((s) => s.type === "NEWSPAPERS" && s.state !== "DELIVERED" && s.state !== "CANCELLED")) return true;
  if (token === "extras" && flight.services.some((s) => s.state !== "DELIVERED" && s.state !== "CANCELLED")) return true;
  if (token === "pendiente" && flight.services.some((s) => s.state === "PENDING")) return true;
  if (token === "cancelado" && flight.services.some((s) => s.state === "CANCELLED")) return true;

  // --- Operator ---
  const op = findOperator(flight.callsign);
  if (op) {
    if (op.name.toLowerCase().includes(token)) return true;
    if (op.icao.toLowerCase() === token) return true;
  }

  // --- Authorities ---
  const auth = getRequiredAuthorities(flight.origin);
  if ((token === "policia" || token === "policía") && auth.policia && flight.state !== "DISPATCHED") return true;
  if ((token === "civil" || token === "gcivil" || token === "guardia") && auth.guardaCivil && flight.state !== "DISPATCHED") return true;

  // --- Overnight ---
  if ((token === "pernocta" || token === "overnight") && flight.arrivalDate && flight.departureDate && flight.arrivalDate !== flight.departureDate) return true;

  // --- Far from GA apron ---
  if ((token === "lejos" || token === "remoto" || token === "remote") && isFarFromGA(flight.parking)) return true;

  // --- Lost items ---
  if ((token === "objetos" || token === "lost") && (flight.lostItems || []).some((li) => li.state !== "DELIVERED")) return true;

  // --- Transport ---
  if ((token === "transporte" || token === "transport") && (flight.paxArrTransportState === "PENDING" || flight.paxDepTransportState === "PENDING")) return true;

  return false;
}

interface SearchBarProps {
  flights: FlightWithRelations[];
  onFilteredFlights: (filtered: FlightWithRelations[]) => void;
  resultCount: number;
  totalCount: number;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
}

export function SearchBar({ flights, onFilteredFlights, resultCount, totalCount, inputRef, query, onQueryChange }: SearchBarProps) {
  const isMobile = useIsMobile();
  const handleQueryChange = useCallback((newQuery: string) => {
    onQueryChange(newQuery);
    if (!newQuery.trim()) {
      onFilteredFlights(flights);
    } else {
      onFilteredFlights(flights.filter((f) => flightMatchesQuery(f, newQuery)));
    }
  }, [flights, onFilteredFlights, onQueryChange]);

  // Recompute when flights or query change (query may change from external setQuery)
  useEffect(() => {
    if (!query.trim()) {
      onFilteredFlights(flights);
    } else {
      onFilteredFlights(flights.filter((f) => flightMatchesQuery(f, query)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, query]);

  const isFiltered = query.trim().length > 0;

  return (
    <div className={`mb-3 sm:mb-4 ${isMobile ? "sticky top-0 z-10 -mx-3 bg-bg px-3 pt-2 shadow-hx-sm" : ""}`}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder='Buscar: fuel netjets, !dispatched, "catering aire", or prensa…  (/)'
          className="w-full rounded-hx-md border border-line bg-bg py-2 pl-9 pr-20 text-sm text-ink-1 placeholder-ink-disabled shadow-hx-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint"
        />
        {isFiltered && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            <span className="font-mono text-xs text-ink-muted [font-variant-numeric:tabular-nums]">
              {resultCount}/{totalCount}
            </span>
            <button
              onClick={() => handleQueryChange("")}
              className="rounded-full p-0.5 text-ink-muted hover:bg-bg-muted hover:text-ink-2"
              title="Limpiar búsqueda"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Quick filter chips */}
      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK_FILTERS.map((chip) => {
          const active = query.toLowerCase().includes(chip.query);
          return (
            <button
              key={chip.query}
              onClick={() => {
                if (active) {
                  handleQueryChange(query.replace(new RegExp(`\\b${chip.query}\\b`, "gi"), "").trim());
                } else {
                  handleQueryChange(query ? `${query} ${chip.query}` : chip.query);
                }
              }}
              className={`rounded-hx-pill px-2.5 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-brand-tint text-brand-active ring-1 ring-brand"
                  : "bg-bg-muted text-ink-3 hover:bg-bg-sunken hover:text-ink-1"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { flightMatchesQuery };
