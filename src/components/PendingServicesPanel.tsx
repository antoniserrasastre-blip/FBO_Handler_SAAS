"use client";

import { useState } from "react";
import { Flight, Service, LostItem, EventLog } from "@/types/compat";
import { getRequiredAuthorities } from "@/lib/countries";
import { isServiceOverdue } from "@/lib/overdue";
import { isFarFromGA } from "@/lib/parkingStands";
import { ChevronDown, ChevronUp } from "./Icons";
import { AlertTriangle } from "lucide-react";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

interface PendingServicesPanelProps {
  flights: FlightWithRelations[];
  onQuickFilter: (query: string) => void;
}

export function PendingServicesPanel({ flights, onQuickFilter }: PendingServicesPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  const activeFuelo = flights.filter((f) => f.state !== "DISPATCHED");

  const counts = {
    fuelPending: activeFuelo.filter((f) => f.fuelState !== "SERVED" && f.fuelState !== "NOT_REQUESTED").length,
    fuelNotRequested: activeFuelo.filter((f) => f.fuelState === "NOT_REQUESTED" && f.state === "ON_GROUND").length,
    cateringPending: activeFuelo.filter((f) => (f.services || []).some((s) => s.type === "CATERING" && s.state !== "DELIVERED")).length,
    toiletPending: activeFuelo.filter((f) => f.toiletState === "REQUESTED").length,
    transportPending: activeFuelo.filter((f) => f.paxArrTransportState === "PENDING" && f.paxArrTransportType !== "UNDEFINED" || f.paxDepTransportState === "PENDING" && f.paxDepTransportType !== "UNDEFINED").length,
    policia: flights.filter((f) => f.state !== "DISPATCHED" && getRequiredAuthorities(f.origin).policia).length,
    guardaCivil: flights.filter((f) => f.state !== "DISPATCHED" && getRequiredAuthorities(f.origin).guardaCivil).length,
    overdue: flights.reduce((count, f) => count + (f.services || []).filter((s) => isServiceOverdue(s)).length, 0),
    extrasPending: activeFuelo.filter((f) => (f.services || []).some((s) => s.state === "PENDING")).length,
    farFromGA: activeFuelo.filter((f) => isFarFromGA(f.parking)).length,
  };

  const totalIssues = counts.fuelPending + counts.cateringPending + counts.toiletPending + counts.overdue;

  if (flights.length === 0) return null;

  type Tone = "default" | "warning" | "danger";
  const items: { label: string; count: number; query: string; tone?: Tone }[] = [
    { label: "Fuel pedido", count: counts.fuelPending, query: "fuel" },
    { label: "Fuel no pedido (calzos)", count: counts.fuelNotRequested, query: "calzos" },
    { label: "Catering pendiente", count: counts.cateringPending, query: "catering" },
    { label: "Toilet pendiente", count: counts.toiletPending, query: "toilet" },
    { label: "Transporte pendiente", count: counts.transportPending, query: "transporte" },
    { label: "Extras pendientes", count: counts.extrasPending, query: "pendiente" },
    { label: "Policía necesaria", count: counts.policia, query: "policia" },
    { label: "Guardia Civil", count: counts.guardaCivil, query: "civil" },
    { label: "Lejos del FBO", count: counts.farFromGA, query: "lejos", tone: "warning" as Tone },
    { label: "Servicios retrasados", count: counts.overdue, query: "extras", tone: "danger" as Tone },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  const toneLabel: Record<Tone, string> = {
    default: "text-ink-2",
    warning: "text-warning-strong",
    danger: "text-danger-strong",
  };
  const toneBadge: Record<Tone, string> = {
    default: "bg-bg-muted text-ink-2",
    warning: "bg-warning-bg text-warning-strong",
    danger: "bg-danger-bg text-danger-strong",
  };

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 rounded-hx-md border border-line-subtle bg-bg-subtle px-3 py-2 text-left hover:bg-bg-muted"
      >
        {counts.overdue > 0 ? (
          <AlertTriangle size={14} className="shrink-0 text-danger-strong" />
        ) : null}
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-2">
          {totalIssues > 0 ? `${totalIssues} pendiente${totalIssues !== 1 ? "s" : ""}` : "Todo al día"}
        </span>
        <div className="flex flex-1 flex-wrap gap-1">
          {!collapsed
            ? null
            : items.slice(0, 4).map((item) => (
                <span
                  key={item.label}
                  className={`rounded-hx-pill bg-bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    toneLabel[item.tone ?? "default"]
                  }`}
                >
                  {item.label}: {item.count}
                </span>
              ))}
          {collapsed && items.length > 4 ? (
            <span className="font-mono text-[10px] text-ink-muted">+{items.length - 4} más</span>
          ) : null}
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="shrink-0 text-ink-muted" />
        ) : (
          <ChevronUp size={14} className="shrink-0 text-ink-muted" />
        )}
      </button>

      {!collapsed ? (
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-hx-md border border-line-subtle bg-bg p-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const tone = item.tone ?? "default";
            return (
              <button
                key={item.label}
                onClick={() => onQuickFilter(item.query)}
                className="flex items-center justify-between rounded-hx-sm px-3 py-1.5 text-left text-xs hover:bg-bg-subtle"
              >
                <span className={toneLabel[tone]}>{item.label}</span>
                <span
                  className={`rounded-hx-pill px-1.5 py-0.5 font-mono text-[10px] font-semibold ${toneBadge[tone]}`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
