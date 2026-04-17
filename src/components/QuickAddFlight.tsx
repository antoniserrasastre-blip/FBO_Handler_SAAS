"use client";

import { useState } from "react";
import { Flight } from "@prisma/client";
import { CloseIcon } from "./Icons";

interface QuickAddFlightProps {
  date: Date;
  onCreated: (flight: Flight) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

export function QuickAddFlight({ date, onCreated, onCancel, onError }: QuickAddFlightProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    callsign: "",
    registration: "",
    aircraftType: "",
    origin: "",
    eta: "",
    destination: "",
    etd: "",
    parking: "",
    crewArrival: 0,
    paxArrival: 0,
    crewDeparture: 0,
    paxDeparture: 0,
  });

  function update<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    if (!form.callsign.trim() || !form.registration.trim() || !form.aircraftType.trim()) {
      onError("Indicativo, matricula y tipo son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/flights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, date: date.toISOString() }),
      });
      if (res.ok) {
        const flight = await res.json();
        onCreated(flight);
      } else {
        const data = await res.json();
        onError(data.error || "Error al crear vuelo");
      }
    } catch {
      onError("Sin conexion — vuelo no creado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border-l-4 border-blue-400 bg-blue-50/50 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-800">Nuevo vuelo</h3>
        <button onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-600">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Field label="Indicativo *" value={form.callsign} onChange={(v) => update("callsign", v.toUpperCase())} placeholder="NJE592V" autoFocus />
        <Field label="Matricula *" value={form.registration} onChange={(v) => update("registration", v.toUpperCase())} placeholder="CS-LUB" />
        <Field label="Tipo *" value={form.aircraftType} onChange={(v) => update("aircraftType", v.toUpperCase())} placeholder="CL35" />
        <Field label="Parking" value={form.parking} onChange={(v) => update("parking", v.toUpperCase())} placeholder="P210" />
        <Field label="Origen" value={form.origin} onChange={(v) => update("origin", v.toUpperCase())} placeholder="LOWI" />
        <Field label="ETA" value={form.eta} onChange={(v) => update("eta", v)} placeholder="12:30" />
        <NumField label="Crew Lleg" value={form.crewArrival} onChange={(v) => update("crewArrival", v)} />
        <NumField label="Pax Lleg" value={form.paxArrival} onChange={(v) => update("paxArrival", v)} />
        <Field label="Destino" value={form.destination} onChange={(v) => update("destination", v.toUpperCase())} placeholder="GMME" />
        <Field label="ETD" value={form.etd} onChange={(v) => update("etd", v)} placeholder="14:00" />
        <NumField label="Crew Sal" value={form.crewDeparture} onChange={(v) => update("crewDeparture", v)} />
        <NumField label="Pax Sal" value={form.paxDeparture} onChange={(v) => update("paxDeparture", v)} />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-white">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving || !form.callsign || !form.registration || !form.aircraftType}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Creando..." : "Crear vuelo"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-0.5 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs uppercase placeholder:normal-case placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
}

function NumField({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="mt-0.5 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
}
