"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { getSpainToday, dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ChevronLeft, ChevronRight, Search, Printer, Maximize2 } from "lucide-react";
import { FLIGHT_STATES, SERVICE_TYPES } from "@/types";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

export default function DiaPage() {
  const { status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [date, setDate] = useState(() => getSpainToday());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Dual Clock update
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchFlights = useCallback(async () => {
    try {
      const dateStr = dateToSqlString(date);
      const res = await fetch(`/api/flights?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights);
      }
    } catch (err) {
      console.error("Error fetching flights:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchFlights();
    }
  }, [status, fetchFlights]);

  useEventStream({
    onEvent: () => fetchFlights(),
    enabled: status === "authenticated",
  });

  const stats = useMemo(() => {
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const shortDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
    let arrivals = 0;
    let departures = 0;
    flights.forEach((f) => {
      if (f.eta && (!f.arrivalDate || f.arrivalDate === shortDate)) arrivals++;
      if (f.etd && (!f.departureDate || f.departureDate === shortDate)) departures++;
    });
    return { arrivals, departures };
  }, [flights, date]);

  const formatTime = (date: Date, tz?: string) => {
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: tz,
    });
  };

  const getServiceState = (flight: FlightWithRelations, type: string) => {
    const svc = flight.services.find(s => s.type === type);
    if (!svc) return "NONE";
    return svc.state; // PENDING, ARRIVED, DELIVERED
  };

  if (status === "loading" || loading) {
    return <div className="flex h-screen items-center justify-center bg-[#1a1a1a] text-white">Cargando Tablón...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-[#f0f0f0] text-sm font-sans select-none">
      {/* --- HEADER (OPERATIONS STYLE) --- */}
      <header className="flex items-center justify-between bg-[#2c3e50] px-4 py-2 text-white shadow-md">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-blue-300 leading-tight">MALLORCAIR</h1>
            <span className="text-[10px] uppercase tracking-widest text-blue-100/50">Operations Dashboard</span>
          </div>
          
          <div className="h-8 w-[1px] bg-white/10" />

          {/* Date Nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const d = new Date(date);
              d.setUTCDate(d.getUTCDate() - 1);
              setDate(d);
            }} className="hover:text-blue-300"><ChevronLeft size={20}/></button>
            <span className="font-mono text-lg font-medium">
              {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase()}
            </span>
            <button onClick={() => {
              const d = new Date(date);
              d.setUTCDate(d.getUTCDate() + 1);
              setDate(d);
            }} className="hover:text-blue-300"><ChevronRight size={20}/></button>
          </div>
        </div>

        {/* Dual Clock */}
        <div className="flex items-center gap-8 font-mono">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-blue-200/60 uppercase">Local Palma</span>
            <span className="text-xl font-bold leading-none">{formatTime(now, "Europe/Madrid")}</span>
          </div>
          <div className="flex flex-col items-center border-l border-white/10 pl-8 text-yellow-400">
            <span className="text-[10px] text-yellow-400/60 uppercase">Zulu Time</span>
            <span className="text-xl font-bold leading-none">{formatTime(now, "UTC")}</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-xs uppercase font-medium">
            <span className="rounded bg-blue-900/50 px-2 py-1 border border-blue-400/30">LLEG: {stats.arrivals}</span>
            <span className="rounded bg-orange-900/50 px-2 py-1 border border-orange-400/30">SAL: {stats.departures}</span>
          </div>
          <button onClick={() => router.push("/")} className="rounded bg-gray-700 p-1.5 hover:bg-gray-600" title="Volver a tarjetas">
            <Maximize2 size={16}/>
          </button>
        </div>
      </header>

      {/* --- MAIN TABLE AREA --- */}
      <main className="flex-1 overflow-auto bg-white p-1">
        <table className="w-full border-collapse border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20 bg-[#ecf0f1] text-[#34495e] shadow-sm">
            <tr>
              <th className="border border-gray-300 p-1 font-bold w-8">ST</th>
              {/* Bloque Llegada */}
              <th colSpan={4} className="border border-gray-300 bg-blue-50 p-1 font-bold text-blue-800">LLEGADA</th>
              {/* Bloque Avión */}
              <th colSpan={3} className="border border-gray-300 bg-gray-100 p-1 font-bold text-gray-800">AVIÓN / PARKING</th>
              {/* Bloque Servicios */}
              <th colSpan={3} className="border border-gray-300 bg-yellow-50 p-1 font-bold text-yellow-800">SVC</th>
              {/* Bloque Salida */}
              <th colSpan={4} className="border border-gray-300 bg-orange-50 p-1 font-bold text-orange-800">SALIDA</th>
              {/* Bloque Info */}
              <th className="border border-gray-300 bg-gray-50 p-1 font-bold">PAX / CREW</th>
            </tr>
            <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <th className="border border-gray-300 p-1 w-6"></th>
              <th className="border border-gray-300 p-1 w-24">Vuelo</th>
              <th className="border border-gray-300 p-1 w-16">Origen</th>
              <th className="border border-gray-300 p-1 w-16">ETA (Z)</th>
              <th className="border border-gray-300 p-1 w-16">ATA (L)</th>
              
              <th className="border border-gray-300 p-1 w-28">Matrícula</th>
              <th className="border border-gray-300 p-1 w-16">Tipo</th>
              <th className="border border-gray-300 p-1 w-16">Stand</th>

              <th className="border border-gray-300 p-1 w-8" title="Fuel">F</th>
              <th className="border border-gray-300 p-1 w-8" title="Catering">C</th>
              <th className="border border-gray-300 p-1 w-8" title="Toilet">T</th>

              <th className="border border-gray-300 p-1 w-24">Vuelo</th>
              <th className="border border-gray-300 p-1 w-16">Destino</th>
              <th className="border border-gray-300 p-1 w-16">ETD (Z)</th>
              <th className="border border-gray-300 p-1 w-16">ATD (L)</th>

              <th className="border border-gray-300 p-1">P | C</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => (
              <tr key={f.id} className="group border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                {/* Status Dot */}
                <td className="border border-gray-200 p-1 text-center">
                  <div className={`h-3 w-3 rounded-full mx-auto shadow-inner ${
                    f.state === "ON_GROUND" ? "bg-blue-500 animate-pulse" :
                    f.state === "BOARDING" ? "bg-orange-500 animate-pulse" :
                    f.state === "DISPATCHED" ? "bg-green-500" : "bg-gray-300"
                  }`} />
                </td>

                {/* LLEGADA */}
                <td className="border border-gray-200 p-1 px-2 font-bold text-blue-700">{f.callsign}</td>
                <td className="border border-gray-200 p-1 text-center font-mono">{f.origin}</td>
                <td className="border border-gray-200 p-1 text-center font-mono font-medium">{f.eta}</td>
                <td className="border border-gray-200 p-1 text-center font-mono text-gray-400 text-[11px] italic">--:--</td>

                {/* AVIÓN */}
                <td className="border border-gray-200 p-1 px-2 text-center bg-gray-50/50">
                  <span className="rounded bg-white border border-gray-300 px-2 py-0.5 font-mono font-bold tracking-tight shadow-sm">
                    {f.registration}
                  </span>
                </td>
                <td className="border border-gray-200 p-1 text-center font-mono text-gray-600">{f.aircraftType}</td>
                <td className="border border-gray-200 p-1 text-center bg-gray-50/50">
                  <span className={`font-mono font-bold text-lg leading-none ${f.parking ? "text-gray-900" : "text-gray-300 italic text-xs font-normal"}`}>
                    {f.parking || "tbd"}
                  </span>
                </td>

                {/* SERVICIOS COMPACTOS */}
                <ServiceCell state={f.fuelState === "SERVED" ? "DELIVERED" : f.fuelState === "REQUESTED" ? "ARRIVED" : "PENDING"} label="F" />
                <ServiceCell state={getServiceState(f, "CATERING")} label="C" />
                <ServiceCell state={f.toiletState === "COMPLETED" ? "DELIVERED" : f.toiletState === "REQUESTED" ? "ARRIVED" : "PENDING"} label="T" />

                {/* SALIDA */}
                <td className="border border-gray-200 p-1 px-2 font-bold text-orange-700">{f.callsign}</td>
                <td className="border border-gray-200 p-1 text-center font-mono">{f.destination}</td>
                <td className="border border-gray-200 p-1 text-center font-mono font-medium">{f.etd}</td>
                <td className="border border-gray-200 p-1 text-center font-mono text-gray-400 text-[11px] italic">--:--</td>

                {/* PAX / CREW */}
                <td className="border border-gray-200 p-1 text-center whitespace-nowrap bg-gray-50/30">
                  <span className="text-gray-800 font-medium">P: {f.paxArrival}/{f.paxDeparture}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-500">C: {f.crewArrival}/{f.crewDeparture}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {flights.length === 0 && (
          <div className="p-12 text-center text-gray-400 italic">No hay vuelos registrados para este día.</div>
        )}
      </main>

      {/* --- FOOTER / INFO BAR --- */}
      <footer className="bg-white border-t border-gray-300 px-4 py-1 text-[11px] text-gray-500 flex justify-between">
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Tierra</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Embarcando</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Despachado</span>
        </div>
        <div>MALLORCAIR Operations System v0.3</div>
      </footer>
    </div>
  );
}

function ServiceCell({ state, label }: { state: string, label: string }) {
  const colors = {
    DELIVERED: "bg-green-500 text-white border-green-600",
    ARRIVED: "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse",
    PENDING: "bg-gray-100 text-gray-400 border-gray-200",
    NONE: "bg-gray-50 text-gray-200 border-transparent"
  };
  
  const current = (state === "DELIVERED" || state === "COMPLETED" || state === "SERVED") ? "DELIVERED" : 
                  (state === "ARRIVED" || state === "REQUESTED") ? "ARRIVED" : 
                  (state === "PENDING") ? "PENDING" : "NONE";

  return (
    <td className="border border-gray-200 p-0 text-center w-8 h-8">
      <div className={`flex h-full w-full items-center justify-center font-bold border-b-2 ${colors[current]}`}>
        {label}
      </div>
    </td>
  );
}
