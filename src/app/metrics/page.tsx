"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_LABELS, ServiceType } from "@/types";
import { HelixButton, SegmentedControl } from "@/components/helix";

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

type RangeOption = "7" | "14" | "30" | "90" | "365";

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1a" },
];

export default function MetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeOption>("30");

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
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center text-ink-3">
        Cargando métricas…
      </div>
    );
  }
  if (!metrics) return null;

  const maxFlights = Math.max(...metrics.dailyStats.map((d) => d.flights), 1);
  const maxHour = Math.max(...metrics.hourBuckets.map((h) => Math.max(h.arrivals, h.departures)), 1);
  const maxWeekday = Math.max(...metrics.weekdayCounts.map((w) => w.flights), 1);

  return (
    <div className="min-h-[calc(100vh-96px)] bg-bg px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Métricas</h1>
            <p className="mt-1 text-sm text-ink-3">
              <span className="font-mono [font-variant-numeric:tabular-nums]">
                {metrics.daysWithData}
              </span>{" "}
              días con datos en los últimos{" "}
              <span className="font-mono [font-variant-numeric:tabular-nums]">{metrics.range}</span>{" "}
              días
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SegmentedControl<RangeOption> value={range} onChange={setRange} options={RANGE_OPTIONS} />
            <HelixButton variant="secondary" size="sm" onClick={() => router.push("/")}>
              Volver
            </HelixButton>
          </div>
        </div>

        {/* KPIs principales */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Total vuelos" value={metrics.totalFlights} sub={`Media: ${metrics.avgFlightsPerDay}/día`} />
          <Kpi label="Total pasajeros" value={metrics.totalPax} />
          <Kpi
            label="Servicios entregados"
            value={`${metrics.serviceDeliveryRate}%`}
            sub={`${metrics.servicesDelivered}/${metrics.totalServices}`}
            tone="success"
          />
          <Kpi
            label="Turnaround medio"
            value={`${metrics.avgTurnaround}m`}
            sub={`${metrics.tightTurnarounds} ajustados (<90m)`}
          />
        </div>

        {/* KPIs secundarios */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Pernoctas" value={metrics.overnightFlights} tone="overnight" />
          <Kpi
            label="Policía necesaria"
            value={metrics.policiaCount}
            sub={`G.Civil: ${metrics.guardaCivilCount}`}
            tone="warning"
          />
          <Kpi
            label="Pax verificados"
            value={`${metrics.passengers.verifiedRate}%`}
            sub={`${metrics.passengers.verified}/${metrics.passengers.total}`}
            tone="info"
          />
          <Kpi
            label="Objetos olvidados"
            value={metrics.lostItems.total}
            sub={`${metrics.lostItems.delivered} entregados`}
            tone="warning"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Vuelos por día">
            {metrics.dailyStats.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.dailyStats.slice(0, 20).map((day) => {
                  const d = new Date(day.date);
                  const label = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
                  const pct = (day.flights / maxFlights) * 100;
                  return (
                    <BarRow
                      key={day.date}
                      label={label}
                      value={day.flights}
                      pct={pct}
                      barClass="bg-brand"
                      right={`${day.paxTotal}pax`}
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Top operadores">
            {metrics.topOperators.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.topOperators.map((op) => {
                  const maxOp = metrics.topOperators[0]?.flights || 1;
                  const pct = (op.flights / maxOp) * 100;
                  return (
                    <BarRow
                      key={op.icao}
                      label={op.name}
                      value={op.flights}
                      pct={pct}
                      barClass="bg-fbo-onblocks"
                      right={`${op.pax}pax`}
                      titleAttr={op.name}
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Horas pico (llegadas / salidas)">
            <div className="flex h-32 items-end gap-0.5">
              {metrics.hourBuckets.map((h) => {
                const arrPct = (h.arrivals / maxHour) * 100;
                const depPct = (h.departures / maxHour) * 100;
                return (
                  <div key={h.hour} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full flex-1 items-end gap-0.5">
                      <div
                        className="flex-1 rounded-t bg-fbo-approach"
                        style={{ height: `${arrPct}%` }}
                        title={`${h.arrivals} llegadas`}
                      />
                      <div
                        className="flex-1 rounded-t bg-fbo-board"
                        style={{ height: `${depPct}%` }}
                        title={`${h.departures} salidas`}
                      />
                    </div>
                    {h.hour % 3 === 0 ? (
                      <span className="mt-0.5 font-mono text-[9px] text-ink-muted [font-variant-numeric:tabular-nums]">
                        {h.hour}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[10px] text-ink-3">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-fbo-approach" /> Llegadas
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-fbo-board" /> Salidas
              </span>
            </div>
          </Card>

          <Card title="Por día de la semana">
            <div className="space-y-1.5">
              {metrics.weekdayCounts.map((w) => {
                const pct = (w.flights / maxWeekday) * 100;
                return (
                  <BarRow
                    key={w.day}
                    label={w.day}
                    value={w.flights}
                    pct={pct}
                    barClass="bg-fbo-departed"
                    right={`${w.pax}pax`}
                  />
                );
              })}
            </div>
          </Card>

          <Card title="Servicios más solicitados">
            {metrics.topServices.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.topServices.map((svc) => {
                  const maxSvc = metrics.topServices[0]?.count || 1;
                  const pct = (svc.count / maxSvc) * 100;
                  const label = SERVICE_LABELS[svc.type as ServiceType] || svc.type;
                  return (
                    <BarRow
                      key={svc.type}
                      label={label}
                      value={svc.count}
                      pct={pct}
                      barClass="bg-success"
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Pasajeros registrados">
            {metrics.passengers.total === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                <StatRow label="Total registrados" value={metrics.passengers.total} tone="default" />
                <StatRow label="Confirmados" value={metrics.passengers.confirmed} tone="success" />
                <StatRow label="No-show" value={metrics.passengers.noShow} tone="danger" />
                <StatRow label="Añadidos de última hora" value={metrics.passengers.added} tone="info" />
                <StatRow
                  label="Verificados"
                  value={`${metrics.passengers.verified} (${metrics.passengers.verifiedRate}%)`}
                  tone="brand"
                />
              </div>
            )}
          </Card>

          <Card title="Tipos de aeronave" wide>
            {metrics.topAircraft.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex flex-wrap gap-2">
                {metrics.topAircraft.map((ac) => (
                  <div
                    key={ac.type}
                    className="rounded-hx-md border border-line bg-bg-subtle px-3 py-2 text-center"
                  >
                    <div className="font-mono text-sm font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
                      {ac.type}
                    </div>
                    <div className="font-mono text-[10px] text-ink-muted">{ac.count} vuelos</div>
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

function Empty() {
  return <p className="text-sm italic text-ink-muted">Sin datos</p>;
}

const KPI_TONE: Record<string, string> = {
  default: "text-ink-1",
  success: "text-success-strong",
  warning: "text-warning-strong",
  info: "text-info-strong",
  brand: "text-brand-active",
  overnight: "text-fbo-overnight",
};

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <div className="rounded-hx-md border border-line bg-bg p-4 shadow-hx-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold [font-variant-numeric:tabular-nums] ${KPI_TONE[tone]}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{sub}</div> : null}
    </div>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-hx-md border border-line bg-bg p-5 shadow-hx-sm ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

function BarRow({
  label,
  value,
  pct,
  barClass,
  right,
  titleAttr,
}: {
  label: string;
  value: number;
  pct: number;
  barClass: string;
  right?: string;
  titleAttr?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-xs text-ink-2" title={titleAttr ?? label}>
        {label}
      </span>
      <div className="flex-1">
        <div className="h-5 rounded bg-bg-muted">
          <div
            className={`flex h-5 items-center rounded px-2 font-mono text-[10px] font-semibold text-white [font-variant-numeric:tabular-nums] ${barClass}`}
            style={{ width: `${Math.max(pct, 8)}%` }}
          >
            {value}
          </div>
        </div>
      </div>
      {right ? (
        <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted [font-variant-numeric:tabular-nums]">
          {right}
        </span>
      ) : null}
    </div>
  );
}

const STATROW_TONE: Record<string, string> = {
  default: "bg-bg-muted text-ink-2",
  success: "bg-success-bg text-success-strong",
  danger: "bg-danger-bg text-danger-strong",
  info: "bg-info-bg text-info-strong",
  brand: "bg-brand-tint text-brand-active",
};

function StatRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: keyof typeof STATROW_TONE;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-2">{label}</span>
      <span
        className={`rounded-hx-pill px-2 py-0.5 font-mono text-xs font-semibold [font-variant-numeric:tabular-nums] ${STATROW_TONE[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
