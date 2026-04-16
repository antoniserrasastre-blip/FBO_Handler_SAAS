"use client";

import { useState } from "react";
import { Flight, Service, LostItem, EventLog } from "@prisma/client";
import { getRequiredAuthorities } from "@/lib/countries";
import { isServiceOverdue } from "@/lib/overdue";
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
    cateringPending: activeFuelo.filter((f) => f.services.some((s) => s.type === "CATERING" && s.state !== "DELIVERED")).length,
    toiletPending: activeFuelo.filter((f) => f.toiletState === "REQUESTED").length,
    transportPending: activeFuelo.filter((f) => f.paxArrTransportState === "PENDING" && f.paxArrTransportType !== "UNDEFINED" || f.paxDepTransportState === "PENDING" && f.paxDepTransportType !== "UNDEFINED").length,
    policia: flights.filter((f) => f.state !== "DISPATCHED" && getRequiredAuthorities(f.origin).policia).length,
    guardaCivil: flights.filter((f) => f.state !== "DISPATCHED" && getRequiredAuthorities(f.origin).guardaCivil).length,
    overdue: flights.reduce((count, f) => count + f.services.filter((s) => isServiceOverdue(s)).length, 0),
    extrasPending: activeFuelo.filter((f) => f.services.some((s) => s.state === "PENDING")).length,
  };

  const totalIssues = counts.fuelPending + counts.cateringPending + counts.toiletPending + counts.overdue;

  if (flights.length === 0) return null;

  const items: { label: string; count: number; query: string; color?: string }[] = [
    { label: "Fuel pedido", count: counts.fuelPending, query: "fuel" },
    { label: "Fuel no pedido (calzos)", count: counts.fuelNotRequested, query: "calzos" },
    { label: "Catering pendiente", count: counts.cateringPending, query: "catering" },
    { label: "Toilet pendiente", count: counts.toiletPending, query: "toilet" },
    { label: "Transporte pendiente", count: counts.transportPending, query: "transporte" },
    { label: "Extras pendientes", count: counts.extrasPending, query: "pendiente" },
    { label: "Policia necesaria", count: counts.policia, query: "policia" },
    { label: "Guardia Civil", count: counts.guardaCivil, query: "civil" },
    { label: "Servicios retrasados", count: counts.overdue, query: "extras", color: "text-red-600" },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left shadow-sm hover:bg-gray-50"
      >
        {counts.overdue > 0 && <AlertTriangle size={14} className="shrink-0 text-red-500" />}
        <span className="text-xs font-medium text-gray-600">
          {totalIssues > 0 ? `${totalIssues} pendiente${totalIssues !== 1 ? "s" : ""}` : "Todo al dia"}
        </span>
        <div className="flex flex-1 flex-wrap gap-1">
          {!collapsed ? null : items.slice(0, 4).map((item) => (
            <span key={item.label} className={`rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium ${item.color || "text-gray-500"}`}>
              {item.label}: {item.count}
            </span>
          ))}
          {collapsed && items.length > 4 && (
            <span className="text-[10px] text-gray-400">+{items.length - 4} mas</span>
          )}
        </div>
        {collapsed ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronUp size={14} className="shrink-0 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-white p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => onQuickFilter(item.query)}
              className="flex items-center justify-between rounded-md px-3 py-1.5 text-left text-xs hover:bg-gray-50"
            >
              <span className={item.color || "text-gray-600"}>{item.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.color ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
