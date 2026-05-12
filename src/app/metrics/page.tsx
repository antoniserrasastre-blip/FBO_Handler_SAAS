"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_LABELS, ServiceType } from "@/types";
import { ViewTabs } from "@/components/ViewTabs";

interface Metrics {
  range: number;
  daysWithData: number;
  totalFlights: number;
  totalPax: number;
  totalServices: number;
  servicesDelivered: number;
  servicesPending: number;
  serviceDeliveryRate: string;
  avgFlightsPerDay: string;
  overnightFlights: number;
  avgTurnaround: number;
  tightTurnarounds: number;
  dailyStats: { date: string; flights: number; paxTotal: number; servicesTotal: number; servicesDelivered: number }[];
  topOperators: { icao: string; name: string; flights: number; pax: number }[];
  hourBuckets: { hour: number; arrivals: number; departures: number }[];
  weekdayCounts: { day: string; flights: number; pax: number }[];
  topServices: { type: string; count: number }[];
  topAircraft: { type: string; count: number }[];
  policiaCount: number;
  guardaCivilCount: number;
  passengers: { total: number; confirmed: number; noShow: number; added: number; verified: number; verifiedRate: string };
  lostItems: { total: number; found: number; claimed: number; delivered: number };
}

export default function MetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?range=${range}`)
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Cargando metricas...</div>
      </div>
    );
  }
  if (!metrics) return null;

  const maxFlights = Math.max(...metrics.dailyStats.map((d) => d.flights), 1);
  const maxHour = Math.max(...metrics.hourBuckets.map((h) => Math.max(h.arrivals, h.departures)), 1);
  const maxWeekday = Math.max(...metrics.weekdayCounts.map((w) => w.flights), 1);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Metricas</h1>
            <p className="mt-1 text-sm text-gray-500">
              {metrics.daysWithData} dias con datos en los ultimos {metrics.range} dias
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(parseInt(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={365}>1 ano</option>
            </select>
            <ViewTabs tone="light" />
          </div>
        </div>

        {/* KPIs principales */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Total vuelos" value={String(metrics.totalFlights)} sub={`Media: ${metrics.avgFlightsPerDay}/dia`} />
          <Kpi label="Total pasajeros" value={String(metrics.totalPax)} />
          <Kpi label="Servicios entregados" value={`${metrics.serviceDeliveryRate}%`} sub={`${metrics.servicesDelivered}/${metrics.totalServices}`} color="text-green-700" />
          <Kpi label="Turnaround medio" value={`${metrics.avgTurnaround}m`} sub={`${metrics.tightTurnarounds} ajustados (<90m)`} />
        </div>

        {/* KPIs secundarios */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Pernoctas" value={String(metrics.overnightFlights)} color="text-purple-700" />
          <Kpi label="Policia necesaria" value={String(metrics.policiaCount)} sub={`G.Civil: ${metrics.guardaCivilCount}`} color="text-orange-700" />
          <Kpi label="Pax verificados" value={`${metrics.passengers.verifiedRate}%`} sub={`${metrics.passengers.verified}/${metrics.passengers.total}`} color="text-blue-700" />
          <Kpi label="Objetos olvidados" value={String(metrics.lostItems.total)} sub={`${metrics.lostItems.delivered} entregados`} color="text-amber-700" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Vuelos por dia */}
          <Card title="Vuelos por dia">
            {metrics.dailyStats.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-1.5">
                {metrics.dailyStats.slice(0, 20).map((day) => {
                  const d = new Date(day.date);
                  const label = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
                  const pct = (day.flights / maxFlights) * 100;
                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-xs text-gray-500">{label}</span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div className="flex h-5 items-center rounded bg-blue-500 px-2 text-[10px] font-medium text-white" style={{ width: `${Math.max(pct, 8)}%` }}>
                            {day.flights}
                          </div>
                        </div>
                      </div>
                      <span className="w-14 shrink-0 text-right text-[10px] text-gray-400">{day.paxTotal}pax</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top operadores */}
          <Card title="Top operadores">
            {metrics.topOperators.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-1.5">
                {metrics.topOperators.map((op) => {
                  const maxOp = metrics.topOperators[0]?.flights || 1;
                  const pct = (op.flights / maxOp) * 100;
                  return (
                    <div key={op.icao} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-xs text-gray-700" title={op.name}>{op.name}</span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div className="flex h-5 items-center rounded bg-indigo-500 px-2 text-[10px] font-medium text-white" style={{ width: `${Math.max(pct, 10)}%` }}>
                            {op.flights}
                          </div>
                        </div>
                      </div>
                      <span className="w-14 shrink-0 text-right text-[10px] text-gray-400">{op.pax}pax</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Peak hours */}
          <Card title="Horas pico (llegadas / salidas)">
            <div className="flex h-32 items-end gap-0.5">
              {metrics.hourBuckets.map((h) => {
                const arrPct = (h.arrivals / maxHour) * 100;
                const depPct = (h.departures / maxHour) * 100;
                return (
                  <div key={h.hour} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full flex-1 items-end gap-0.5">
                      <div className="flex-1 rounded-t bg-blue-400" style={{ height: `${arrPct}%` }} title={`${h.arrivals} llegadas`} />
                      <div className="flex-1 rounded-t bg-orange-400" style={{ height: `${depPct}%` }} title={`${h.departures} salidas`} />
                    </div>
                    {h.hour % 3 === 0 && <span className="mt-0.5 text-[9px] text-gray-400">{h.hour}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-blue-400" /> Llegadas</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-orange-400" /> Salidas</span>
            </div>
          </Card>

          {/* Por dia de la semana */}
          <Card title="Por dia de la semana">
            <div className="space-y-1.5">
              {metrics.weekdayCounts.map((w) => {
                const pct = (w.flights / maxWeekday) * 100;
                return (
                  <div key={w.day} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-xs font-medium text-gray-600">{w.day}</span>
                    <div className="flex-1">
                      <div className="h-5 rounded bg-gray-100">
                        <div className="flex h-5 items-center rounded bg-teal-500 px-2 text-[10px] font-medium text-white" style={{ width: `${Math.max(pct, 8)}%` }}>
                          {w.flights}
                        </div>
                      </div>
                    </div>
                    <span className="w-14 shrink-0 text-right text-[10px] text-gray-400">{w.pax}pax</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top servicios */}
          <Card title="Servicios mas solicitados">
            {metrics.topServices.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-1.5">
                {metrics.topServices.map((svc) => {
                  const maxSvc = metrics.topServices[0]?.count || 1;
                  const pct = (svc.count / maxSvc) * 100;
                  const label = SERVICE_LABELS[svc.type as ServiceType] || svc.type;
                  return (
                    <div key={svc.type} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-xs text-gray-600">{label}</span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div className="flex h-5 items-center rounded bg-green-500 px-2 text-[10px] font-medium text-white" style={{ width: `${Math.max(pct, 10)}%` }}>
                            {svc.count}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pasajeros */}
          <Card title="Pasajeros registrados">
            {metrics.passengers.total === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-2">
                <StatRow label="Total registrados" value={metrics.passengers.total} color="bg-gray-100 text-gray-700" />
                <StatRow label="Confirmados" value={metrics.passengers.confirmed} color="bg-green-100 text-green-700" />
                <StatRow label="No-show" value={metrics.passengers.noShow} color="bg-red-100 text-red-700" />
                <StatRow label="Anadidos de ultima hora" value={metrics.passengers.added} color="bg-blue-100 text-blue-700" />
                <StatRow label="Verificados" value={`${metrics.passengers.verified} (${metrics.passengers.verifiedRate}%)`} color="bg-indigo-100 text-indigo-700" />
              </div>
            )}
          </Card>

          {/* Tipos de aeronave */}
          <Card title="Tipos de aeronave" wide>
            {metrics.topAircraft.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {metrics.topAircraft.map((ac) => (
                  <div key={ac.type} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                    <div className="text-sm font-bold text-gray-900">{ac.type}</div>
                    <div className="text-[10px] text-gray-500">{ac.count} vuelos</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color || "text-gray-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="mb-4 text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>{value}</span>
    </div>
  );
}
