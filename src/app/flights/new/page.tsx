"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewFlightPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    callsign: "",
    registration: "",
    aircraftType: "",
    origin: "",
    eta: "",
    destination: "",
    etd: "",
    parking: "",
    tobt: "",
    crewArrival: 0,
    paxArrival: 0,
    crewDeparture: 0,
    paxDeparture: 0,
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.callsign || !form.registration || !form.aircraftType) {
      setError("Indicativo, matricula y tipo de aeronave son obligatorios.");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/flights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json();
      setError(data.error || "Error al crear el vuelo.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Nuevo vuelo</h1>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl bg-white p-6 shadow-sm">
          {/* Flight identification */}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Identificacion del vuelo
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput
                label="Indicativo *"
                placeholder="VJT630"
                value={form.callsign}
                onChange={(v) => updateField("callsign", v)}
              />
              <FormInput
                label="Matricula *"
                placeholder="9H-ILY"
                value={form.registration}
                onChange={(v) => updateField("registration", v)}
              />
              <FormInput
                label="Tipo aeronave *"
                placeholder="CRJ2"
                value={form.aircraftType}
                onChange={(v) => updateField("aircraftType", v)}
              />
            </div>
          </fieldset>

          {/* Arrival info */}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Llegada
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput
                label="Origen (ICAO)"
                placeholder="LOWI"
                value={form.origin}
                onChange={(v) => updateField("origin", v)}
              />
              <FormInput
                label="ETA"
                placeholder="12:30"
                value={form.eta}
                onChange={(v) => updateField("eta", v)}
              />
              <FormInput
                label="Parking"
                placeholder="P232"
                value={form.parking}
                onChange={(v) => updateField("parking", v)}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormNumber
                label="Crew llegada"
                value={form.crewArrival}
                onChange={(v) => updateField("crewArrival", v)}
              />
              <FormNumber
                label="Pax llegada"
                value={form.paxArrival}
                onChange={(v) => updateField("paxArrival", v)}
              />
            </div>
          </fieldset>

          {/* Departure info */}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Salida
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput
                label="Destino (ICAO)"
                placeholder="GMME"
                value={form.destination}
                onChange={(v) => updateField("destination", v)}
              />
              <FormInput
                label="ETD"
                placeholder="14:00"
                value={form.etd}
                onChange={(v) => updateField("etd", v)}
              />
              <FormInput
                label="TOBT"
                placeholder="13:50"
                value={form.tobt}
                onChange={(v) => updateField("tobt", v)}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormNumber
                label="Crew salida"
                value={form.crewDeparture}
                onChange={(v) => updateField("crewDeparture", v)}
              />
              <FormNumber
                label="Pax salida"
                value={form.paxDeparture}
                onChange={(v) => updateField("paxDeparture", v)}
              />
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Crear vuelo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function FormNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
