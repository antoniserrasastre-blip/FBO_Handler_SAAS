"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ParsedFlight } from "@/lib/pdfParser";

interface ParseResult {
  date: string;
  flights: ParsedFlight[];
  errors: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState("");
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());

  async function handleFileUpload(file: File) {
    setError("");
    setResult(null);
    setSaveResult(null);
    setParsing(true);

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al procesar el PDF");
        return;
      }

      const data: ParseResult = await res.json();
      setResult(data);
      // Select all flights by default
      setSelectedFlights(new Set(data.flights.map((_, i) => i)));
    } catch {
      setError("Error de conexion al procesar el PDF");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmImport() {
    if (!result) return;

    setSaving(true);
    setError("");

    const flightsToImport = result.flights.filter((_, i) => selectedFlights.has(i));

    try {
      const res = await fetch("/api/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: result.date,
          flights: flightsToImport,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al guardar los vuelos");
        return;
      }

      const data = await res.json();
      setSaveResult(data);
    } catch {
      setError("Error de conexion al guardar");
    } finally {
      setSaving(false);
    }
  }

  function toggleFlight(index: number) {
    setSelectedFlights((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (!result) return;
    if (selectedFlights.size === result.flights.length) {
      setSelectedFlights(new Set());
    } else {
      setSelectedFlights(new Set(result.flights.map((_, i) => i)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Importar Orden del Dia</h1>
            <p className="mt-1 text-sm text-gray-500">
              Sube el PDF de Cybermax para importar los vuelos del dia
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Volver al panel
          </button>
        </div>

        {/* Upload area */}
        {!result && !saveResult && (
          <div
            className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center transition-colors hover:border-blue-400"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-400", "bg-blue-50"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-blue-400", "bg-blue-50"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-blue-400", "bg-blue-50");
              const file = e.dataTransfer.files[0];
              if (file?.type === "application/pdf" || file?.name.endsWith(".pdf") || file?.name.endsWith(".PDF")) {
                handleFileUpload(file);
              } else {
                setError("Solo se aceptan archivos PDF");
              }
            }}
          >
            {parsing ? (
              <div className="text-gray-500">
                <div className="mb-2 text-lg">Procesando PDF...</div>
                <div className="text-sm">Extrayendo vuelos del documento</div>
              </div>
            ) : (
              <>
                <div className="mb-4 text-4xl text-gray-300">📄</div>
                <p className="text-gray-600">
                  Arrastra el PDF de Cybermax aqui o{" "}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    selecciona un archivo
                  </button>
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  Formato: &quot;Orden del dia&quot; de Cybermax (.pdf)
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Puedes subir el PDF actualizado varias veces — los vuelos existentes se actualizan automaticamente.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.PDF"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Parse errors */}
        {result && result.errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-700">Avisos del parser:</p>
            {result.errors.map((e, i) => (
              <p key={i} className="mt-1 text-xs text-amber-600">{e}</p>
            ))}
          </div>
        )}

        {/* Preview table */}
        {result && result.flights.length > 0 && !saveResult && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                {result.flights.length} vuelos encontrados — Fecha: {result.date}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {selectedFlights.size} seleccionados
                </span>
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  {selectedFlights.size === result.flights.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedFlights.size === result.flights.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2">Indicativo</th>
                    <th className="px-3 py-2">Matricula</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Origen</th>
                    <th className="px-3 py-2">ETA</th>
                    <th className="px-3 py-2">Destino</th>
                    <th className="px-3 py-2">ETD</th>
                    <th className="px-3 py-2">Parking</th>
                    <th className="px-3 py-2">Crew</th>
                    <th className="px-3 py-2">Pax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.flights.map((f, i) => (
                    <tr
                      key={i}
                      className={`${selectedFlights.has(i) ? "bg-white" : "bg-gray-50 opacity-50"} cursor-pointer hover:bg-blue-50`}
                      onClick={() => toggleFlight(i)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedFlights.has(i)}
                          onChange={() => toggleFlight(i)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{f.callsign}</td>
                      <td className="px-3 py-2 text-gray-600">{f.registration}</td>
                      <td className="px-3 py-2 text-gray-600">{f.aircraftType}</td>
                      <td className="px-3 py-2 text-gray-600">{f.origin}</td>
                      <td className="px-3 py-2 text-gray-600">{f.eta}</td>
                      <td className="px-3 py-2 text-gray-600">{f.destination}</td>
                      <td className="px-3 py-2 text-gray-600">{f.etd}</td>
                      <td className="px-3 py-2 text-gray-600">{f.parking}</td>
                      <td className="px-3 py-2 text-gray-600">{f.crewArrival}/{f.crewDeparture}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {f.paxArrival}/{f.paxDeparture}
                        {f.paxDeparture > 5 && (
                          <span className="ml-1 text-red-500 font-bold">⚠</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => { setResult(null); setError(""); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={saving || selectedFlights.size === 0}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                {saving
                  ? "Importando..."
                  : `Importar ${selectedFlights.size} vuelo${selectedFlights.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* Success result */}
        {saveResult && (
          <div className="mt-6 rounded-xl bg-white p-8 text-center shadow-sm">
            <div className="mb-3 text-4xl">✓</div>
            <h2 className="text-lg font-bold text-gray-900">Importacion completada</h2>
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-semibold text-green-600">{saveResult.created}</span> vuelos
                creados
              </p>
              {saveResult.updated > 0 && (
                <p>
                  <span className="font-semibold text-blue-600">{saveResult.updated}</span> vuelos
                  actualizados
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => {
                  setResult(null);
                  setSaveResult(null);
                  setError("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Importar otro PDF
              </button>
              <button
                onClick={() => router.push("/")}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
              >
                Ir al panel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
