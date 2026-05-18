"use client";

import { useState, useCallback, useEffect } from "react";
import { Flight, Service, EventLog, LostItem } from "@/types/compat";
import { X, ChevronDown, ChevronRight, Plus, Trash2, Users, AlertOctagon } from "lucide-react";
import {
  FLIGHT_STATES, FLIGHT_STATE_CONFIG, normalizeFlightState,
  SERVICE_TYPES, SERVICE_LABELS,
  LOST_ITEM_LOCATIONS, LOST_ITEM_LOCATION_LABELS, LOST_ITEM_STATE_CONFIG,
  PAX_ARR_STATES, PAX_ARR_STATE_LABELS,
  PAX_DEP_STATES, PAX_DEP_STATE_LABELS,
  BAGS_ARR_STATES, BAGS_ARR_STATE_LABELS,
  BAGS_DEP_STATES, BAGS_DEP_STATE_LABELS,
  TRANSPORT_TYPES, TRANSPORT_LABELS, TRANSPORT_STATE_LABELS,
  CREW_ARR_LOCATION_LABELS, CREW_DEP_LOCATION_LABELS,
  type ServiceType, type LostItemLocation, type LostItemState,
} from "@/types";
import { GenDecPasteSection } from "@/components/GenDecPasteSection";
import { InlineTextEdit } from "@/components/InlineTextEdit";
import { InlineNumber } from "@/components/InlineNumber";
import { InlineSelect } from "@/components/InlineSelect";
import { QuickTimeEdit } from "@/components/QuickTimeEdit";
import { OperatorBadge } from "@/components/helix/OperatorBadge";
import { AircraftBadge } from "@/components/helix/AircraftBadge";
import { CategoryPill } from "@/components/helix/CategoryPill";
import { RqstChip } from "@/components/helix/RqstChip";
import { PetCount } from "@/components/helix/PetCount";
import { MovementRow } from "@/components/helix/MovementRow";
import { HelixPill } from "@/components/helix/Pill";
import type { FlightCategory } from "@/types/v2";
import type { FboState } from "@/components/helix/Pill";

const PANEL_STATE_MAP: Record<string, FboState> = {
  EXPECTED: "expected",
  ON_BLOCKS: "onblocks",
  PARKED: "parked",
  TURNAROUND: "turn",
  BOARDING: "board",
  OFF_BLOCKS: "departed",
};
function panelVisualState(s: string): FboState {
  return PANEL_STATE_MAP[normalizeFlightState(s)] ?? "expected";
}

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
  /** Open the full PassengerCrewModal at the given direction. */
  onOpenPaxCrew: (direction: "ARRIVAL" | "DEPARTURE") => void;
  /** After flight is deleted (parent should also close panel). */
  onDeleted: () => void;
}

const FUEL_CYCLE = ["NOT_REQUESTED", "REQUESTED", "SERVED"] as const;
const TOILET_CYCLE = ["NOT_REQUESTED", "REQUESTED", "COMPLETED"] as const;
const SVC_CYCLE = ["PENDING", "ARRIVED", "DELIVERED"] as const;

function nextInCycle<T extends readonly string[]>(arr: T, current: string): T[number] {
  const i = arr.indexOf(current as T[number]);
  return arr[(i + 1) % arr.length];
}

