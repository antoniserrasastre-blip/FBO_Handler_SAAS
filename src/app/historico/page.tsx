"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { palmaDayUtc } from "@/lib/time";
import { ViewTabs } from "@/components/ViewTabs";

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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Cargando historico...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Historico</h1>
            <p className="mt-1 text-sm text-gray-500">
              Consulta y exporta datos de dias anteriores
            </p>
          </div>
          <ViewTabs tone="light" />
        </div>

        {daySheets.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-500">No hay datos historicos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {daySheets.map((ds) => {
              const date = new Date(ds.date);
              const isToday = date.getTime() === today.getTime();
              const dateStr = date.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              });

              return (
                <div
                  key={ds.id}
                  className="overflow-hidden rounded-lg bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                    <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-semibold text-gray-900 capitalize sm:text-sm">
                            {dateStr}
                          </h3>
                          {isToday && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              HOY
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 sm:gap-x-4">
                          <span>
                            <span className="font-medium text-gray-700">{ds.totalFlights}</span> vuelos
                          </span>
                          <span>
                            <span className="font-medium text-green-600">{ds.dispatched}</span> despachados
                          </span>
                          <span>
                            <span className="font-medium text-gray-700">{ds.totalPax}</span> pax salida
                          </span>
                          <span>
                            <span className="font-medium text-gray-700">
                              {ds.deliveredServices}/{ds.totalServices}
                            </span>{" "}
                            servicios
                          </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {ds.totalFlights > 0 && (
                        <>
                          <button
                            onClick={() => exportDay(ds.date, "flights")}
                            className="rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            title="Exportar vuelos"
                          >
                            Vuelos CSV
                          </button>
                          {ds.totalServices > 0 && (
                            <button
                              onClick={() => exportDay(ds.date, "services")}
                              className="rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                              title="Exportar servicios"
                            >
                              Servicios CSV
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => navigateToDay(ds.date)}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                      >
                        Ver dia
                      </button>
                    </div>
                  </div>

                  {/* Progress bar for services completion */}
                  {ds.totalServices > 0 && (
                    <div className="h-1 bg-gray-100">
                      <div
                        className="h-full bg-green-400 transition-all"
                        style={{
                          width: `${(ds.deliveredServices / ds.totalServices) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
