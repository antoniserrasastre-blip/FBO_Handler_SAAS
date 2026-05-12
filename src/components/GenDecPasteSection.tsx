"use client";

import { useState } from "react";
import { ClipboardPaste, Wand2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { ParsedPerson } from "@/lib/gendecParser";

type ExtractResponse = { crew: ParsedPerson[]; passengers: ParsedPerson[] };

type EditableRow = ParsedPerson & {
  kind: "CREW" | "PAX";
  selected: boolean;
  rowId: string;
};

interface Props {
  flightId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  /** Called after successful import so the parent can refresh its lists. */
  onImported: () => void;
}

const ROLE_OPTIONS: ParsedPerson["role"][] = ["CAPTAIN", "FIRST_OFFICER", "CABIN_CREW", "OTHER"];

export function GenDecPasteSection({ flightId, direction, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    if (!text.trim()) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(`/api/flights/${flightId}/gendec/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data: ExtractResponse = await res.json();
      const next: EditableRow[] = [
        ...data.crew.map((p, i) => ({ ...p, kind: "CREW" as const, selected: true, rowId: `c${i}` })),
        ...data.passengers.map((p, i) => ({ ...p, kind: "PAX" as const, selected: true, rowId: `p${i}` })),
      ];
      setRows(next);
      if (!next.length) setError("No se detecto ningun nombre. Revisa el texto pegado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setExtracting(false);
    }
  };

  const updateRow = (rowId: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev?.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)) ?? null);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev?.filter((r) => r.rowId !== rowId) ?? null);
  };

  const importSelected = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.selected && r.fullName.trim());
    if (!toImport.length) return;
    setImporting(true);
    setError(null);
    try {
      // POST sequentially to avoid hammering the EventBus and preserve order
      for (const r of toImport) {
        const url = r.kind === "CREW"
          ? `/api/flights/${flightId}/crew`
          : `/api/flights/${flightId}/passengers`;
        const body = r.kind === "CREW"
          ? {
              direction,
              fullName: r.fullName,
              nationality: r.nationality || undefined,
              passportNumber: r.passportNumber || undefined,
              dateOfBirth: r.dateOfBirth || undefined,
              role: r.role || "OTHER",
            }
          : {
              direction,
              fullName: r.fullName,
              nationality: r.nationality || undefined,
              passportNumber: r.passportNumber || undefined,
              dateOfBirth: r.dateOfBirth || undefined,
            };
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Fallo al guardar ${r.fullName}`);
      }
      // Reset and notify parent
      setRows(null);
      setText("");
      setOpen(false);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
          <ClipboardPaste size={12} />
          Pegar GenDec (texto del email)
        </span>
        {open ? <ChevronUp size={14} className="text-amber-600" /> : <ChevronDown size={14} className="text-amber-600" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-amber-200 px-3 py-3">
          <textarea
            className="w-full rounded border border-amber-300 bg-white p-2 text-xs font-mono"
            rows={6}
            placeholder="Pega aqui el cuerpo del email o el contenido del PDF (Cmd/Ctrl+V). Acepta tablas, listas con guiones, formato 'Etiqueta: valor'..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={extracting || importing}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={extract}
              disabled={!text.trim() || extracting || importing}
              className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Wand2 size={12} />
              {extracting ? "Extrayendo..." : "Extraer"}
            </button>
            {rows && rows.length > 0 && (
              <span className="text-xs text-gray-500">
                {rows.filter((r) => r.kind === "CREW").length} crew · {rows.filter((r) => r.kind === "PAX").length} pax detectados
              </span>
            )}
          </div>

          {error && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}

          {rows && rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded border border-amber-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50 text-left text-gray-500">
                    <tr>
                      <th className="px-2 py-1 font-medium w-6"></th>
                      <th className="px-2 py-1 font-medium w-16">Tipo</th>
                      <th className="px-2 py-1 font-medium">Nombre</th>
                      <th className="px-2 py-1 font-medium">Pasaporte</th>
                      <th className="px-2 py-1 font-medium w-20">Nac.</th>
                      <th className="px-2 py-1 font-medium w-24">F. Nac</th>
                      <th className="px-2 py-1 font-medium w-32">Rol</th>
                      <th className="px-2 py-1 font-medium w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const lowConf = r.confidence < 0.5;
                      return (
                        <tr
                          key={r.rowId}
                          className={`border-t border-amber-100 ${lowConf ? "bg-yellow-50" : ""}`}
                          title={lowConf ? `Confianza baja (${Math.round(r.confidence * 100)}%) — revisa antes de guardar` : undefined}
                        >
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={r.selected}
                              onChange={(e) => updateRow(r.rowId, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <select
                              value={r.kind}
                              onChange={(e) => updateRow(r.rowId, { kind: e.target.value as "CREW" | "PAX" })}
                              className="w-full rounded border border-gray-200 bg-white px-1 py-0.5"
                            >
                              <option value="CREW">Crew</option>
                              <option value="PAX">Pax</option>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="w-full rounded border border-gray-200 px-1 py-0.5"
                              value={r.fullName}
                              onChange={(e) => updateRow(r.rowId, { fullName: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="w-full rounded border border-gray-200 px-1 py-0.5 font-mono"
                              value={r.passportNumber ?? ""}
                              onChange={(e) => updateRow(r.rowId, { passportNumber: e.target.value || null })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="w-full rounded border border-gray-200 px-1 py-0.5 uppercase"
                              maxLength={3}
                              value={r.nationality ?? ""}
                              onChange={(e) => updateRow(r.rowId, { nationality: e.target.value.toUpperCase() || null })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="w-full rounded border border-gray-200 px-1 py-0.5"
                              placeholder="DD/MM/YYYY"
                              value={r.dateOfBirth ?? ""}
                              onChange={(e) => updateRow(r.rowId, { dateOfBirth: e.target.value || null })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            {r.kind === "CREW" ? (
                              <select
                                value={r.role ?? "OTHER"}
                                onChange={(e) => updateRow(r.rowId, { role: e.target.value as ParsedPerson["role"] })}
                                className="w-full rounded border border-gray-200 bg-white px-1 py-0.5"
                              >
                                {ROLE_OPTIONS.map((ro) => (
                                  <option key={ro} value={ro ?? "OTHER"}>{ro}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              onClick={() => removeRow(r.rowId)}
                              className="text-gray-400 hover:text-red-600"
                              title="Descartar fila"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  Filas amarillas = baja confianza, revisa antes. Las grises = OK.
                </span>
                <button
                  type="button"
                  onClick={importSelected}
                  disabled={importing || !rows.some((r) => r.selected)}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {importing
                    ? "Guardando..."
                    : `Anadir ${rows.filter((r) => r.selected).length} entrada${rows.filter((r) => r.selected).length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
