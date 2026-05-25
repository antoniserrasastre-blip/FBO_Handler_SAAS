"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ParsedFlight } from "@/lib/pdfParser";
import { SERVICE_LABELS, ServiceType } from "@/types";
import { ServiceIcon, PdfIcon, ExcelIcon, SuccessIcon } from "@/components/Icons";
import { HelixButton, SegmentedControl } from "@/components/helix";

type Tab = "pdf" | "extras";

interface ToCancelEntry {
  visitId: string;
  registration: string;
  callsign: string;
  eta: string | null;
  etd: string | null;
  origin: string | null;
  destination: string | null;
}

interface ParseWarning {
  row: number;
  reason: string;
}

interface ParseResult {
  date: string;
  flights: ParsedFlight[];
  errors: string[];
  toCancel?: ToCancelEntry[];
  warnings?: ParseWarning[];
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
  date?: string;
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
    <div className="min-h-[calc(100vh-96px)] bg-bg px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Importar datos</h1>
            <p className="mt-1 text-sm text-ink-3">Importa vuelos desde PDF o extras desde Excel.</p>
          </div>
          <HelixButton variant="secondary" size="sm" onClick={() => router.push("/")}>
            Volver al panel
          </HelixButton>
        </div>

        <div className="mb-6">
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "pdf", label: "Orden del día (PDF)" },
              { value: "extras", label: "Extras (Excel)" },
            ]}
          />
        </div>

        {tab === "pdf" ? <PdfImportTab /> : <ExtrasImportTab />}
      </div>
    </div>
  );
}

