"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { palmaDayUtc } from "@/lib/time";
import { HelixButton, HelixPill } from "@/components/helix";

interface DaySheetSummary {
  id: string;
  date: string;
  /** Nº de visits del día (una visit puede tener llegada Y salida). */
  totalFlights: number;
  /** Conteo por movimiento (B3): legs cuya fecha cae en este día. */
  arrivals: number;
  departures: number;
  dispatched: number;
  paxArrival: number;
  paxDeparture: number;
  totalServices: number;
  deliveredServices: number;
  notes?: string | null;
  closed?: boolean;
  manual?: boolean;
}

export default function HistoricoPage() {
  const router = useRouter();
  const [daySheets, setDaySheets] = useState<DaySheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    fetch("/api/daysheets")
      .then((res) => res.json())
      .then(setDaySheets)
      .catch(console.error);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function createDay() {
    if (!newDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/daysheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "No se pudo crear el día");
        return;
      }
      setPreparing(false);
      setNewDate("");
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  function navigateToDay(dateStr: string) {
    const d = palmaDayUtc(new Date(dateStr));
    sessionStorage.setItem("viewDate", d.toISOString());
    router.push("/");
  }

  function exportDay(dateStr: string, type: "flights" | "services") {
    const d = new Date(dateStr).toISOString().slice(0, 10);
    window.open(`/api/export?date=${d}&type=${type}`, "_blank");
  }

  const today = palmaDayUtc();

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center text-ink-3">
        Cargando histórico…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-96px)] bg-bg px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Histórico</h1>
            <p className="mt-1 text-sm text-ink-3">Consulta y exporta datos de días anteriores.</p>
          </div>
          <div className="flex items-center gap-2">
            {preparing ? (
              <>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded-hx-sm border border-line bg-bg px-2 py-1 text-sm text-ink-1 focus:outline-none focus:ring-1 focus:ring-brand"
                  autoFocus
                />
                <HelixButton
                  variant="primary"
                  size="sm"
                  onClick={createDay}
                  disabled={!newDate || submitting}
                >
                  Crear
                </HelixButton>
                <HelixButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPreparing(false); setNewDate(""); }}
                >
                  Cancelar
                </HelixButton>
              </>
            ) : (
              <HelixButton variant="secondary" size="sm" onClick={() => setPreparing(true)}>
                Preparar día…
              </HelixButton>
            )}
            <HelixButton variant="secondary" size="sm" onClick={() => router.push("/")}>
              Volver al panel
            </HelixButton>
          </div>
        </div>

        {daySheets.length === 0 ? (
          <div className="rounded-hx-md border border-dashed border-line p-12 text-center text-ink-muted">
            No hay datos históricos.
          </div>
        ) : (
          <div className="overflow-hidden rounded-hx-md border border-line bg-bg">
            {daySheets.map((ds, idx) => {
              const date = new Date(ds.date);
              const isToday = date.getTime() === today.getTime();
              const dateStr = date.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              });
              const pct = ds.totalServices > 0 ? (ds.deliveredServices / ds.totalServices) * 100 : 0;
              return (
                <div
                  key={ds.id}
                  className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                    idx > 0 ? "border-t border-line-subtle" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold capitalize text-ink-1">{dateStr}</h3>
                      {isToday ? <HelixPill tone="brand">HOY</HelixPill> : null}
                      {ds.manual ? <HelixPill tone="info">PREPARADO</HelixPill> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                      {/* Conteo por movimiento — "N vuelos" mentía: contaba visits, no legs. */}
                      <span>
                        <span className="font-semibold text-ink-1">{ds.arrivals ?? 0}</span> lleg ·{" "}
                        <span className="font-semibold text-ink-1">{ds.departures ?? 0}</span> sal
                      </span>
                      <span>
                        <span className="font-semibold text-success-strong">{ds.dispatched}</span> despachados
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <PlaneLanding size={11} className="text-fbo-approach" />
                        <span className="font-semibold text-ink-1">{ds.paxArrival}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <PlaneTakeoff size={11} className="text-fbo-board" />
                        <span className="font-semibold text-ink-1">{ds.paxDeparture}</span>
                      </span>
                      <span>
                        <span className="font-semibold text-ink-1">
                          {ds.deliveredServices}/{ds.totalServices}
                        </span>{" "}
                        servicios
                      </span>
                    </div>
                    {ds.totalServices > 0 ? (
                      <div className="mt-2 h-1 w-48 overflow-hidden rounded-hx-pill bg-bg-muted">
                        <div
                          className="h-full bg-success transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ds.totalFlights > 0 ? (
                      <>
                        <HelixButton
                          variant="ghost"
                          size="sm"
                          onClick={() => exportDay(ds.date, "flights")}
                          title="Exportar vuelos"
                        >
                          Vuelos CSV
                        </HelixButton>
                        {ds.totalServices > 0 ? (
                          <HelixButton
                            variant="ghost"
                            size="sm"
                            onClick={() => exportDay(ds.date, "services")}
                            title="Exportar servicios"
                          >
                            Servicios CSV
                          </HelixButton>
                        ) : null}
                      </>
                    ) : null}
                    <HelixButton variant="primary" size="sm" onClick={() => navigateToDay(ds.date)}>
                      Ver día
                    </HelixButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
