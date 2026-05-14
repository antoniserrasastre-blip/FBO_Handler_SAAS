"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { palmaDayUtc } from "@/lib/time";
import { HelixButton, HelixPill } from "@/components/helix";

interface DaySheetSummary {
  id: string;
  date: string;
  totalFlights: number;
  dispatched: number;
  totalPax: number;
  totalServices: number;
  deliveredServices: number;
}

export default function HistoricoPage() {
  const router = useRouter();
  const [daySheets, setDaySheets] = useState<DaySheetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daysheets")
      .then((res) => res.json())
      .then(setDaySheets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
          <HelixButton variant="secondary" size="sm" onClick={() => router.push("/")}>
            Volver al panel
          </HelixButton>
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
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                      <span>
                        <span className="font-semibold text-ink-1">{ds.totalFlights}</span> vuelos
                      </span>
                      <span>
                        <span className="font-semibold text-success-strong">{ds.dispatched}</span> despachados
                      </span>
                      <span>
                        <span className="font-semibold text-ink-1">{ds.totalPax}</span> pax salida
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
