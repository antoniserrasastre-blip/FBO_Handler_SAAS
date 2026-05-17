// VisitCard — v2 redesign of FlightCard.
//
// A Visit is an aircraft's stay in Palma. It bundles up to two Movements
// (ARRIVAL + DEPARTURE) and the services / passengers / crew attached to
// the visit. This card surfaces that mental model directly:
//
//   ┌─ Hero  : Aircraft + Operator + status pills + rqstNumber + pet count
//   ├─ Body  : two MovementRow stacked, hairline timeline between them
//   ├─ Strip : services as ServicePips (click toggles state)
//   └─ People: pax (Movement.DEPARTURE) + crew (CrewAssignment), PII locked
//
// Interactions are deliberately kept lean. Heavy editing (add pax, change
// transport, etc.) routes back to the existing FlightDetailPanel via the
// `onOpenDetail` callback so we don't duplicate the 1200-line FlightCard.
//
// The shape consumed is `FlightView` from the v2 adapter — the same the API
// already returns. That keeps the call sites stable while the UI moves to
// v2 vocabulary.

"use client";

import { useMemo, useState, memo } from "react";
import type { Flight, Service, LostItem, EventLog } from "@/types/compat";
import type { FlightCategory } from "@/types/v2";
import { normalizeFlightState } from "@/types";
import { StatePill, type FboState } from "@/components/helix/Pill";
import { HelixPill } from "@/components/helix/Pill";
import { ServicePip, type ServicePipState } from "@/components/helix/ServicePip";
import { MovementRow } from "@/components/helix/MovementRow";
import { OperatorBadge } from "@/components/helix/OperatorBadge";
import { AircraftBadge } from "@/components/helix/AircraftBadge";
import { CategoryPill } from "@/components/helix/CategoryPill";
import { RqstChip } from "@/components/helix/RqstChip";
import { PetCount } from "@/components/helix/PetCount";
import { PassportField } from "@/components/helix/PassportField";
import { iconForServiceType } from "@/lib/serviceIconMap";
import { nextServiceState, pipStateFor } from "@/lib/serviceCycle";
import { ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { LostItemIcon } from "@/components/Icons";
import { TurnaroundCountdown } from "@/components/TurnaroundCountdown";
import { LastModifiedBadge } from "@/components/LastModifiedBadge";
import { isServiceOverdue } from "@/lib/overdue";
import { InlineNumber } from "@/components/InlineNumber";
import { InlineSelect } from "@/components/InlineSelect";
import { InlineTextEdit } from "@/components/InlineTextEdit";
import {
  FLIGHT_STATES,
  FLIGHT_STATE_CONFIG,
  FUEL_STATES,
  FUEL_LABELS,
  TOILET_STATES,
  TOILET_LABELS,
  SERVICE_TYPES,
  SERVICE_LABELS,
  type ServiceType,
  LOST_ITEM_STATES,
  LOST_ITEM_STATE_CONFIG,
  LOST_ITEM_LOCATIONS,
  LOST_ITEM_LOCATION_LABELS,
  type LostItemLocation,
} from "@/types";
import { Trash2, Plus, X } from "lucide-react";

// ---- State → FboState (visual) ---------------------------------------------
const STATE_MAP: Record<string, FboState> = {
  EXPECTED: "expected",
  ON_BLOCKS: "onblocks",
  PARKED: "parked",
  TURNAROUND: "turn",
  BOARDING: "board",
  OFF_BLOCKS: "departed",
};
function visualState(s: string): FboState {
  return STATE_MAP[normalizeFlightState(s)] ?? "expected";
}

type FlightWithRelations = Flight & {
  services?: Service[];
  lostItems?: LostItem[];
  eventLogs?: (EventLog & { user: { name: string } | null })[];
};

// Pax / crew records as the legacy endpoints return them
interface PaxLite {
  id: string;
  fullName: string;
  direction: string;
  nationality?: string | null;
  passportNumber: string | null;
  status: string;
  verified: boolean;
}
interface CrewLite {
  id: string;
  fullName: string;
  direction: string;
  role: string;
  passportNumber: string | null;
  nationality?: string | null;
}

export interface VisitCardProps {
  flight: FlightWithRelations;        // FlightView projection
  passengers?: PaxLite[];
  crew?: CrewLite[];
  paxSource?: string | null;          // first passenger.source, surfaced on the hero
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onServiceToggle?: (serviceId: string, newState: string) => void;
  onOpenDetail?: (visitId: string) => void;
  onBadgeClick?: (term: string) => void;
  /** Inline-edit handler. Partial update against the FlightView shape. */
  onUpdate?: (id: string, data: Partial<Flight>) => void;
  onAddService?: (flightId: string, type: ServiceType, customName?: string) => void;
  onDeleteService?: (serviceId: string) => void;
  onAddLostItem?: (flightId: string, description: string, location: string) => void;
  onLostItemToggle?: (itemId: string, newState: string) => void;
  onDeleteLostItem?: (itemId: string) => void;
  onDelete?: (id: string) => void;
  /** Operating-day date of the sheet (DD/MM/YY). Used to mark overnight legs. */
  sheetDate?: string | null;
  readOnly?: boolean;
}

export const VisitCard = memo(function VisitCard({
  flight,
  passengers = [],
  crew = [],
  paxSource,
  isSelected = false,
  onSelect,
  onServiceToggle,
  onOpenDetail,
  onBadgeClick,
  onUpdate,
  onAddService,
  onDeleteService,
  onAddLostItem,
  onLostItemToggle,
  onDeleteLostItem,
  onDelete,
  sheetDate,
  readOnly = false,
}: VisitCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [newLostDesc, setNewLostDesc] = useState("");
  const [newLostLoc, setNewLostLoc] = useState<LostItemLocation>("AIRCRAFT");
  const lostItems = flight.lostItems || [];

  const isCancelled = flight.flightCategory === "CANCELLED";
  const services = flight.services || [];

  // Pernocta: use the persisted flag and fall back to date comparison so
  // legacy data (imports before isOvernight existed) still surfaces it.
  const isOvernight =
    flight.isOvernight ||
    Boolean(flight.arrivalDate && flight.departureDate && flight.arrivalDate !== flight.departureDate);

  const arrState = visualState(flight.state);     // FlightView surfaces a single state
  const depState = visualState(flight.state);

  // Pick a meaningful "primary" state for the hero. If departed already,
  // celebrate departure; otherwise use the most-active leg.
  const primaryFboState: FboState =
    normalizeFlightState(flight.state) === "OFF_BLOCKS" ? "departed" :
    normalizeFlightState(flight.state) === "BOARDING"   ? "board" :
    arrState;

  const fuelPip = useMemo<ServicePipState>(() => {
    if (flight.fuelState === "SERVED") return "ok";
    if (flight.fuelState === "REQUESTED") return "req";
    return "no";
  }, [flight.fuelState]);

  const toiletPip = useMemo<ServicePipState>(() => {
    if (flight.toiletState === "COMPLETED") return "ok";
    if (flight.toiletState === "REQUESTED") return "req";
    return "no";
  }, [flight.toiletState]);

  const arrivalPaxDep = useMemo(
    () => passengers.filter((p) => p.direction === "ARRIVAL"),
    [passengers]
  );
  const departurePax = useMemo(
    () => passengers.filter((p) => p.direction !== "ARRIVAL"),
    [passengers]
  );
  const arrivalCrew = useMemo(
    () => crew.filter((c) => c.direction === "ARRIVAL"),
    [crew]
  );
  const departureCrew = useMemo(
    () => crew.filter((c) => c.direction !== "ARRIVAL"),
    [crew]
  );

  return (
    <article
      className={`hx-visit-card ${isSelected ? "selected" : ""} ${isCancelled ? "cancelled" : ""}`}
      onClick={() => onSelect?.(flight.id)}
    >
      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <div className="hero">
        <StatePill state={primaryFboState} />
        <span
          style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "1.05em", cursor: flight.callsign ? "copy" : "default" }}
          onClick={(e) => {
            if (!flight.callsign) return;
            e.stopPropagation();
            navigator.clipboard?.writeText(flight.callsign);
          }}
          title={flight.callsign ? "Click para copiar indicativo" : undefined}
        >
          {flight.callsign || "—"}
        </span>
        <RqstChip rqstNumber={flight.rqstNumber} />
        <TurnaroundCountdown eta={flight.eta} etd={flight.etd} flightState={flight.state} />
        <AircraftBadge
          registration={flight.registration}
          aircraftType={flight.aircraftType}
          onSelectRegistration={(reg) => navigator.clipboard?.writeText(reg)}
        />
        <OperatorBadge callsign={flight.callsign} onSelect={onBadgeClick} />

        <div className="badges">
          <CategoryPill
            category={(flight.flightCategory || "COMMERCIAL") as FlightCategory}
            modified={flight.modifiedFlag}
          />
          {isOvernight ? (
            <HelixPill className="hx-pill-overnight">Pernocta</HelixPill>
          ) : null}
          <PetCount count={flight.petCount || 0} />
          {paxSource && paxSource !== "MANUAL" ? (
            <span className={`hx-pill hx-pill-source-${paxSource.toLowerCase()}`} title={`Datos de ${paxSource}`}>
              {paxSource}
            </span>
          ) : null}
          {flight.notes ? (
            <span className="hx-pill hx-pill-note" title={flight.notes}>
              <StickyNote size={10} /> Nota
            </span>
          ) : null}
          {(() => {
            const pending = (flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length;
            if (pending === 0) return null;
            return (
              <span className="hx-pill hx-pill-lost" title={`${pending} objeto${pending !== 1 ? "s" : ""} pendiente${pending !== 1 ? "s" : ""}`}>
                <LostItemIcon size={10} /> {pending} objeto{pending !== 1 ? "s" : ""}
              </span>
            );
          })()}
        </div>

        <div className="spacer" />

        <button
          type="button"
          className="hx-btn hx-btn-ghost hx-btn-sm"
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          title={expanded ? "Contraer" : "Ver personas"}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {departurePax.length + arrivalPaxDep.length} pax · {departureCrew.length + arrivalCrew.length} crew
        </button>
        {!readOnly && onOpenDetail ? (
          <button
            type="button"
            className="hx-btn hx-btn-secondary hx-btn-sm"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(flight.id); }}
          >
            Editar
          </button>
        ) : null}
      </div>

      {/* ─── Progress bar (state-driven) ──────────────────────────── */}
      {(() => {
        const cfg = FLIGHT_STATE_CONFIG[normalizeFlightState(flight.state)];
        const pct = Math.max(cfg?.progress ?? 0, 2);
        return (
          <div className="hx-progress-bar" aria-hidden="true">
            <div style={{ width: `${pct}%`, backgroundColor: cfg?.color }} />
          </div>
        );
      })()}

      {/* ─── Body: two MovementRow ────────────────────────────────── */}
      <div className="hx-visit-timeline">
        <MovementRow
          direction="ARRIVAL"
          time={flight.eta}
          airport={flight.origin}
          state={arrState}
          paxCount={flight.paxArrival}
          crewCount={flight.crewArrival}
          parking={flight.parking}
          aircraftType={flight.aircraftType}
          cancelled={isCancelled}
          date={flight.arrivalDate}
          sheetDate={sheetDate}
          onTimeSave={onUpdate && !readOnly ? (v) => onUpdate(flight.id, { eta: v }) : undefined}
        />
        <MovementRow
          direction="DEPARTURE"
          time={flight.etd}
          airport={flight.destination}
          state={depState}
          paxCount={flight.paxDeparture}
          crewCount={flight.crewDeparture}
          parking={flight.parking}
          aircraftType={flight.aircraftType}
          cancelled={isCancelled}
          fuelState={fuelPip}
          toiletState={toiletPip}
          date={flight.departureDate}
          sheetDate={sheetDate}
          onTimeSave={onUpdate && !readOnly ? (v) => onUpdate(flight.id, { etd: v }) : undefined}
        />
      </div>

      {/* ─── Services strip ────────────────────────────────────────── */}
      {services.length > 0 && (
        <div className="services-strip">
          {services.map((s) => {
            const overdue = isServiceOverdue(s);
            return (
              <button
                key={s.id}
                type="button"
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!onServiceToggle) return;
                  onServiceToggle(s.id, nextServiceState(s.state));
                }}
                className={overdue ? "service-pip-btn overdue" : "service-pip-btn"}
                style={{ background: "transparent", border: 0, padding: 0, cursor: readOnly ? "default" : "pointer" }}
                title={`${s.customName || s.type}${s.reference ? ` · #${s.reference}` : ""}${s.target ? ` · ${s.target}` : ""}${overdue ? " · ¡Retrasado!" : ""}`}
              >
                <ServicePip
                  service={iconForServiceType(s.type)}
                  state={pipStateFor(s.state)}
                  size="sm"
                />
              </button>
            );
          })}
          {services.length > 0 ? (
            <span className="text-xs text-ink-muted ml-2">
              {services.filter((s) => s.state === "DELIVERED").length}/{services.length} servidos
            </span>
          ) : null}
        </div>
      )}

      {/* ─── Inline edit strip (expanded) ──────────────────────────── */}
      {expanded && !readOnly && onUpdate && (
        <div className="edit-strip" onClick={(e) => e.stopPropagation()}>
          <div className="edit-group">
            <h3 className="edit-group-title">Operación</h3>
            <label className="edit-field">
              <span className="edit-field-label">Estado</span>
              <InlineSelect
                value={normalizeFlightState(flight.state)}
                options={FLIGHT_STATES}
                labels={Object.fromEntries(
                  FLIGHT_STATES.map((s) => [s, FLIGHT_STATE_CONFIG[s]?.label ?? s])
                )}
                onSave={(v) => onUpdate(flight.id, { state: v })}
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Combustible</span>
              <InlineSelect
                value={flight.fuelState}
                options={FUEL_STATES}
                labels={FUEL_LABELS}
                onSave={(v) => {
                  const data: Partial<Flight> & Record<string, unknown> = { fuelState: v };
                  if (v === "REQUESTED") data.fuelRequestedAt = new Date().toISOString();
                  if (v === "SERVED") data.fuelServedAt = new Date().toISOString();
                  onUpdate(flight.id, data);
                }}
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Lavabos</span>
              <InlineSelect
                value={flight.toiletState}
                options={TOILET_STATES}
                labels={TOILET_LABELS}
                onSave={(v) => {
                  const data: Partial<Flight> & Record<string, unknown> = { toiletState: v };
                  if (v === "REQUESTED") data.toiletRequestedAt = new Date().toISOString();
                  if (v === "COMPLETED") data.toiletCompletedAt = new Date().toISOString();
                  onUpdate(flight.id, data);
                }}
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Parking</span>
              <InlineTextEdit
                value={flight.parking || ""}
                onSave={(v) => onUpdate(flight.id, { parking: v || null })}
                placeholder="—"
                stopPropagation
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">TOBT</span>
              <InlineTextEdit
                value={flight.tobt || ""}
                onSave={(v) => onUpdate(flight.id, { tobt: v || null })}
                placeholder="HH:MM"
                stopPropagation
              />
            </label>
            <label className="edit-field edit-field-wide">
              <span className="edit-field-label">Notas</span>
              <InlineTextEdit
                value={flight.notes || ""}
                onSave={(v) => onUpdate(flight.id, { notes: v || null })}
                placeholder="—"
                stopPropagation
              />
            </label>
          </div>
          <div className="edit-group">
            <h3 className="edit-group-title">Llegada</h3>
            <label className="edit-field">
              <span className="edit-field-label">Pax llegada</span>
              <InlineNumber value={flight.paxArrival} onSave={(v) => onUpdate(flight.id, { paxArrival: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Crew llegada</span>
              <InlineNumber value={flight.crewArrival} onSave={(v) => onUpdate(flight.id, { crewArrival: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Maletas bodega llegada</span>
              <InlineNumber value={flight.paxArrBagsChecked} onSave={(v) => onUpdate(flight.id, { paxArrBagsChecked: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Maletas cabina llegada</span>
              <InlineNumber value={flight.paxArrBagsCabin} onSave={(v) => onUpdate(flight.id, { paxArrBagsCabin: v ?? 0 })} />
            </label>
          </div>
          <div className="edit-group">
            <h3 className="edit-group-title">Salida</h3>
            <label className="edit-field">
              <span className="edit-field-label">Pax salida</span>
              <InlineNumber value={flight.paxDeparture} onSave={(v) => onUpdate(flight.id, { paxDeparture: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Crew salida</span>
              <InlineNumber value={flight.crewDeparture} onSave={(v) => onUpdate(flight.id, { crewDeparture: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Maletas bodega salida</span>
              <InlineNumber value={flight.paxDepBagsChecked} onSave={(v) => onUpdate(flight.id, { paxDepBagsChecked: v ?? 0 })} />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Maletas cabina salida</span>
              <InlineNumber value={flight.paxDepBagsCabin} onSave={(v) => onUpdate(flight.id, { paxDepBagsCabin: v ?? 0 })} />
            </label>
          </div>

          {/* Servicios — add / remove */}
          <div className="edit-group edit-group-wide">
            <h3 className="edit-group-title">Servicios</h3>
            <ul className="edit-service-list">
              {services.map((s) => {
                const label = s.customName || SERVICE_LABELS[s.type as ServiceType] || s.type;
                return (
                  <li key={s.id} className="edit-service-row">
                    <span>{label}</span>
                    {onDeleteService ? (
                      <button
                        type="button"
                        aria-label={`Eliminar ${label}`}
                        className="hx-btn hx-btn-ghost hx-btn-sm"
                        onClick={() => onDeleteService(s.id)}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {onAddService ? (
              <div className="edit-service-add">
                <button
                  type="button"
                  className="hx-btn hx-btn-ghost hx-btn-sm"
                  onClick={() => setShowServicePicker((x) => !x)}
                >
                  <Plus size={12} /> Añadir servicio
                </button>
                {showServicePicker ? (
                  <div className="edit-service-picker">
                    {SERVICE_TYPES.filter((t) => t !== "CUSTOM").map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="hx-btn hx-btn-ghost hx-btn-sm"
                        onClick={() => {
                          onAddService(flight.id, t);
                          setShowServicePicker(false);
                        }}
                      >
                        {SERVICE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Lost items — add / state / remove */}
          {(onAddLostItem || onLostItemToggle || onDeleteLostItem) && (
            <div className="edit-group edit-group-wide">
              <h3 className="edit-group-title">Objetos perdidos</h3>
              <ul className="edit-service-list">
                {lostItems.map((item) => (
                  <li key={item.id} className="edit-service-row">
                    <span>{item.description}</span>
                    {onLostItemToggle ? (
                      <select
                        value={item.state}
                        onChange={(e) => onLostItemToggle(item.id, e.target.value)}
                        className="text-xs rounded border border-line bg-transparent px-1"
                      >
                        {LOST_ITEM_STATES.map((s) => (
                          <option key={s} value={s}>
                            {LOST_ITEM_STATE_CONFIG[s]?.label ?? s}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {onDeleteLostItem ? (
                      <button
                        type="button"
                        aria-label={`Eliminar ${item.description}`}
                        className="hx-btn hx-btn-ghost hx-btn-sm"
                        onClick={() => onDeleteLostItem(item.id)}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {onAddLostItem ? (
                <div className="edit-service-add">
                  <input
                    type="text"
                    value={newLostDesc}
                    onChange={(e) => setNewLostDesc(e.target.value)}
                    placeholder="Descripción del objeto"
                    className="rounded border border-line px-2 py-1 text-xs"
                  />
                  <select
                    value={newLostLoc}
                    onChange={(e) => setNewLostLoc(e.target.value as LostItemLocation)}
                    className="text-xs rounded border border-line bg-transparent px-1"
                  >
                    {LOST_ITEM_LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {LOST_ITEM_LOCATION_LABELS[l]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Añadir objeto"
                    className="hx-btn hx-btn-ghost hx-btn-sm"
                    disabled={!newLostDesc.trim()}
                    onClick={() => {
                      onAddLostItem(flight.id, newLostDesc.trim(), newLostLoc);
                      setNewLostDesc("");
                    }}
                  >
                    <Plus size={12} /> Añadir objeto
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Danger zone — delete flight */}
          {onDelete ? (
            <div className="edit-group edit-group-wide">
              <button
                type="button"
                className="hx-btn hx-btn-ghost hx-btn-sm danger"
                onClick={() => {
                  if (window.confirm(`Eliminar vuelo ${flight.registration} (${flight.callsign})?`)) {
                    onDelete(flight.id);
                  }
                }}
              >
                <Trash2 size={12} /> Eliminar vuelo
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── People strip (expanded) ──────────────────────────────── */}
      {expanded && (
        <div className="people-strip" onClick={(e) => e.stopPropagation()}>

          <div className="pcol">
            <div className="h">Pasajeros · {departurePax.length}</div>
            <ul>
              {departurePax.length === 0 && (
                <li className="text-xs italic text-ink-muted">Sin datos importados.</li>
              )}
              {departurePax.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="text-ink-1">{p.fullName}</span>
                  {p.status === "NO_SHOW" ? (
                    <HelixPill tone="danger">no-show</HelixPill>
                  ) : null}
                  {p.status === "ADDED" ? (
                    <HelixPill tone="info">añadido</HelixPill>
                  ) : null}
                  <PassportField value={p.passportNumber} source={paxSource} size="sm" />
                </li>
              ))}
            </ul>
          </div>
          <div className="pcol">
            <div className="h">Tripulación · {departureCrew.length}</div>
            <ul>
              {departureCrew.length === 0 && (
                <li className="text-xs italic text-ink-muted">Sin tripulación.</li>
              )}
              {departureCrew.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="text-ink-1">{c.fullName}</span>
                  <HelixPill tone="brand">{roleLabel(c.role)}</HelixPill>
                  <PassportField value={c.passportNumber} source={paxSource} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ─── Footer: last modified ───────────────────────────────── */}
      {flight.eventLogs && flight.eventLogs.length > 0 ? (
        <div className="card-footer" onClick={(e) => e.stopPropagation()}>
          <LastModifiedBadge log={flight.eventLogs[0]} />
        </div>
      ) : null}
    </article>
  );
});

function roleLabel(role: string): string {
  if (role === "CAPTAIN") return "PIC";
  if (role === "FIRST_OFFICER") return "SIC";
  if (role === "CABIN_CREW") return "FA";
  return role;
}
