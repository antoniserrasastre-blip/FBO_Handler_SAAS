"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { FLIGHT_STATE_CONFIG, type FlightState, SERVICE_LABELS } from "@/types";

interface FlightRow {
  id: string;
  callsign: string;
  registration: string;
  aircraftType: string;
  origin: string | null;
  eta: string | null;
  arrivalDate: string | null;
  destination: string | null;
  etd: string | null;
  departureDate: string | null;
  parking: string | null;
  state: FlightState;
  crewArrival: number;
  crewDeparture: number;
  paxArrival: number;
  paxDeparture: number;
  paymentRequired: boolean;
  paymentState: string;
  notes: string | null;
  services: { type: string; state: string; customName: string | null; target: string | null }[];
}

function todayAtMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function DiaPage() {
  const router = useRouter();
  const [date, setDate] = useState<Date>(todayAtMidnight);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "payment">("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/flights?date=${date.toISOString()}`)
      .then((r) => r.json())
      .then((data) => setFlights(data.flights || []))
      .catch(() => setFlights([]))
      .finally(() => setLoading(false));
  }, [date]);

  const rows = useMemo(() => {
    const sorted = [...flights].sort((a, b) => {
      const ta = a.eta || a.etd || "99:99";
      const tb = b.eta || b.etd || "99:99";
      return ta.localeCompare(tb);
    });
    if (filter === "pending") return sorted.filter((f) => f.state !== "DISPATCHED");
    if (filter === "payment")
      return sorted.filter((f) => f.paymentRequired && f.paymentState !== "PAID");
    return sorted;
  }, [flights, filter]);

  function goDay(offset: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    setDate(d);
  }

  function goToday() {
    setDate(todayAtMidnight());
  }

  const dateStr = date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm print:hidden">
        <div className="mx-auto max-w-[1600px] px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              <ArrowLeft size={14} /> Volver
            </button>
            <h1 className="text-sm font-bold text-gray-900 sm:text-base">Orden del dia</h1>

            <div className="ml-2 flex items-center gap-0.5">
              <button
                onClick={() => goDay(-1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronLeft size={14} />
              </button>
              <input
                type="date"
                value={date.toISOString().slice(0, 10)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  const nd = new Date(y, m - 1, d);
                  nd.setHours(0, 0, 0, 0);
                  setDate(nd);
                }}
                className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 sm:text-sm"
              />
              <button
                onClick={() => goDay(1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={goToday}
                className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 sm:text-xs"
              >
                Hoy
              </button>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
              >
                <option value="all">Todos ({flights.length})</option>
                <option value="pending">Pendientes</option>
                <option value="payment">Pago pendiente</option>
              </select>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                title="Imprimir / exportar PDF"
              >
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Print-only title block */}
      <div className="hidden print:block px-4 pt-4">
        <h1 className="text-lg font-bold">MALLORCAIR - Orden del dia</h1>
        <p className="text-sm text-gray-700">{dateStr}</p>
      </div>

      <main className="mx-auto max-w-[1600px] p-3 sm:p-4 print:p-0">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
            Sin vuelos para este dia
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white print:border-none print:rounded-none">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500 print:bg-white">
                <tr>
                  <Th>Indicativo</Th>
                  <Th>Matricula</Th>
                  <Th>Tipo</Th>
                  <Th>Origen</Th>
                  <Th>ETA</Th>
                  <Th>Destino</Th>
                  <Th>ETD</Th>
                  <Th>Parking</Th>
                  <Th>Crew</Th>
                  <Th>Pax</Th>
                  <Th>Servicios</Th>
                  <Th>Estado</Th>
                  <Th>Pago</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((f, i) => (
                  <Row key={f.id} f={f} alt={i % 2 === 1} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-1.5 font-semibold">{children}</th>;
}

function Row({ f, alt }: { f: FlightRow; alt: boolean }) {
  const cfg = FLIGHT_STATE_CONFIG[f.state];
  const base = alt ? "bg-gray-50" : "bg-white";
  const states: Record<string, string> = {
    EXPECTED: "bg-gray-50",
    ON_GROUND: "bg-blue-50",
    BOARDING: "bg-yellow-50",
    DISPATCHED: "bg-green-50 text-gray-500",
  };
  const stateBg = states[f.state] || base;
  const svcSummary = summarizeServices(f.services);

  return (
    <tr className={`${stateBg} hover:bg-orange-50 print:hover:bg-transparent`}>
      <Td className="font-semibold">
        {f.callsign}
        {f.paymentRequired && <span className="ml-0.5 text-orange-600">*</span>}
      </Td>
      <Td className="font-mono">{f.registration}</Td>
      <Td>{f.aircraftType}</Td>
      <Td>{f.origin || "-"}</Td>
      <Td className="font-mono">{f.eta || "-"}</Td>
      <Td>{f.destination || "-"}</Td>
      <Td className="font-mono">{f.etd || "-"}</Td>
      <Td>{f.parking || "-"}</Td>
      <Td className="text-center">
        {f.crewArrival}
        {f.crewDeparture !== f.crewArrival ? `/${f.crewDeparture}` : ""}
      </Td>
      <Td className="text-center">
        {f.paxArrival}
        {f.paxDeparture !== f.paxArrival ? `/${f.paxDeparture}` : ""}
      </Td>
      <Td className="max-w-[200px] truncate" title={svcSummary}>
        {svcSummary || "-"}
      </Td>
      <Td>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </Td>
      <Td>
        {f.paymentRequired ? (
          f.paymentState === "PAID" ? (
            <span className="rounded bg-green-100 px-1 text-[10px] font-medium text-green-700">
              Pagado
            </span>
          ) : (
            <span className="rounded bg-orange-100 px-1 text-[10px] font-bold uppercase text-orange-700">
              Pendiente
            </span>
          )
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </Td>
      <Td className="max-w-[220px] truncate text-gray-500" title={f.notes || ""}>
        {f.notes || ""}
      </Td>
    </tr>
  );
}

function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      className={`px-2 py-1 align-middle whitespace-nowrap ${className}`}
      title={title}
    >
      {children}
    </td>
  );
}

function summarizeServices(services: FlightRow["services"]): string {
  if (!services || services.length === 0) return "";
  const byType = new Map<string, number>();
  for (const s of services) {
    const key = s.type;
    byType.set(key, (byType.get(key) || 0) + 1);
  }
  return Array.from(byType.entries())
    .map(([t, n]) => {
      const label = SERVICE_LABELS[t as keyof typeof SERVICE_LABELS] || t;
      return n > 1 ? `${label} x${n}` : label;
    })
    .join(", ");
}
