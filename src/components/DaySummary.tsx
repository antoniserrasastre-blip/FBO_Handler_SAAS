"use client";

import { useSession, signOut } from "next-auth/react";
import { Flight } from "@prisma/client";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "./Icons";

interface DaySummaryProps {
  flights: Flight[];
  date: Date;
  connected?: boolean;
  isToday?: boolean;
  onDateChange?: (date: Date) => void;
}

export function DaySummary({ flights, date, connected, isToday = true, onDateChange }: DaySummaryProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const onGround = flights.filter((f) => f.state === "ON_GROUND").length;
  const expected = flights.filter((f) => f.state === "EXPECTED").length;
  const boarding = flights.filter((f) => f.state === "BOARDING").length;
  const dispatched = flights.filter((f) => f.state === "DISPATCHED").length;
  const paxInLounge = flights.reduce((sum, f) => {
    let count = 0;
    if (f.paxArrState === "IN_LOUNGE") count += f.paxArrival;
    if (f.paxDepState === "IN_LOUNGE") count += f.paxDeparture;
    return sum + count;
  }, 0);

  // Note: flights don't include services in the DaySummary props (Flight type only)

  const dateStrShort = date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const dateStrLong = date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  function goDay(offset: number) {
    if (!onDateChange) return;
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    onDateChange(d);
  }

  function goToday() {
    if (!onDateChange) return;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    onDateChange(d);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3">
        {/* Top row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">MALLORCAIR</h1>
            <span className="hidden text-sm text-gray-500 sm:inline">LEPA</span>

            {/* Date navigation */}
            <div className="flex items-center gap-0.5 sm:gap-1">
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
                  if (!onDateChange || !e.target.value) return;
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  const newDate = new Date(y, m - 1, d);
                  newDate.setHours(0, 0, 0, 0);
                  onDateChange(newDate);
                }}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 sm:px-2 sm:text-sm cursor-pointer border-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={() => goDay(1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronRight size={14} />
              </button>
              {!isToday && (
                <button
                  onClick={goToday}
                  className="ml-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 sm:ml-1 sm:text-xs"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>

          {/* Right side: connection + user + actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {connected !== undefined && (
              <span
                className={`flex items-center gap-1 text-[10px] sm:text-xs ${connected ? "text-green-600" : "text-gray-400"}`}
                title={connected ? "Tiempo real activo" : "Reconectando..."}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                <span className="hidden sm:inline">{connected ? "En vivo" : "Offline"}</span>
              </span>
            )}
            <button
              onClick={() => router.push("/historico")}
              className="hidden rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 sm:block"
            >
              Historico
            </button>
            <button
              onClick={() => router.push("/metrics")}
              className="hidden rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 sm:block"
            >
              Metricas
            </button>
            {session?.user?.role === "ADMIN" && (
              <button
                onClick={() => router.push("/admin")}
                className="hidden rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 sm:block"
              >
                Admin
              </button>
            )}
            <span className="hidden text-sm text-gray-600 md:inline">
              {session?.user?.name}{" "}
              <span className="text-xs text-gray-400">({session?.user?.role?.toLowerCase()})</span>
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:mt-2 sm:gap-x-4 sm:text-sm">
          {!isToday && (
            <>
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 sm:text-xs">
                Dia anterior
              </span>
              <span className="text-gray-300">|</span>
            </>
          )}
          <Stat label="Tierra" value={onGround} color="text-blue-600" />
          <Stat label="Esper." value={expected} color="text-gray-600" />
          <Stat label="Embar." value={boarding} color="text-yellow-600" />
          <Stat label="Desp." value={dispatched} color="text-green-600" />
          <span className="hidden text-gray-300 sm:inline">|</span>
          <Stat label="Pax sala" value={paxInLounge} color="text-purple-600" />
          <span className="text-gray-400">{flights.length} vuelos</span>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="text-gray-500">
      {label}: <span className={`font-semibold ${color}`}>{value}</span>
    </span>
  );
}