export function FlightDetailPanel({ flight, onClose, onMutated, onOpenPaxCrew, onDeleted }: Props) {
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

  const fboState = panelVisualState(flight.state);
  return (
    <aside className="flex h-full w-[440px] flex-col border-l border-gray-300 bg-white shadow-inner">
      {/* HEADER (always visible) — v2 visual parity with VisitCard */}
      <div className="flex items-start justify-between gap-2 border-b border-line bg-bg-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${stateCfg.bg} ${stateCfg.text}`}>
              {stateCfg.label}
            </span>
            <span className="font-bold text-base" style={{ fontFamily: "var(--font-mono)" }}>{flight.callsign}</span>
            <RqstChip rqstNumber={flight.rqstNumber} />
            <AircraftBadge registration={flight.registration} aircraftType={flight.aircraftType} />
            <OperatorBadge callsign={flight.callsign} />
            <CategoryPill
              category={(flight.flightCategory || "COMMERCIAL") as FlightCategory}
              modified={flight.modifiedFlag}
            />
            {flight.isOvernight ? (
              <HelixPill className="hx-pill-overnight">Pernocta</HelixPill>
            ) : null}
            <PetCount count={flight.petCount || 0} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-ink-muted hover:bg-bg-muted hover:text-ink-1"
          title="Cerrar (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* RESUMEN — dos MovementRow apiladas (consistente con VisitCard) */}
      <div className="border-b border-line bg-white hx-visit-timeline">
        <MovementRow
          direction="ARRIVAL"
          time={flight.eta}
          airport={flight.origin}
          state={fboState}
          paxCount={flight.paxArrivalReal ?? flight.paxArrival}
          crewCount={flight.crewArrivalReal ?? flight.crewArrival}
          parking={flight.parking}
        />
        <MovementRow
          direction="DEPARTURE"
          time={flight.etd}
          airport={flight.destination}
          state={fboState}
          paxCount={flight.paxDepartureReal ?? flight.paxDeparture}
          crewCount={flight.crewDepartureReal ?? flight.crewDeparture}
          parking={flight.parking}
        />
      </div>

      {/* SECCIONES COLAPSABLES */}
      <div className="flex-1 overflow-auto">
        <CollapsibleSection title="Datos del vuelo">
          <FlightFieldsPanel flight={flight} patchFlight={patchFlight} />
        </CollapsibleSection>

        <CollapsibleSection title="Datos LLEGADA">
          <ArrivalFieldsPanel flight={flight} patchFlight={patchFlight} />
        </CollapsibleSection>

        <CollapsibleSection title="Datos SALIDA">
          <DepartureFieldsPanel flight={flight} patchFlight={patchFlight} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Servicios"
          defaultOpen
          badge={[
            flight.services.length > 0 ? `${flight.services.length} svc` : null,
            flight.fuelState !== "NOT_REQUESTED" ? "fuel" : null,
            flight.toiletState !== "NOT_REQUESTED" ? "toilet" : null,
          ].filter(Boolean).join(" · ") || undefined}
        >
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

        <CollapsibleSection title="Pasajeros y tripulación">
          <PaxCrewPanel flight={flight} onOpenPaxCrew={onOpenPaxCrew} />
        </CollapsibleSection>

        <CollapsibleSection title="Pegar GenDec (LLEG)">
          <div className="px-3 py-2">
            <GenDecPasteSection
              flightId={flight.id}
              direction="ARRIVAL"
              onImported={onMutated}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Pegar GenDec (SAL)">
          <div className="px-3 py-2">
            <GenDecPasteSection
              flightId={flight.id}
              direction="DEPARTURE"
              onImported={onMutated}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Lost items" badge={flight.lostItems?.length ? String(flight.lostItems.length) : undefined}>
          <LostItemsPanel flight={flight} onMutated={onMutated} />
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

        <CollapsibleSection title="Zona peligrosa">
          <DangerZone flight={flight} onDeleted={onDeleted} />
        </CollapsibleSection>
      </div>
    </aside>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

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

// ─── Form helpers ───────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-28 shrink-0 text-[10px] uppercase font-medium text-gray-500">{label}</span>
      <div className="flex-1 min-w-0 text-xs">{children}</div>
    </div>
  );
}

function FormGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50/30 p-2">
      {title && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{title}</div>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ─── Datos del vuelo (general) ──────────────────────────────────────────────

function FlightFieldsPanel({
  flight, patchFlight,
}: { flight: FlightWithRelations; patchFlight: (d: Partial<Flight>) => void }) {
  return (
    <div className="px-3 py-2 space-y-2">
      <FormGroup>
        <FormRow label="Callsign">
          <InlineTextEdit value={flight.callsign} onSave={(v) => patchFlight({ callsign: v })} />
        </FormRow>
        <FormRow label="Matrícula">
          <InlineTextEdit value={flight.registration} onSave={(v) => patchFlight({ registration: v })} />
        </FormRow>
        <FormRow label="Tipo avión">
          <InlineTextEdit value={flight.aircraftType} onSave={(v) => patchFlight({ aircraftType: v })} />
        </FormRow>
        <FormRow label="Parking">
          <InlineTextEdit value={flight.parking || ""} onSave={(v) => patchFlight({ parking: v || null })} placeholder="tbd" />
        </FormRow>
        <FormRow label="TOBT">
          <QuickTimeEdit value={flight.tobt} onSave={(v) => patchFlight({ tobt: v || null })} />
        </FormRow>
        <FormRow label="Estado">
          <InlineSelect
            value={normalizeFlightState(flight.state)}
            options={FLIGHT_STATES}
            labels={Object.fromEntries(FLIGHT_STATES.map((s) => [s, FLIGHT_STATE_CONFIG[s].label]))}
            onSave={(v) => patchFlight({ state: v })}
          />
        </FormRow>
        <FormRow label="Pernocta">
          <input
            type="checkbox"
            checked={flight.isOvernight}
            onChange={(e) => patchFlight({ isOvernight: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 cursor-pointer"
          />
        </FormRow>
      </FormGroup>
    </div>
  );
}

// ─── Datos LLEGADA ──────────────────────────────────────────────────────────

function ArrivalFieldsPanel({
  flight, patchFlight,
}: { flight: FlightWithRelations; patchFlight: (d: Partial<Flight>) => void }) {
  return (
    <div className="px-3 py-2 space-y-2">
      <FormGroup title="Vuelo">
        <FormRow label="Origen">
          <InlineTextEdit value={flight.origin || ""} onSave={(v) => patchFlight({ origin: v || null })} placeholder="ICAO" />
        </FormRow>
        <FormRow label="Fecha (DD/MM/YY)">
          <InlineTextEdit value={flight.arrivalDate || ""} onSave={(v) => patchFlight({ arrivalDate: v || null })} placeholder="DD/MM/YY" />
        </FormRow>
        <FormRow label="ETA Zulu">
          <QuickTimeEdit value={flight.eta} onSave={(v) => patchFlight({ eta: v || null })} />
        </FormRow>
        <FormRow label="ATA Zulu">
          <QuickTimeEdit value={flight.ata} onSave={(v) => patchFlight({ ata: v || null })} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Tripulación">
        <FormRow label="Crew estimado">
          <InlineNumber value={flight.crewArrival} onSave={(v) => patchFlight({ crewArrival: v ?? 0 })} />
        </FormRow>
        <FormRow label="Crew real">
          <InlineNumber value={flight.crewArrivalReal} onSave={(v) => patchFlight({ crewArrivalReal: v })} nullable />
        </FormRow>
        <FormRow label="Ubicación crew">
          <InlineSelect
            value={flight.crewArrLocation}
            options={Object.keys(CREW_ARR_LOCATION_LABELS) as (keyof typeof CREW_ARR_LOCATION_LABELS)[]}
            labels={CREW_ARR_LOCATION_LABELS}
            onSave={(v) => patchFlight({ crewArrLocation: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Pasajeros">
        <FormRow label="Pax estimado">
          <InlineNumber value={flight.paxArrival} onSave={(v) => patchFlight({ paxArrival: v ?? 0 })} />
        </FormRow>
        <FormRow label="Pax real">
          <InlineNumber value={flight.paxArrivalReal} onSave={(v) => patchFlight({ paxArrivalReal: v })} nullable />
        </FormRow>
        <FormRow label="Estado pax">
          <InlineSelect
            value={flight.paxArrState}
            options={PAX_ARR_STATES}
            labels={PAX_ARR_STATE_LABELS}
            onSave={(v) => patchFlight({ paxArrState: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Equipaje">
        <FormRow label="Maletas facturadas">
          <InlineNumber value={flight.paxArrBagsChecked} onSave={(v) => patchFlight({ paxArrBagsChecked: v ?? 0 })} />
        </FormRow>
        <FormRow label="Maletas cabina">
          <InlineNumber value={flight.paxArrBagsCabin} onSave={(v) => patchFlight({ paxArrBagsCabin: v ?? 0 })} />
        </FormRow>
        <FormRow label="Estado maletas">
          <InlineSelect
            value={flight.paxArrBagsState}
            options={BAGS_ARR_STATES}
            labels={BAGS_ARR_STATE_LABELS}
            onSave={(v) => patchFlight({ paxArrBagsState: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Transporte">
        <FormRow label="Tipo">
          <InlineSelect
            value={flight.paxArrTransportType}
            options={TRANSPORT_TYPES}
            labels={TRANSPORT_LABELS}
            onSave={(v) => patchFlight({ paxArrTransportType: v })}
          />
        </FormRow>
        <FormRow label="Estado">
          <InlineSelect
            value={flight.paxArrTransportState}
            options={["PENDING", "CONFIRMED"] as const}
            labels={TRANSPORT_STATE_LABELS}
            onSave={(v) => patchFlight({ paxArrTransportState: v })}
          />
        </FormRow>
      </FormGroup>
    </div>
  );
}

// ─── Datos SALIDA ───────────────────────────────────────────────────────────

function DepartureFieldsPanel({
  flight, patchFlight,
}: { flight: FlightWithRelations; patchFlight: (d: Partial<Flight>) => void }) {
  return (
    <div className="px-3 py-2 space-y-2">
      <FormGroup title="Vuelo">
        <FormRow label="Destino">
          <InlineTextEdit value={flight.destination || ""} onSave={(v) => patchFlight({ destination: v || null })} placeholder="ICAO" />
        </FormRow>
        <FormRow label="Fecha (DD/MM/YY)">
          <InlineTextEdit value={flight.departureDate || ""} onSave={(v) => patchFlight({ departureDate: v || null })} placeholder="DD/MM/YY" />
        </FormRow>
        <FormRow label="ETD Zulu">
          <QuickTimeEdit value={flight.etd} onSave={(v) => patchFlight({ etd: v || null })} />
        </FormRow>
        <FormRow label="ATD Zulu">
          <QuickTimeEdit value={flight.atd} onSave={(v) => patchFlight({ atd: v || null })} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Tripulación">
        <FormRow label="Crew estimado">
          <InlineNumber value={flight.crewDeparture} onSave={(v) => patchFlight({ crewDeparture: v ?? 0 })} />
        </FormRow>
        <FormRow label="Crew real">
          <InlineNumber value={flight.crewDepartureReal} onSave={(v) => patchFlight({ crewDepartureReal: v })} nullable />
        </FormRow>
        <FormRow label="Ubicación crew">
          <InlineSelect
            value={flight.crewDepLocation}
            options={Object.keys(CREW_DEP_LOCATION_LABELS) as (keyof typeof CREW_DEP_LOCATION_LABELS)[]}
            labels={CREW_DEP_LOCATION_LABELS}
            onSave={(v) => patchFlight({ crewDepLocation: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Pasajeros">
        <FormRow label="Pax estimado">
          <InlineNumber value={flight.paxDeparture} onSave={(v) => patchFlight({ paxDeparture: v ?? 0 })} />
        </FormRow>
        <FormRow label="Pax real">
          <InlineNumber value={flight.paxDepartureReal} onSave={(v) => patchFlight({ paxDepartureReal: v })} nullable />
        </FormRow>
        <FormRow label="Estado pax">
          <InlineSelect
            value={flight.paxDepState}
            options={PAX_DEP_STATES}
            labels={PAX_DEP_STATE_LABELS}
            onSave={(v) => patchFlight({ paxDepState: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Equipaje">
        <FormRow label="Maletas facturadas">
          <InlineNumber value={flight.paxDepBagsChecked} onSave={(v) => patchFlight({ paxDepBagsChecked: v ?? 0 })} />
        </FormRow>
        <FormRow label="Maletas cabina">
          <InlineNumber value={flight.paxDepBagsCabin} onSave={(v) => patchFlight({ paxDepBagsCabin: v ?? 0 })} />
        </FormRow>
        <FormRow label="Estado maletas">
          <InlineSelect
            value={flight.paxDepBagsState}
            options={BAGS_DEP_STATES}
            labels={BAGS_DEP_STATE_LABELS}
            onSave={(v) => patchFlight({ paxDepBagsState: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Transporte">
        <FormRow label="Tipo">
          <InlineSelect
            value={flight.paxDepTransportType}
            options={TRANSPORT_TYPES}
            labels={TRANSPORT_LABELS}
            onSave={(v) => patchFlight({ paxDepTransportType: v })}
          />
        </FormRow>
        <FormRow label="Estado">
          <InlineSelect
            value={flight.paxDepTransportState}
            options={["PENDING", "CONFIRMED"] as const}
            labels={TRANSPORT_STATE_LABELS}
            onSave={(v) => patchFlight({ paxDepTransportState: v })}
          />
        </FormRow>
      </FormGroup>
    </div>
  );
}

// ─── Pasajeros y tripulación ────────────────────────────────────────────────

function PaxCrewPanel({
  flight,
  onOpenPaxCrew,
}: {
  flight: FlightWithRelations;
  onOpenPaxCrew: (direction: "ARRIVAL" | "DEPARTURE") => void;
}) {
  return (
    <div className="px-3 py-2 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <PaxCrewSummary
          label="Llegada"
          crewEst={flight.crewArrival}
          crewReal={flight.crewArrivalReal}
          paxEst={flight.paxArrival}
          paxReal={flight.paxArrivalReal}
          onClick={() => onOpenPaxCrew("ARRIVAL")}
        />
        <PaxCrewSummary
          label="Salida"
          crewEst={flight.crewDeparture}
          crewReal={flight.crewDepartureReal}
          paxEst={flight.paxDeparture}
          paxReal={flight.paxDepartureReal}
          onClick={() => onOpenPaxCrew("DEPARTURE")}
        />
      </div>
      <div className="text-[10px] text-gray-400">
        Click una caja para abrir el modal completo (alta uno-a-uno o el panel grande de GenDec).
      </div>
    </div>
  );
}

function PaxCrewSummary({
  label, crewEst, crewReal, paxEst, paxReal, onClick,
}: {
  label: string; crewEst: number; crewReal: number | null; paxEst: number; paxReal: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 p-2 text-left transition-colors"
    >
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-gray-500">
        <Users size={10} /> {label}
      </div>
      <div className="text-[11px] text-gray-700">
        Crew: <span className="font-semibold">{crewReal ?? crewEst}</span>
        {crewReal !== null && crewReal !== crewEst && <span className="text-gray-400 ml-1">/{crewEst} est</span>}
      </div>
      <div className="text-[11px] text-gray-700">
        Pax: <span className="font-semibold">{paxReal ?? paxEst}</span>
        {paxReal !== null && paxReal !== paxEst && <span className="text-gray-400 ml-1">/{paxEst} est</span>}
      </div>
    </button>
  );
}

// ─── Lost items ─────────────────────────────────────────────────────────────

const LOST_ITEM_CYCLE = ["FOUND", "CLAIMED", "DELIVERED"] as const;

function LostItemsPanel({ flight, onMutated }: { flight: FlightWithRelations; onMutated: () => void }) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LostItemLocation>("AIRCRAFT");
  const [adding, setAdding] = useState(false);

  const items = flight.lostItems ?? [];

  const add = async () => {
    if (!description.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/flights/${flight.id}/lost-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, location }),
      });
      setDescription("");
      onMutated();
    } finally {
      setAdding(false);
    }
  };

  const cycle = async (id: string, current: string) => {
    const next = LOST_ITEM_CYCLE[(LOST_ITEM_CYCLE.indexOf(current as (typeof LOST_ITEM_CYCLE)[number]) + 1) % LOST_ITEM_CYCLE.length];
    await fetch(`/api/lost-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: next }),
    });
    onMutated();
  };

  const remove = async (id: string) => {
    await fetch(`/api/lost-items/${id}`, { method: "DELETE" });
    onMutated();
  };

  return (
    <div className="px-3 py-2 text-xs space-y-2">
      {items.length === 0 ? (
        <div className="text-[11px] text-gray-400 italic">Sin objetos perdidos</div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {items.map((it) => {
            const cfg = LOST_ITEM_STATE_CONFIG[it.state as LostItemState];
            return (
              <li key={it.id} className="flex items-center justify-between gap-2 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-gray-800 truncate">{it.description}</div>
                  <div className="text-[10px] text-gray-400">{LOST_ITEM_LOCATION_LABELS[it.location as LostItemLocation] ?? it.location}</div>
                </div>
                <button
                  type="button"
                  onClick={() => cycle(it.id, it.state)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cfg?.bg ?? "bg-gray-200"} ${cfg?.text ?? "text-gray-700"}`}
                  title="Avanzar estado"
                >
                  {cfg?.label ?? it.state}
                </button>
                <button onClick={() => remove(it.id)} className="text-gray-300 hover:text-red-500" title="Borrar">
                  <Trash2 size={11} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add row */}
      <div className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50/50 p-1.5">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción del objeto"
          className="flex-1 rounded border border-gray-200 px-1 py-0.5 text-[11px]"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as LostItemLocation)}
          className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px]"
        >
          {LOST_ITEM_LOCATIONS.map((l) => (
            <option key={l} value={l}>{LOST_ITEM_LOCATION_LABELS[l]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={adding || !description.trim()}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={10} /> Añadir
        </button>
      </div>
    </div>
  );
}

// ─── Zona peligrosa — borrar vuelo ─────────────────────────────────────────

function DangerZone({ flight, onDeleted }: { flight: FlightWithRelations; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const expected = flight.callsign;
  const matches = confirmText.trim().toUpperCase() === expected.toUpperCase();

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/flights/${flight.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      } else {
        alert(`Error al borrar: HTTP ${res.status}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-3 py-2 space-y-2 text-xs">
      <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2">
        <AlertOctagon size={14} className="shrink-0 text-red-600 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-800">Borrar este vuelo</div>
          <div className="text-[11px] text-red-700/80">
            Elimina el vuelo y TODOS sus servicios, pasajeros, tripulación, eventos y objetos perdidos. No es reversible.
          </div>
        </div>
      </div>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded border border-red-300 bg-white px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
        >
          Quiero borrar el vuelo
        </button>
      ) : (
        <div className="space-y-1">
          <div className="text-[11px] text-gray-600">
            Escribe <span className="font-mono font-bold text-red-700">{expected}</span> para confirmar:
          </div>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded border border-red-300 px-2 py-1 text-[11px] focus:border-red-500 focus:outline-none"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setConfirming(false); setConfirmText(""); }}
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={!matches || deleting}
              className="flex-1 rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
            >
              {deleting ? "Borrando..." : "Borrar para siempre"}
            </button>
          </div>
        </div>
      )}
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
