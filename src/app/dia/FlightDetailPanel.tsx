"use client";

import { useState, useCallback, useEffect } from "react";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { X, Plane, ChevronDown, ChevronRight, Plus, Trash2, ClipboardPaste } from "lucide-react";
import { FLIGHT_STATE_CONFIG, normalizeFlightState, SERVICE_TYPES, SERVICE_LABELS, type ServiceType } from "@/types";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems?: LostItem[];
  eventLogs?: (EventLog & { user: { name: string } | null })[];
};

interface Props {
  flight: FlightWithRelations;
  onClose: () => void;
  /** Trigger refetch after mutations (parent owns state). */
  onMutated: () => void;
}

const FUEL_CYCLE = ["NOT_REQUESTED", "REQUESTED", "SERVED"] as const;
const TOILET_CYCLE = ["NOT_REQUESTED", "REQUESTED", "COMPLETED"] as const;
const SVC_CYCLE = ["PENDING", "ARRIVED", "DELIVERED"] as const;

function nextInCycle<T extends readonly string[]>(arr: T, current: string): T[number] {
  const i = arr.indexOf(current as T[number]);
  return arr[(i + 1) % arr.length];
}

export function FlightDetailPanel({ flight, onClose, onMutated }: Props) {
  const stateNorm = normalizeFlightState(flight.state);
  const stateCfg = FLIGHT_STATE_CONFIG[stateNorm];

  // Optimistic helpers
  const patchFlight = useCallback(async (data: Partial<Flight>) => {
    await fetch(`/api/flights/${flight.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    onMutated();
  }, [flight.id, onMutated]);

  const patchService = useCallback(async (id: string, data: Partial<Service>) => {
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    onMutated();
  }, [onMutated]);

  const deleteService = useCallback(async (id: string) => {
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    onMutated();
  }, [onMutated]);

  return (
    <aside className="flex h-full w-[440px] flex-col border-l border-gray-300 bg-white shadow-inner">
      {/* HEADER (always visible) */}
      <div className="flex items-start justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Plane size={14} className="text-blue-600 shrink-0" />
            <span className="font-bold text-base">{flight.callsign}</span>
            <span className="font-mono text-xs text-gray-600">{flight.registration}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${stateCfg.bg} ${stateCfg.text}`}>
              {stateCfg.label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {flight.aircraftType}
            {flight.parking ? ` · stand ${flight.parking}` : " · sin stand"}
            {flight.isOvernight ? " · pernocta" : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          title="Cerrar (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* RESUMEN (always visible) */}
      <div className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <SummaryBox label="Llegada" lines={[
          `${flight.origin || "—"} → LEPA`,
          `ETA ${flight.eta || "--:--"}Z${flight.arrivalDate ? ` · ${flight.arrivalDate}` : ""}`,
          `Crew ${flight.crewArrivalReal ?? flight.crewArrival} · Pax ${flight.paxArrivalReal ?? flight.paxArrival}`,
        ]} />
        <SummaryBox label="Salida" lines={[
          `LEPA → ${flight.destination || "—"}`,
          `ETD ${flight.etd || "--:--"}Z${flight.departureDate ? ` · ${flight.departureDate}` : ""}`,
          `Crew ${flight.crewDepartureReal ?? flight.crewDeparture} · Pax ${flight.paxDepartureReal ?? flight.paxDeparture}`,
        ]} />
      </div>

      {/* SECCIONES COLAPSABLES */}
      <div className="flex-1 overflow-auto">
        <CollapsibleSection title="Servicios" defaultOpen badge={`${flight.services.length}+ ${flight.fuelState !== "NOT_REQUESTED" ? "fuel" : ""} ${flight.toiletState !== "NOT_REQUESTED" ? "toilet" : ""}`.trim()}>
          <ServicesPanel
            flight={flight}
            patchFlight={patchFlight}
            patchService={patchService}
            deleteService={deleteService}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Notas" badge={flight.notes ? "•" : undefined}>
          <NotesPanel flight={flight} patchFlight={patchFlight} />
        </CollapsibleSection>

        <CollapsibleSection title="GenDec — pegar manifiesto">
          <div className="px-3 py-2 text-[11px] text-gray-500">
            <p className="mb-2">Para gestionar tripulación y pasajeros usa el modal completo.</p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                // TODO Phase 5: open PassengerCrewModal directly from here
                alert("Próxima fase: abrir modal Pax/Crew con pegado GenDec embebido");
              }}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
            >
              <ClipboardPaste size={11} /> Abrir modal pasajeros/tripulación
            </a>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Lost items" badge={flight.lostItems?.length ? String(flight.lostItems.length) : undefined}>
          <div className="px-3 py-2 text-[11px] text-gray-400 italic">
            Próxima fase: lista + añadir aquí
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Actividad reciente" badge={flight.eventLogs?.length ? String(flight.eventLogs.length) : undefined}>
          {flight.eventLogs && flight.eventLogs.length > 0 ? (
            <ul className="space-y-1 px-3 py-2 text-[11px] text-gray-600">
              {flight.eventLogs.slice(0, 12).map((ev) => (
                <li key={ev.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-gray-400">
                    {new Date(ev.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex-1">{ev.action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-[11px] text-gray-400 italic">Sin actividad registrada</div>
          )}
        </CollapsibleSection>
      </div>
    </aside>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function SummaryBox({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50/50 p-2">
      <div className="mb-1 text-[10px] font-bold uppercase text-gray-500">{label}</div>
      {lines.map((l, i) => (
        <div key={i} className="text-[11px] text-gray-700 leading-relaxed">{l}</div>
      ))}
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3 py-1.5 text-left hover:bg-gray-100"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-600">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {title}
          {badge && <span className="ml-1 rounded bg-gray-200 px-1.5 py-0 text-[10px] text-gray-600">{badge}</span>}
        </span>
      </button>
      {open && <div className="bg-white">{children}</div>}
    </div>
  );
}

// ─── Servicios — panel principal (default open) ────────────────────────────

function ServicesPanel({
  flight,
  patchFlight,
  patchService,
  deleteService,
}: {
  flight: FlightWithRelations;
  patchFlight: (d: Partial<Flight>) => void;
  patchService: (id: string, d: Partial<Service>) => void;
  deleteService: (id: string) => void;
}) {
  return (
    <div className="px-3 py-2 text-xs space-y-2">
      {/* Fuel + Toilet quick toggles */}
      <div className="grid grid-cols-2 gap-2">
        <BigToggle
          label="Fuel"
          state={flight.fuelState}
          onCycle={() => patchFlight({ fuelState: nextInCycle(FUEL_CYCLE, flight.fuelState) })}
          mapping={{ NOT_REQUESTED: { label: "No pedido", tone: "gray" }, REQUESTED: { label: "Pedido", tone: "yellow" }, SERVED: { label: "Servido", tone: "green" } }}
        />
        <BigToggle
          label="Toilet"
          state={flight.toiletState}
          onCycle={() => patchFlight({ toiletState: nextInCycle(TOILET_CYCLE, flight.toiletState) })}
          mapping={{ NOT_REQUESTED: { label: "No pedido", tone: "gray" }, REQUESTED: { label: "Pedido", tone: "yellow" }, COMPLETED: { label: "Completado", tone: "green" } }}
        />
      </div>

      {/* Service list */}
      <div className="rounded border border-gray-200">
        <div className="bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase text-gray-500">
          Otros servicios ({flight.services.length})
        </div>
        {flight.services.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-gray-400 italic">Sin servicios extra</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {flight.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-gray-800 truncate">
                    {s.type === "CUSTOM" ? s.customName || "Custom" : SERVICE_LABELS[s.type as ServiceType] ?? s.type}
                    {s.target && <span className="ml-1 text-gray-400">· {s.target}</span>}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {s.phase}{s.reference ? ` · ref ${s.reference}` : ""}{s.origin ? ` · ${s.origin}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => patchService(s.id, { state: nextInCycle(SVC_CYCLE, s.state) })}
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    s.state === "DELIVERED" ? "bg-green-500 text-white hover:bg-green-600" :
                    s.state === "ARRIVED" ? "bg-yellow-400 text-yellow-900 animate-pulse hover:bg-yellow-500" :
                    "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  }`}
                  title="Click para avanzar estado"
                >
                  {s.state}
                </button>
                <button
                  type="button"
                  onClick={() => deleteService(s.id)}
                  className="text-gray-300 hover:text-red-500"
                  title="Borrar servicio"
                >
                  <Trash2 size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddServiceRow flightId={flight.id} onAdded={() => undefined /* parent refetches via SSE */} />
      </div>
    </div>
  );
}

function BigToggle({
  label,
  state,
  onCycle,
  mapping,
}: {
  label: string;
  state: string;
  onCycle: () => void;
  mapping: Record<string, { label: string; tone: "gray" | "yellow" | "green" }>;
}) {
  const meta = mapping[state] ?? { label: state, tone: "gray" as const };
  const cls =
    meta.tone === "green" ? "bg-green-500 text-white border-green-600 hover:bg-green-600" :
    meta.tone === "yellow" ? "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse hover:bg-yellow-500" :
    "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200";
  return (
    <button
      type="button"
      onClick={onCycle}
      className={`rounded border-2 px-2 py-1.5 text-left transition-colors ${cls}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xs font-bold">{meta.label}</div>
    </button>
  );
}

function AddServiceRow({ flightId, onAdded }: { flightId: string; onAdded: () => void }) {
  const [type, setType] = useState<ServiceType>("CATERING");
  const [phase, setPhase] = useState<"ARRIVAL" | "DEPARTURE" | "BOTH">("DEPARTURE");
  const [customName, setCustomName] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (type === "CUSTOM" && !customName.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/flights/${flightId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, phase, customName: type === "CUSTOM" ? customName : undefined }),
      });
      setCustomName("");
      onAdded();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex items-center gap-1 border-t border-gray-100 bg-gray-50/50 p-1.5">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ServiceType)}
        className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px]"
      >
        {SERVICE_TYPES.map((t) => (
          <option key={t} value={t}>{SERVICE_LABELS[t]}</option>
        ))}
      </select>
      {type === "CUSTOM" && (
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Nombre"
          className="flex-1 rounded border border-gray-200 px-1 py-0.5 text-[11px]"
        />
      )}
      <select
        value={phase}
        onChange={(e) => setPhase(e.target.value as "ARRIVAL" | "DEPARTURE" | "BOTH")}
        className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px]"
      >
        <option value="DEPARTURE">Sal</option>
        <option value="ARRIVAL">Lleg</option>
        <option value="BOTH">Ambos</option>
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={adding || (type === "CUSTOM" && !customName.trim())}
        className="ml-auto inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Plus size={10} /> Añadir
      </button>
    </div>
  );
}

// ─── Notas — colapsable ─────────────────────────────────────────────────────

function NotesPanel({ flight, patchFlight }: { flight: FlightWithRelations; patchFlight: (d: Partial<Flight>) => void }) {
  const [text, setText] = useState(flight.notes ?? "");
  const [dirty, setDirty] = useState(false);

  // If the flight prop changes (different selection), reset
  useEffect(() => {
    setText(flight.notes ?? "");
    setDirty(false);
  }, [flight.id, flight.notes]);

  const save = () => {
    if (!dirty) return;
    patchFlight({ notes: text || null });
    setDirty(false);
  };

  return (
    <div className="px-3 py-2">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        onBlur={save}
        rows={3}
        placeholder="Notas operacionales (visibles a todo el equipo)"
        className="w-full rounded border border-gray-200 p-2 text-[11px] focus:border-blue-400 focus:outline-none"
      />
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{dirty ? "Sin guardar — pulsa fuera o Tab para guardar" : "Guardado"}</span>
        {dirty && (
          <button onClick={save} className="text-blue-600 hover:underline">Guardar ahora</button>
        )}
      </div>
    </div>
  );
}
