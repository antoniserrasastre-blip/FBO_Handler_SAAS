"use client";

import { useState } from "react";
import { Flight } from "@prisma/client";
import { CloseIcon } from "./Icons";
import { HelixButton } from "./helix";

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
    <div className="mb-3 rounded-hx-md border border-line border-l-[3px] border-l-brand bg-brand-tint p-3 shadow-hx-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-active">
          Nuevo vuelo
        </h3>
        <button
          onClick={onCancel}
          className="rounded-hx-sm p-1 text-ink-muted hover:bg-bg hover:text-ink-1"
          aria-label="Cerrar"
        >
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
        <HelixButton variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </HelixButton>
        <HelixButton
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={saving || !form.callsign || !form.registration || !form.aircraftType}
        >
          {saving ? "Creando…" : "Crear vuelo"}
        </HelixButton>
      </div>
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const FIELD_CLASS =
  "mt-0.5 block w-full rounded-hx-sm border border-line bg-bg px-2 py-1 font-mono text-xs text-ink-1 uppercase placeholder:normal-case placeholder:text-ink-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint";

function Field({ label, value, onChange, placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={FIELD_CLASS}
      />
    </FieldShell>
  );
}

function NumField({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className={`${FIELD_CLASS} normal-case [font-variant-numeric:tabular-nums]`}
      />
    </FieldShell>
  );
}
