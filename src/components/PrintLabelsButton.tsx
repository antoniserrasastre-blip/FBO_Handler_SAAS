"use client";

// PrintLabelsButton — per-flight action to print baggage labels.
// One label per piece of hold baggage (numbered i/N); the quantity is the
// TOTAL BULTOS that goes on the paper control sheet. Opens a small popover with
// a suggested, editable bag count, then opens the label PDF (62×29 mm) to print
// on the Brother TD-46/4750 driver. See /api/export/baggage-labels.

import { useEffect, useRef, useState } from "react";
import { Tags } from "lucide-react";
import { HelixButton } from "@/components/helix";

export interface PrintLabelsFlight {
  callsign?: string | null;
  destination?: string | null;
  registration?: string | null;
  aircraftType?: string | null;
  etd?: string | null;
  departureDate?: string | null; // "DD/MM"
  arrivalDate?: string | null; // "DD/MM"
  paxDeparture?: number | null;
  paxDepartureReal?: number | null;
}

export function PrintLabelsButton({ flight, size = "sm" }: { flight: PrintLabelsFlight; size?: "sm" | "icon" }) {
  const [open, setOpen] = useState(false);
  const suggested = Math.max(1, flight.paxDepartureReal ?? flight.paxDeparture ?? 1);
  const [bags, setBags] = useState<number>(suggested);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setBags(suggested);
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const print = () => {
    const n = Math.max(1, Math.min(99, Math.floor(bags) || 1));
    const params = new URLSearchParams({
      callsign: flight.callsign || "",
      dest: flight.destination || "",
      reg: flight.registration || "",
      type: flight.aircraftType || "",
      fecha: flight.departureDate || flight.arrivalDate || "",
      hora: flight.etd || "",
      bags: String(n),
    });
    window.open(`/api/export/baggage-labels?${params.toString()}`, "_blank");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <HelixButton
        variant="ghost"
        size={size}
        onClick={() => setOpen((o) => !o)}
        title="Imprimir etiquetas de equipaje"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Tags size={14} /> {size === "sm" ? "Etiquetas" : null}
      </HelixButton>
      {open ? (
        <div
          role="dialog"
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-hx-md border border-line bg-bg p-3 shadow-hx-lg"
        >
          <p className="mb-1 text-xs text-ink-3">
            Etiquetas de equipaje — <span className="font-mono">{flight.callsign}</span>
          </p>
          <label className="mb-2 block text-xs text-ink-2">
            Nº de bultos
            <input
              type="number"
              min={1}
              max={99}
              value={bags}
              autoFocus
              onChange={(e) => setBags(Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") print(); }}
              className="mt-1 w-full rounded-hx-sm border border-line bg-bg-subtle px-2 py-1.5 text-sm text-ink-1"
            />
          </label>
          <HelixButton variant="primary" size="sm" className="w-full" onClick={print}>
            Imprimir {Math.max(1, Math.min(99, Math.floor(bags) || 1))} etiqueta{bags === 1 ? "" : "s"}
          </HelixButton>
        </div>
      ) : null}
    </div>
  );
}
