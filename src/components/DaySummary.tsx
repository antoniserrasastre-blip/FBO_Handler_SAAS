"use client";

import { useSession, signOut } from "next-auth/react";
import { Flight } from "@prisma/client";
import { useRouter } from "next/navigation";

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

  const alerts = flights.filter((f) => f.paxDeparture > 5).length;

  const dateStr = date.toLocaleDateString("es-ES", {
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
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">MALLORCAIR</h1>
            <span className="text-sm text-gray-500">LEPA</span>

            {/* Date navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goDay(-1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Dia anterior"
              >
                ◀
              </button>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-700">
                {dateStr}
              </span>
              <button
                onClick={() => goDay(1)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Dia siguiente"
              >
                ▶
              </button>
              {!isToday && (
                <button
                  onClick={goToday}
                  className="ml-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {connected !== undefined && (
              <span
                className={`flex items-center gap-1.5 text-xs ${connected ? "text-green-600" : "text-gray-400"}`}
                title={connected ? "Tiempo real activo" : "Reconectando..."}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                {connected ? "En vivo" : "Offline"}
              </span>
            )}
            <button
              onClick={() => router.push("/historico")}
              className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
              title="Historico"
            >
              Historico
            </button>
            <span className="text-sm text-gray-600">
              {session?.user?.name}{" "}
              <span className="text-xs text-gray-400">({session?.user?.role?.toLowerCase()})</span>
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              Salir
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {!isToday && (
            <>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Solo lectura
              </span>
              <span className="text-gray-300">|</span>
            </>
          )}
          <Stat label="En tierra" value={onGround} color="text-blue-600" />
          <Stat label="Esperados" value={expected} color="text-gray-600" />
          <Stat label="Embarque" value={boarding} color="text-yellow-600" />
          <Stat label="Despachados" value={dispatched} color="text-green-600" />
          <span className="text-gray-300">|</span>
          <Stat label="Pax en sala" value={paxInLounge} color="text-purple-600" />
          {alerts > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="font-medium text-red-600">
                ⚠ {alerts} {alerts === 1 ? "alerta" : "alertas"}
              </span>
            </>
          )}
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">Total: {flights.length} vuelos</span>
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
