"use client";

import { useState, useMemo, useCallback } from "react";
import { Flight, Service, LostItem, EventLog } from "@prisma/client";
import { findOperator } from "@/lib/operators";
import { getRequiredAuthorities } from "@/lib/countries";
import { FLIGHT_STATE_CONFIG, FlightState } from "@/types";
import { CloseIcon } from "./Icons";
import { Search } from "lucide-react";

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
  { label: "NetJets", query: "netjets" },
  { label: "VistaJet", query: "vistajet" },
] as const;

// Search tokens and what they match
function flightMatchesQuery(flight: FlightWithRelations, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // Split into tokens — ALL must match (AND logic)
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => matchesSingleToken(flight, token));
}

function matchesSingleToken(flight: FlightWithRelations, token: string): boolean {
  // --- Flight identifiers ---
  if (flight.callsign.toLowerCase().includes(token)) return true;
  if (flight.registration.toLowerCase().replace(/-/g, "").includes(token.replace(/-/g, ""))) return true;
  if (flight.aircraftType.toLowerCase().includes(token)) return true;
  if (flight.parking?.toLowerCase().includes(token)) return true;

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
  if (token === "catering" && flight.services.some((s) => s.type === "CATERING" && s.state !== "DELIVERED")) return true;
  if (token === "prensa" && flight.services.some((s) => s.type === "NEWSPAPERS" && s.state !== "DELIVERED")) return true;
  if (token === "extras" && flight.services.some((s) => s.state !== "DELIVERED")) return true;
  if (token === "pendiente" && flight.services.some((s) => s.state === "PENDING")) return true;

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
  const handleQueryChange = useCallback((newQuery: string) => {
    onQueryChange(newQuery);
    if (!newQuery.trim()) {
      onFilteredFlights(flights);
    } else {
      onFilteredFlights(flights.filter((f) => flightMatchesQuery(f, newQuery)));
    }
  }, [flights, onFilteredFlights, onQueryChange]);

  // Recompute when flights change but query stays
  useMemo(() => {
    if (!query.trim()) {
      onFilteredFlights(flights);
    } else {
      onFilteredFlights(flights.filter((f) => flightMatchesQuery(f, query)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights]);

  const isFiltered = query.trim().length > 0;

  return (
    <div className="mb-3 sm:mb-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Buscar: fuel, netjets, policia, calzos, matricula... ( / )"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-20 text-sm text-gray-700 placeholder-gray-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {isFiltered && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            <span className="text-xs text-gray-400">{resultCount}/{totalCount}</span>
            <button
              onClick={() => handleQueryChange("")}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Limpiar busqueda"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Quick filter chips */}
      <div className="mt-1.5 flex flex-wrap gap-1">
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
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
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
