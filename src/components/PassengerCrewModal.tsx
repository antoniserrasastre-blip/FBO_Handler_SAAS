"use client";

import { useState, useEffect, useCallback } from "react";
import { Passenger, CrewMember } from "@prisma/client";
import { Modal } from "./Modal";
import { CloseIcon } from "./Icons";
import { GenDecPasteSection } from "./GenDecPasteSection";
import {
  PASSENGER_STATUS_CONFIG,
  PassengerStatus,
  CREW_ROLES,
  CREW_ROLE_LABELS,
  CrewRole,
  DIRECTION_LABELS,
  Direction,
} from "@/types";

interface PassengerCrewModalProps {
  isOpen: boolean;
  onClose: () => void;
  flightId: string;
  direction: Direction;
  flightLabel: string; // e.g. "VJT630 (EC-MXQ)"
}

export function PassengerCrewModal({ isOpen, onClose, flightId, direction, flightLabel }: PassengerCrewModalProps) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [crewRes, paxRes] = await Promise.all([
      fetch(`/api/flights/${flightId}/crew`),
      fetch(`/api/flights/${flightId}/passengers`),
    ]);
    if (crewRes.ok) {
      const all: CrewMember[] = await crewRes.json();
      setCrew(all.filter((c) => c.direction === direction));
    }
    if (paxRes.ok) {
      const all: Passenger[] = await paxRes.json();
      setPassengers(all.filter((p) => p.direction === direction));
    }
    setLoading(false);
  }, [flightId, direction]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const handleAddCrew = async (data: Partial<CrewMember>) => {
    const res = await fetch(`/api/flights/${flightId}/crew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, direction }),
    });
    if (res.ok) fetchData();
  };

  const handleUpdateCrew = async (id: string, data: Partial<CrewMember>) => {
    setCrew((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    const res = await fetch(`/api/crew/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) fetchData();
  };

  const handleDeleteCrew = async (id: string) => {
    const res = await fetch(`/api/crew/${id}`, { method: "DELETE" });
    if (res.ok) setCrew((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddPassenger = async (data: Partial<Passenger>) => {
    const res = await fetch(`/api/flights/${flightId}/passengers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, direction }),
    });
    if (res.ok) fetchData();
  };

  const handleUpdatePassenger = async (id: string, data: Partial<Passenger>) => {
    setPassengers((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    const res = await fetch(`/api/passengers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) fetchData();
  };

  const handleDeletePassenger = async (id: string) => {
    const res = await fetch(`/api/passengers/${id}`, { method: "DELETE" });
    if (res.ok) setPassengers((prev) => prev.filter((p) => p.id !== id));
  };

  const confirmedPax = passengers.filter((p) => p.status !== "NO_SHOW").length;
  const noShowPax = passengers.filter((p) => p.status === "NO_SHOW").length;
  const addedPax = passengers.filter((p) => p.status === "ADDED").length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${DIRECTION_LABELS[direction]} — ${flightLabel}`} wide>
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Cargando...</div>
      ) : (
        <div className="space-y-6">
          {/* GenDec paste — extract crew + pax from email text */}
          <GenDecPasteSection flightId={flightId} direction={direction} onImported={fetchData} />

          {/* Crew Section */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Tripulacion ({crew.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1 pr-2 font-medium">Nombre</th>
                    <th className="pb-1 pr-2 font-medium">Rol</th>
                    <th className="pb-1 pr-2 font-medium">Pasaporte</th>
                    <th className="pb-1 pr-2 font-medium">Nacionalidad</th>
                    <th className="pb-1 pr-2 font-medium">F. Nacimiento</th>
                    <th className="pb-1 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {crew.map((c) => (
                    <CrewRow key={c.id} member={c} onUpdate={handleUpdateCrew} onDelete={handleDeleteCrew} />
                  ))}
                </tbody>
              </table>
            </div>
            <AddCrewRow onAdd={handleAddCrew} />
          </div>

          {/* Passenger Section */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Pasajeros ({passengers.length})
              {noShowPax > 0 && <span className="ml-1 text-red-500">({noShowPax} no-show)</span>}
              {addedPax > 0 && <span className="ml-1 text-blue-500">({addedPax} anadidos)</span>}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-400">
                    <th className="pb-1 pr-2 font-medium">Estado</th>
                    <th className="pb-1 pr-2 font-medium">Nombre</th>
                    <th className="pb-1 pr-2 font-medium">Genero</th>
                    <th className="pb-1 pr-2 font-medium">Pasaporte</th>
                    <th className="pb-1 pr-2 font-medium">Nacionalidad</th>
                    <th className="pb-1 pr-2 font-medium">F. Nacimiento</th>
                    <th className="pb-1 pr-2 font-medium">Verificado</th>
                    <th className="pb-1 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((p) => (
                    <PassengerRow key={p.id} passenger={p} onUpdate={handleUpdatePassenger} onDelete={handleDeletePassenger} />
                  ))}
                </tbody>
              </table>
            </div>
            <AddPassengerRow onAdd={handleAddPassenger} />
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-500">
            Crew: {crew.length} | Pax: {confirmedPax} activos
            {noShowPax > 0 ? `, ${noShowPax} no-show` : ""}
            {addedPax > 0 ? `, ${addedPax} anadidos` : ""}
          </div>
        </div>
      )}
    </Modal>
  );
}

// --- Row Components ---

function CrewRow({ member, onUpdate, onDelete }: {
  member: CrewMember;
  onUpdate: (id: string, data: Partial<CrewMember>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="py-1.5 pr-2">
        <InlineEdit value={member.fullName} onSave={(v) => onUpdate(member.id, { fullName: v })} />
      </td>
      <td className="py-1.5 pr-2">
        <select
          value={member.role}
          onChange={(e) => onUpdate(member.id, { role: e.target.value })}
          className="rounded border border-transparent px-1 py-0.5 text-xs hover:border-gray-200 focus:border-blue-400 focus:outline-none"
        >
          {CREW_ROLES.map((r) => (
            <option key={r} value={r}>{CREW_ROLE_LABELS[r]}</option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={member.passportNumber || ""} onSave={(v) => onUpdate(member.id, { passportNumber: v })} placeholder="---" />
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={member.nationality || ""} onSave={(v) => onUpdate(member.id, { nationality: v })} placeholder="---" />
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={member.dateOfBirth || ""} onSave={(v) => onUpdate(member.id, { dateOfBirth: v })} placeholder="DD/MM/AAAA" />
      </td>
      <td className="py-1.5">
        <button onClick={() => onDelete(member.id)} className="text-red-400 hover:text-red-600"><CloseIcon size={12} /></button>
      </td>
    </tr>
  );
}

function PassengerRow({ passenger, onUpdate, onDelete }: {
  passenger: Passenger;
  onUpdate: (id: string, data: Partial<Passenger>) => void;
  onDelete: (id: string) => void;
}) {
  const statusConfig = PASSENGER_STATUS_CONFIG[passenger.status as PassengerStatus] || PASSENGER_STATUS_CONFIG.CONFIRMED;
  const isNoShow = passenger.status === "NO_SHOW";

  const cycleStatus = () => {
    const next = isNoShow ? "CONFIRMED" : "NO_SHOW";
    onUpdate(passenger.id, { status: next });
  };

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50 ${isNoShow ? "opacity-50" : ""}`}>
      <td className="py-1.5 pr-2">
        <button
          onClick={cycleStatus}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusConfig.bg} ${statusConfig.text}`}
          title={isNoShow ? "Marcar como confirmado" : "Marcar como no-show"}
        >
          {statusConfig.label}
        </button>
      </td>
      <td className={`py-1.5 pr-2 ${isNoShow ? "line-through" : ""}`}>
        <InlineEdit value={passenger.fullName} onSave={(v) => onUpdate(passenger.id, { fullName: v })} />
      </td>
      <td className="py-1.5 pr-2">
        <button
          onClick={() => onUpdate(passenger.id, { gender: passenger.gender === "M" ? "F" : "M" })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${passenger.gender === "F" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}
        >
          {passenger.gender || "?"}
        </button>
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={passenger.passportNumber || ""} onSave={(v) => onUpdate(passenger.id, { passportNumber: v })} placeholder="---" />
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={passenger.nationality || ""} onSave={(v) => onUpdate(passenger.id, { nationality: v })} placeholder="---" />
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit value={passenger.dateOfBirth || ""} onSave={(v) => onUpdate(passenger.id, { dateOfBirth: v })} placeholder="DD/MM/AAAA" />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          checked={passenger.verified}
          onChange={(e) => onUpdate(passenger.id, { verified: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className="py-1.5">
        <button onClick={() => onDelete(passenger.id)} className="text-red-400 hover:text-red-600"><CloseIcon size={12} /></button>
      </td>
    </tr>
  );
}

function AddCrewRow({ onAdd }: { onAdd: (data: Partial<CrewMember>) => void }) {
  const [show, setShow] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("OTHER");

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="mt-2 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500">
        + Anadir tripulante
      </button>
    );
  }

  const submit = () => {
    if (fullName.trim()) {
      onAdd({ fullName: fullName.trim(), role });
      setFullName(""); setRole("OTHER"); setShow(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo..." className="min-w-[150px] flex-1 rounded border border-gray-200 px-2 py-1 text-xs" autoFocus onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs">
        {CREW_ROLES.map((r) => <option key={r} value={r}>{CREW_ROLE_LABELS[r]}</option>)}
      </select>
      <button onClick={submit} disabled={!fullName.trim()} className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50">Anadir</button>
      <button onClick={() => { setShow(false); setFullName(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
    </div>
  );
}

function AddPassengerRow({ onAdd }: { onAdd: (data: Partial<Passenger>) => void }) {
  const [show, setShow] = useState(false);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("M");

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="mt-2 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500">
        + Anadir pasajero
      </button>
    );
  }

  const submit = () => {
    if (fullName.trim()) {
      onAdd({ fullName: fullName.trim(), gender, status: "ADDED" });
      setFullName(""); setGender("M"); setShow(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo..." className="min-w-[150px] flex-1 rounded border border-gray-200 px-2 py-1 text-xs" autoFocus onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <button onClick={() => setGender(gender === "M" ? "F" : "M")} className={`rounded px-2 py-1 text-xs font-bold ${gender === "F" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>{gender}</button>
      <button onClick={submit} disabled={!fullName.trim()} className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50">Anadir</button>
      <button onClick={() => { setShow(false); setFullName(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
    </div>
  );
}

function InlineEdit({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (!editing) {
    return (
      <span
        onClick={() => { setLocal(value); setEditing(true); }}
        className="cursor-text rounded px-1 py-0.5 hover:bg-blue-50"
        title="Click para editar"
      >
        {value || <span className="text-gray-300">{placeholder || "---"}</span>}
      </span>
    );
  }

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onSave(local);
        setEditing(false);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
      autoFocus
      className="w-full rounded border border-blue-400 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  );
}