// ======= PDF Import Tab =======
function PdfImportTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ created: number; updated: number; cancelled?: number } | null>(null);
  const [error, setError] = useState("");
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [selectedCancel, setSelectedCancel] = useState<Set<string>>(new Set());

  async function handleFileUpload(files: File[]) {
    setError(""); setResult(null); setSaveResult(null); setParsing(true);
    const formData = new FormData();
    for (const f of files) formData.append("pdf", f);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      const data: ParseResult = await res.json();
      setResult(data);
      setSelectedFlights(new Set(data.flights.map((_, i) => i)));
      setSelectedCancel(new Set((data.toCancel || []).map((c) => c.visitId)));
    } catch { setError("Error de conexion"); } finally { setParsing(false); }
  }

  async function handleConfirm() {
    if (!result) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: result.date,
          flights: result.flights.filter((_, i) => selectedFlights.has(i)),
          cancelIds: Array.from(selectedCancel),
        }),
      });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      setSaveResult(await res.json());
    } catch { setError("Error de conexion"); } finally { setSaving(false); }
  }

  function toggleCancel(id: string) {
    setSelectedCancel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAllCancel() {
    if (!result?.toCancel) return;
    setSelectedCancel((prev) => prev.size === result.toCancel!.length ? new Set() : new Set(result.toCancel!.map((c) => c.visitId)));
  }

  function toggleFlight(i: number) {
    setSelectedFlights((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
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
          icon={<PdfIcon size={40} className="text-gray-300" />}
          label="Arrastra los PDF de Cybermax o selecciona archivos"
          sublabel="Puedes subir varios a la vez — los vuelos existentes se actualizan automaticamente"
          loading={parsing}
          loadingText="Procesando PDFs..."
          onFiles={(files) => handleFileUpload(files)}
          inputRef={fileInputRef}
        />
      )}

      {error && <ErrorBanner message={error} />}
      {result?.errors.length ? <WarningBanner items={result.errors} /> : null}
      {result?.warnings?.length ? <ParseWarningsBanner warnings={result.warnings} /> : null}

      {result && result.flights.length > 0 && !saveResult && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-1">
              <span className="font-mono [font-variant-numeric:tabular-nums]">{result.flights.length}</span>{" "}
              vuelos — <span className="font-mono">{result.date}</span>
            </h2>
            <button
              onClick={toggleAll}
              className="font-mono text-xs font-semibold text-brand-active hover:text-brand-hover"
            >
              {selectedFlights.size === result.flights.length ? "Deseleccionar" : "Seleccionar"} todo
            </button>
          </div>
          <div className="overflow-x-auto rounded-hx-md border border-line bg-bg">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-subtle">
                <tr className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                  <th className="border-b border-line px-3 py-2">
                    <input type="checkbox" checked={selectedFlights.size === result.flights.length} onChange={toggleAll} />
                  </th>
                  <th className="border-b border-line px-3 py-2">Matrícula</th>
                  <th className="border-b border-line px-3 py-2">Indicativo</th>
                  <th className="border-b border-line px-3 py-2">Tipo</th>
                  <th className="border-b border-line px-3 py-2">Origen</th>
                  <th className="border-b border-line px-3 py-2">ETA</th>
                  <th className="border-b border-line px-3 py-2">Destino</th>
                  <th className="border-b border-line px-3 py-2">ETD</th>
                  <th className="border-b border-line px-3 py-2">Parking</th>
                  <th className="border-b border-line px-3 py-2">Crew</th>
                  <th className="border-b border-line px-3 py-2">Pax</th>
                </tr>
              </thead>
              <tbody className="font-mono [font-variant-numeric:tabular-nums]">
                {result.flights.map((f, i) => (
                  <tr
                    key={i}
                    className={`cursor-pointer border-b border-line-subtle transition-colors hover:bg-bg-subtle ${
                      selectedFlights.has(i) ? "" : "opacity-50"
                    }`}
                    onClick={() => toggleFlight(i)}
                  >
                    <td className="px-3 py-2"><input type="checkbox" checked={selectedFlights.has(i)} onChange={() => toggleFlight(i)} /></td>
                    <td className="px-3 py-2 font-semibold text-ink-1">{f.registration}</td>
                    <td className="px-3 py-2 text-ink-3">{f.callsign}</td>
                    <td className="px-3 py-2 text-ink-2">{f.aircraftType}</td>
                    <td className="px-3 py-2 text-ink-2">{f.origin}</td>
                    <td className="px-3 py-2 text-ink-2">{f.arrivalDate !== result.date ? f.arrivalDate + " " : ""}{f.eta}</td>
                    <td className="px-3 py-2 text-ink-2">{f.destination}</td>
                    <td className="px-3 py-2 text-ink-2">{f.departureDate !== result.date ? f.departureDate + " " : ""}{f.etd}</td>
                    <td className="px-3 py-2 text-ink-2">{f.parking}</td>
                    <td className="px-3 py-2 text-ink-2">{f.crewArrival}/{f.crewDeparture}</td>
                    <td className="px-3 py-2 text-ink-2">{f.paxArrival}/{f.paxDeparture}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.toCancel && result.toCancel.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-warning-strong">
                  <span className="font-mono [font-variant-numeric:tabular-nums]">{result.toCancel.length}</span>{" "}
                  vuelo{result.toCancel.length !== 1 ? "s" : ""} ausente{result.toCancel.length !== 1 ? "s" : ""} en el nuevo PDF — se marcar{result.toCancel.length !== 1 ? "án" : "á"} como cancelado{result.toCancel.length !== 1 ? "s" : ""}
                </h2>
                <button
                  onClick={toggleAllCancel}
                  className="font-mono text-xs font-semibold text-brand-active hover:text-brand-hover"
                >
                  {selectedCancel.size === result.toCancel.length ? "Deseleccionar" : "Seleccionar"} todo
                </button>
              </div>
              <div className="overflow-x-auto rounded-hx-md border border-warning bg-warning-bg/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-warning-bg/60">
                    <tr className="font-mono text-[10px] uppercase tracking-wider text-warning-strong">
                      <th className="border-b border-warning px-3 py-2"></th>
                      <th className="border-b border-warning px-3 py-2">Matrícula</th>
                      <th className="border-b border-warning px-3 py-2">Indicativo</th>
                      <th className="border-b border-warning px-3 py-2">Origen</th>
                      <th className="border-b border-warning px-3 py-2">ETA</th>
                      <th className="border-b border-warning px-3 py-2">Destino</th>
                      <th className="border-b border-warning px-3 py-2">ETD</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono [font-variant-numeric:tabular-nums]">
                    {result.toCancel.map((c) => (
                      <tr
                        key={c.visitId}
                        className={`cursor-pointer border-b border-warning/40 transition-colors hover:bg-warning-bg/60 ${
                          selectedCancel.has(c.visitId) ? "" : "opacity-50"
                        }`}
                        onClick={() => toggleCancel(c.visitId)}
                      >
                        <td className="px-3 py-2"><input type="checkbox" checked={selectedCancel.has(c.visitId)} onChange={() => toggleCancel(c.visitId)} /></td>
                        <td className="px-3 py-2 font-semibold text-ink-1">{c.registration}</td>
                        <td className="px-3 py-2 text-ink-3">{c.callsign}</td>
                        <td className="px-3 py-2 text-ink-2">{c.origin || "—"}</td>
                        <td className="px-3 py-2 text-ink-2">{c.eta || "—"}</td>
                        <td className="px-3 py-2 text-ink-2">{c.destination || "—"}</td>
                        <td className="px-3 py-2 text-ink-2">{c.etd || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <HelixButton variant="secondary" onClick={() => { setResult(null); setError(""); }}>
              Cancelar
            </HelixButton>
            <HelixButton variant="primary" onClick={handleConfirm} disabled={saving || !selectedFlights.size}>
              {saving ? "Importando…" : `Importar ${selectedFlights.size}${selectedCancel.size > 0 ? ` · cancelar ${selectedCancel.size}` : ""}`}
            </HelixButton>
          </div>
        </div>
      )}

      {saveResult && (
        <SuccessResult
          lines={[
            saveResult.created > 0 ? `${saveResult.created} vuelos creados` : null,
            saveResult.updated > 0 ? `${saveResult.updated} vuelos actualizados` : null,
            saveResult.cancelled && saveResult.cancelled > 0 ? `${saveResult.cancelled} vuelos cancelados` : null,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExcelParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ matched: number; servicesCreated: number; notFound: string[]; pendingCreated?: string[]; datesProcessed?: string[] } | null>(null);
  const [error, setError] = useState("");

  async function handleFileUpload(files: File[]) {
    setError(""); setResult(null); setSaveResult(null); setParsing(true);
    const formData = new FormData();
    for (const f of files) formData.append("xlsx", f);
    try {
      const res = await fetch("/api/import/extras", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error || "Error"); return; }
      const data: ExcelParseResult = await res.json();
      setResult(data);
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

  // Group extras by date for display
  const groupedByDate = result ? (() => {
    const groups = new Map<string, ParsedExtra[]>();
    for (const extra of result.extras) {
      const d = extra.date || "Sin fecha";
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(extra);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  })() : [];

  return (
    <>
      {!result && !saveResult && (
        <UploadArea
          accept=".xlsx,.xls"
          icon={<ExcelIcon size={40} className="text-gray-300" />}
          label="Arrastra los Excel de extras o selecciona archivos"
          sublabel="Puedes subir varios a la vez — cada archivo se importa en su fecha"
          loading={parsing}
          loadingText="Procesando Excels..."
          onFiles={(files) => handleFileUpload(files)}
          inputRef={fileInputRef}
        />
      )}

      {error && <ErrorBanner message={error} />}

      {result && result.extras.length > 0 && !saveResult && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-ink-1">
            <span className="font-mono [font-variant-numeric:tabular-nums]">{result.extras.length}</span>{" "}
            aviones con extras — {groupedByDate.length === 1 ? groupedByDate[0][0] : `${groupedByDate.length} fechas`}
          </h2>

          {groupedByDate.map(([date, extras]) => (
            <div key={date} className="mb-4">
              {groupedByDate.length > 1 && (
                <div className="mb-2 flex items-center gap-2 rounded-hx-md border border-line-subtle bg-brand-tint px-3 py-2">
                  <span className="font-mono text-sm font-semibold text-brand-active">{date}</span>
                  <span className="font-mono text-xs text-brand-active">{extras.length} aviones</span>
                </div>
              )}
              <div className="space-y-2">
                {extras.map((extra, i) => (
                  <div key={i} className="rounded-hx-md border border-line bg-bg px-4 py-3 shadow-hx-sm">
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-sm font-semibold text-ink-1">{extra.registration}</span>
                      <span className="font-mono text-xs text-ink-muted">{extra.services.length} servicios</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {extra.services.map((svc, j) => {
                        const label = svc.type === "CUSTOM" ? svc.name : (SERVICE_LABELS[svc.type as ServiceType] || svc.type);
                        return (
                          <span key={j} className="inline-flex items-center gap-1 rounded-hx-pill bg-bg-muted px-2 py-0.5 text-xs text-ink-2">
                            <ServiceIcon type={svc.type} size={12} /> {(svc.quantity || 1) > 1 ? `${svc.quantity}x ` : ""}{label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 flex justify-end gap-2">
            <HelixButton variant="secondary" onClick={() => { setResult(null); setError(""); }}>
              Cancelar
            </HelixButton>
            <HelixButton variant="primary" onClick={handleConfirm} disabled={saving}>
              {saving ? "Importando…" : "Importar extras"}
            </HelixButton>
          </div>
        </div>
      )}

      {saveResult && (
        <SuccessResult
          lines={[
            `${saveResult.servicesCreated} servicios creados para ${saveResult.matched} aviones`,
            saveResult.datesProcessed && saveResult.datesProcessed.length > 1
              ? `Fechas: ${saveResult.datesProcessed.join(", ")}`
              : null,
            saveResult.pendingCreated && saveResult.pendingCreated.length > 0
              ? `${saveResult.pendingCreated.length} vuelos creados como pendientes: ${saveResult.pendingCreated.join(", ")}`
              : null,
          ]}
          onReset={() => { setResult(null); setSaveResult(null); setError(""); }}
          resetLabel="Importar mas Excels"
        />
      )}
    </>
  );
}

// ======= Shared UI Components =======
function UploadArea({ accept, icon, label, sublabel, loading, loadingText, onFiles, inputRef }: {
  accept: string; icon: React.ReactNode; label: string; sublabel: string;
  loading: boolean; loadingText: string;
  onFiles: (files: File[]) => void; inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const exts = accept.split(",").map((e) => e.trim().toLowerCase());
  function filterByType(files: File[]) {
    return files.filter((f) => exts.some((ext) => f.name.toLowerCase().endsWith(ext)));
  }
  return (
    <div
      className="rounded-hx-md border-2 border-dashed border-line bg-bg p-12 text-center transition-colors hover:border-brand"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand", "bg-brand-tint"); }}
      onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand", "bg-brand-tint"); }}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-brand", "bg-brand-tint"); const files = filterByType(Array.from(e.dataTransfer.files)); if (files.length) onFiles(files); }}
    >
      {loading ? (
        <div className="text-ink-3"><div className="mb-2 text-lg">{loadingText}</div></div>
      ) : (
        <>
          <div className="mb-4 flex justify-center text-ink-muted">{icon}</div>
          <p className="text-ink-2">
            {label.split(" o ")[0]} o{" "}
            <button onClick={() => inputRef.current?.click()} className="font-semibold text-brand-active hover:text-brand-hover">selecciona archivos</button>
          </p>
          <p className="mt-2 text-xs text-ink-muted">{sublabel}</p>
          <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) onFiles(files); e.target.value = ""; }} />
        </>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-4 rounded-hx-md border border-danger-strong bg-danger-bg px-4 py-3 text-sm text-danger-strong">{message}</div>;
}

function WarningBanner({ items }: { items: string[] }) {
  return (
    <div className="mt-4 rounded-hx-md border border-warning-strong bg-warning-bg px-4 py-3">
      {items.map((e, i) => <p key={i} className="text-xs text-warning-strong">{e}</p>)}
    </div>
  );
}

function ParseWarningsBanner({ warnings }: { warnings: ParseWarning[] }) {
  return (
    <div className="mt-4 rounded-hx-md border border-warning-strong bg-warning-bg px-4 py-3" data-testid="parse-warnings-banner">
      <p className="mb-1.5 text-xs font-semibold text-warning-strong">
        Avisos del parseo — {warnings.length} {warnings.length === 1 ? "fila con problema" : "filas con problemas"} (no bloquean la importación)
      </p>
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-warning-strong">
          Fila {w.row}: {w.reason}
        </p>
      ))}
    </div>
  );
}

function SuccessResult({ lines, onReset, resetLabel }: { lines: (string | null)[]; onReset: () => void; resetLabel: string }) {
  const router = useRouter();
  return (
    <div className="mt-6 rounded-hx-md border border-line bg-bg p-8 text-center shadow-hx-sm">
      <div className="mb-3 flex justify-center"><SuccessIcon size={40} className="text-success" /></div>
      <h2 className="text-lg font-semibold text-ink-1">Importación completada</h2>
      <div className="mt-3 space-y-1 text-sm text-ink-2">
        {lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
      </div>
      <div className="mt-6 flex justify-center gap-2">
        <HelixButton variant="secondary" onClick={onReset}>{resetLabel}</HelixButton>
        <HelixButton variant="primary" onClick={() => router.push("/")}>Ir al panel</HelixButton>
      </div>
    </div>
  );
}
