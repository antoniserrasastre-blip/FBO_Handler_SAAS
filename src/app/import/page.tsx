"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ParsedFlight } from "@/lib/pdfParser";
import { SERVICE_LABELS, SERVICE_ICONS, ServiceType } from "@/types";

type Tab = "pdf" | "extras";

interface ParseResult {
  date: string;
  flights: ParsedFlight[];
  errors: string[];
}

interface ParsedService {
  type: string;
  name: string;
  quantity?: number;
}

interface ParsedExtra {
  registration: string;
  rawDescriptions: string[];
  services: ParsedService[];
}

interface ExcelParseResult {
  date: string;
  extras: ParsedExtra[];
  errors: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pdf");

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Importar datos</h1>
            <p className="mt-1 text-sm text-gray-500">Importa vuelos desde PDF o extras desde Excel</p>
          </div>
          <button onClick={() => router.push("/")} className="text-sm text-gray-500 hover:text-gray-700">
            Volver al panel
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-200 p-1">
          <button
            onClick={() => setTab("pdf")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === "pdf" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Orden del dia (PDF)
          </button>
          <button
            onClick={() => setTab("extras")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === "extras" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Extras (Excel)
          </button>
        </div>

        {tab === "pdf" ? <PdfImportTab /> : <ExtrasImportTab />}
      </div>
    </div>
  );
}

// ======= PDF Import Tab =======
function PdfImportTab() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState("");
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());

  async function handleFileUpload(file: File) {
    setError(""); setResult(null); setSaveResult(null); setParsing(true);
    const formData = new FormData();
    formData.append("pdf", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      const data: ParseResult = await res.json();
      setResult(data);
      setSelectedFlights(new Set(data.flights.map((_, i) => i)));
    } catch { setError("Error de conexion"); } finally { setParsing(false); }
  }

  async function handleConfirm() {
    if (!result) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: result.date, flights: result.flights.filter((_, i) => selectedFlights.has(i)) }),
      });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      setSaveResult(await res.json());
    } catch { setError("Error de conexion"); } finally { setSaving(false); }
  }

  function toggleFlight(i: number) {
    setSelectedFlights(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleAll() {
    if (!result) return;
    setSelectedFlights(prev => prev.size === result.flights.length ? new Set() : new Set(result.flights.map((_, i) => i)));
  }

  return (
    <>
      {!result && !saveResult && (
        <UploadArea
          accept=".pdf,.PDF"
          icon="📄"
          label="Arrastra el PDF de Cybermax o selecciona archivo"
          sublabel="Los vuelos existentes se actualizan automaticamente"
          loading={parsing}
          loadingText="Procesando PDF..."
          onFile={(f) => handleFileUpload(f)}
          inputRef={fileInputRef}
        />
      )}

      {error && <ErrorBanner message={error} />}
      {result?.errors.length ? <WarningBanner items={result.errors} /> : null}

      {result && result.flights.length > 0 && !saveResult && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">{result.flights.length} vuelos — {result.date}</h2>
            <button onClick={toggleAll} className="text-xs font-medium text-blue-600">{selectedFlights.size === result.flights.length ? "Deseleccionar" : "Seleccionar"} todo</button>
          </div>
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" checked={selectedFlights.size === result.flights.length} onChange={toggleAll} /></th>
                  <th className="px-3 py-2">Matricula</th>
                  <th className="px-3 py-2">Indicativo</th>
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
                  <tr key={i} className={`${selectedFlights.has(i) ? "bg-white" : "bg-gray-50 opacity-50"} cursor-pointer hover:bg-blue-50`} onClick={() => toggleFlight(i)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selectedFlights.has(i)} onChange={() => toggleFlight(i)} /></td>
                    <td className="px-3 py-2 font-bold text-gray-900">{f.registration}</td>
                    <td className="px-3 py-2 text-gray-500">{f.callsign}</td>
                    <td className="px-3 py-2 text-gray-600">{f.aircraftType}</td>
                    <td className="px-3 py-2 text-gray-600">{f.origin}</td>
                    <td className="px-3 py-2 text-gray-600">{f.arrivalDate !== result.date ? f.arrivalDate + " " : ""}{f.eta}</td>
                    <td className="px-3 py-2 text-gray-600">{f.destination}</td>
                    <td className="px-3 py-2 text-gray-600">{f.departureDate !== result.date ? f.departureDate + " " : ""}{f.etd}</td>
                    <td className="px-3 py-2 text-gray-600">{f.parking}</td>
                    <td className="px-3 py-2 text-gray-600">{f.crewArrival}/{f.crewDeparture}</td>
                    <td className="px-3 py-2 text-gray-600">{f.paxArrival}/{f.paxDeparture}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => { setResult(null); setError(""); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button onClick={handleConfirm} disabled={saving || !selectedFlights.size} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Importando..." : `Importar ${selectedFlights.size} vuelo${selectedFlights.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {saveResult && (
        <SuccessResult
          lines={[
            saveResult.created > 0 ? `${saveResult.created} vuelos creados` : null,
            saveResult.updated > 0 ? `${saveResult.updated} vuelos actualizados` : null,
          ]}
          onReset={() => { setResult(null); setSaveResult(null); setError(""); }}
          resetLabel="Importar otro archivo"
        />
      )}
    </>
  );
}

// ======= Extras (Excel) Import Tab =======
function ExtrasImportTab() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExcelParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ matched: number; servicesCreated: number; notFound: string[] } | null>(null);
  const [error, setError] = useState("");

  async function handleFileUpload(file: File) {
    setError(""); setResult(null); setSaveResult(null); setParsing(true);
    const formData = new FormData();
    formData.append("xlsx", file);
    try {
      const res = await fetch("/api/import/extras", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      setResult(await res.json());
    } catch { setError("Error de conexion"); } finally { setParsing(false); }
  }

  async function handleConfirm() {
    if (!result) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/import/extras", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: result.extras }),
      });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      setSaveResult(await res.json());
    } catch { setError("Error de conexion"); } finally { setSaving(false); }
  }

  return (
    <>
      {!result && !saveResult && (
        <UploadArea
          accept=".xlsx,.xls"
          icon="📊"
          label="Arrastra el Excel de extras o selecciona archivo"
          sublabel="Los servicios se asocian a cada avion por matricula"
          loading={parsing}
          loadingText="Procesando Excel..."
          onFile={(f) => handleFileUpload(f)}
          inputRef={fileInputRef}
        />
      )}

      {error && <ErrorBanner message={error} />}

      {result && result.extras.length > 0 && !saveResult && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            {result.extras.length} aviones con extras {result.date && `— ${result.date}`}
          </h2>
          <div className="space-y-2">
            {result.extras.map((extra, i) => (
              <div key={i} className="rounded-lg bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-bold text-gray-900">{extra.registration}</span>
                  <span className="text-xs text-gray-400">{extra.services.length} servicios</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {extra.services.map((svc, j) => {
                    const icon = SERVICE_ICONS[svc.type as ServiceType] || "🔧";
                    const label = svc.type === "CUSTOM" ? svc.name : (SERVICE_LABELS[svc.type as ServiceType] || svc.type);
                    return (
                      <span key={j} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {icon} {(svc.quantity || 1) > 1 ? `${svc.quantity}x ` : ""}{label}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => { setResult(null); setError(""); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button onClick={handleConfirm} disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Importando..." : "Importar extras"}
            </button>
          </div>
        </div>
      )}

      {saveResult && (
        <SuccessResult
          lines={[
            `${saveResult.servicesCreated} servicios creados para ${saveResult.matched} aviones`,
            saveResult.notFound.length > 0 ? `${saveResult.notFound.length} matriculas no encontradas: ${saveResult.notFound.join(", ")}` : null,
          ]}
          onReset={() => { setResult(null); setSaveResult(null); setError(""); }}
          resetLabel="Importar otro Excel"
        />
      )}
    </>
  );
}

// ======= Shared UI Components =======
function UploadArea({ accept, icon, label, sublabel, loading, loadingText, onFile, inputRef }: {
  accept: string; icon: string; label: string; sublabel: string;
  loading: boolean; loadingText: string;
  onFile: (f: File) => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center transition-colors hover:border-blue-400"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-400", "bg-blue-50"); }}
      onDragLeave={(e) => { e.currentTarget.classList.remove("border-blue-400", "bg-blue-50"); }}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-blue-400", "bg-blue-50"); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
    >
      {loading ? (
        <div className="text-gray-500"><div className="mb-2 text-lg">{loadingText}</div></div>
      ) : (
        <>
          <div className="mb-4 text-4xl text-gray-300">{icon}</div>
          <p className="text-gray-600">
            {label.split(" o ")[0]} o{" "}
            <button onClick={() => inputRef.current?.click()} className="font-medium text-blue-600 hover:text-blue-500">selecciona un archivo</button>
          </p>
          <p className="mt-2 text-xs text-gray-400">{sublabel}</p>
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

function WarningBanner({ items }: { items: string[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      {items.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
    </div>
  );
}

function SuccessResult({ lines, onReset, resetLabel }: { lines: (string | null)[]; onReset: () => void; resetLabel: string }) {
  const router = useRouter();
  return (
    <div className="mt-6 rounded-xl bg-white p-8 text-center shadow-sm">
      <div className="mb-3 text-4xl text-green-500">✓</div>
      <h2 className="text-lg font-bold text-gray-900">Importacion completada</h2>
      <div className="mt-3 space-y-1 text-sm text-gray-600">
        {lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={onReset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">{resetLabel}</button>
        <button onClick={() => router.push("/")} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white">Ir al panel</button>
      </div>
    </div>
  );
}
