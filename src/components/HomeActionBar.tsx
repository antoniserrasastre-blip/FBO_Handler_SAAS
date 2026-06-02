"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelixButton } from "@/components/helix";
import { Volume2, VolumeX, FileCheck2, Printer, MoreVertical, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";

export interface HomeActionBarProps {
  hasFlights: boolean;
  overdueCount: number;
  soundEnabled: boolean;
  date: Date;
  onPrint: () => void;
  onHandover: () => void;
  onToggleSound: () => void;
  onExport: (type: "flights" | "services") => void;
  onImport: () => void;
  onNewFlight: () => void;
}

/** Action bar de la home. En móvil colapsa secundarios detrás de "Más". */
export function HomeActionBar(props: HomeActionBarProps) {
  const isMobile = useIsMobile();
  const { hasFlights, overdueCount, onNewFlight } = props;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5 sm:mb-4 sm:gap-2">
      {overdueCount > 0 ? (
        <span className="hx-pill hx-pill-danger overdue-pulse mr-auto">
          ⚠ {overdueCount} retrasado{overdueCount !== 1 ? "s" : ""}
        </span>
      ) : null}

      {!isMobile ? <DesktopActions {...props} /> : null}
      {isMobile ? <MobileMoreMenu {...props} /> : null}

      <HelixButton variant="primary" size="sm" onClick={onNewFlight}>
        + Nuevo vuelo
      </HelixButton>
      {/* hasFlights is consumed downstream to gate secondary actions */}
      <span className="sr-only">{hasFlights ? "" : ""}</span>
    </div>
  );
}

function DesktopActions({
  hasFlights,
  soundEnabled,
  date,
  onPrint,
  onHandover,
  onToggleSound,
  onExport,
  onImport,
}: HomeActionBarProps) {
  return (
    <>
      {hasFlights ? (
        <HelixButton variant="ghost" size="sm" onClick={onPrint} title="Imprimir hoja del día">
          <Printer size={14} /> Imprimir
        </HelixButton>
      ) : null}
      {hasFlights ? (
        <HelixButton variant="ghost" size="sm" onClick={onHandover} title="Resumen para pasar turno">
          <FileCheck2 size={14} /> Traspaso
        </HelixButton>
      ) : null}
      <HelixButton
        variant="ghost"
        size="icon"
        onClick={onToggleSound}
        title={soundEnabled ? "Desactivar sonido" : "Activar sonido de alertas"}
      >
        {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </HelixButton>
      {hasFlights ? <ExportMenu date={date} onExport={onExport} /> : null}
      <HelixButton variant="secondary" size="sm" onClick={onImport}>
        Importar PDF
      </HelixButton>
    </>
  );
}

function MobileMoreMenu({
  hasFlights,
  soundEnabled,
  date,
  onPrint,
  onHandover,
  onToggleSound,
  onExport,
  onImport,
}: HomeActionBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const ymd = date.toISOString().slice(0, 10);
  const item = "block w-full px-4 py-3 text-left text-sm text-ink-2 hover:bg-bg-muted";

  return (
    <div className="relative" ref={ref}>
      <HelixButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={14} /> Más
      </HelixButton>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          {hasFlights ? (
            <MenuItem className={item} onClick={() => { setOpen(false); onPrint(); }}>
              <Printer size={14} /> Imprimir
            </MenuItem>
          ) : null}
          {hasFlights ? (
            <MenuItem className={item} onClick={() => { setOpen(false); onHandover(); }}>
              <FileCheck2 size={14} /> Traspaso
            </MenuItem>
          ) : null}
          <MenuItem className={item} onClick={() => { setOpen(false); onToggleSound(); }}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} Sonido
          </MenuItem>
          {hasFlights ? (
            <>
              <div className="mx-2 my-1 border-t border-line-subtle" />
              <MenuItem className={item} onClick={() => { setOpen(false); onExport("flights"); }}>
                Exportar vuelos (CSV)
              </MenuItem>
              <MenuItem className={item} onClick={() => { setOpen(false); onExport("services"); }}>
                Exportar servicios (CSV)
              </MenuItem>
              <MenuItem
                className={item}
                onClick={() => { setOpen(false); window.open(`/api/export/daily/pdf?date=${ymd}`, "_blank"); }}
              >
                PDF Diario (AENA)
              </MenuItem>
              <MenuItem
                className={item}
                onClick={() => { setOpen(false); window.open(`/api/export/daily/excel?date=${ymd}`, "_blank"); }}
              >
                Excel Diario
              </MenuItem>
              <MenuItem
                className={item}
                onClick={() => { setOpen(false); window.open(`/api/export/baggage-sheets?date=${ymd}`, "_blank"); }}
              >
                Hojas de equipaje (PDF)
              </MenuItem>
            </>
          ) : null}
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <MenuItem className={item} onClick={() => { setOpen(false); onImport(); }}>
            Importar PDF
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ children, onClick, className }: { children: ReactNode; onClick: () => void; className: string }) {
  return (
    <button type="button" onClick={onClick} className={className}>
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

function ExportMenu({
  date,
  onExport,
}: {
  date: Date;
  onExport: (type: "flights" | "services") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const ymd = date.toISOString().slice(0, 10);
  const item = "block w-full px-4 py-2 text-left text-sm text-ink-2 hover:bg-bg-muted";

  return (
    <div className="relative" ref={ref}>
      <HelixButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Exportar <ChevronDown size={14} />
      </HelixButton>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          <button onClick={() => { onExport("flights"); setOpen(false); }} className={item}>
            Vuelos (CSV)
          </button>
          <button onClick={() => { onExport("services"); setOpen(false); }} className={item}>
            Servicios (CSV)
          </button>
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <button
            onClick={() => { window.open(`/api/export/daily/pdf?date=${ymd}`, "_blank"); setOpen(false); }}
            className={item}
          >
            PDF Diario (AENA)
          </button>
          <button
            onClick={() => { window.open(`/api/export/daily/excel?date=${ymd}`, "_blank"); setOpen(false); }}
            className={item}
          >
            Excel Diario
          </button>
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <button
            onClick={() => { window.open(`/api/export/baggage-sheets?date=${ymd}`, "_blank"); setOpen(false); }}
            className={item}
          >
            Hojas de equipaje (PDF)
          </button>
          <button
            onClick={() => { window.open("/api/export/blank-declaration", "_blank"); setOpen(false); }}
            className={item}
          >
            Declaración en blanco
          </button>
        </div>
      ) : null}
    </div>
  );
}
