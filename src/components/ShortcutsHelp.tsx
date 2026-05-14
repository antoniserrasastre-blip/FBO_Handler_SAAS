"use client";

import { Modal } from "./Modal";

const SHORTCUTS = [
  { key: "↑ / ↓", action: "Navegar entre vuelos" },
  { key: "Enter", action: "Expandir / colapsar vuelo" },
  { key: "F", action: "Avanzar estado de fuel" },
  { key: "T", action: "Avanzar estado de toilet" },
  { key: "C", action: "Avanzar primer catering pendiente" },
  { key: "S", action: "Avanzar primer servicio pendiente" },
  { key: "/", action: "Enfocar barra de busqueda" },
  { key: "N", action: "Crear nuevo vuelo" },
  { key: "Esc", action: "Limpiar busqueda / cerrar modal" },
  { key: "?", action: "Mostrar esta ayuda" },
];

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Atajos de teclado">
      <div className="divide-y divide-line-subtle">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between py-2">
            <span className="text-sm text-ink-2">{s.action}</span>
            <kbd className="rounded-hx-sm border border-line bg-bg-subtle px-2 py-0.5 font-mono text-xs font-semibold text-ink-1 shadow-hx-sm">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-xs text-ink-muted">
        Los atajos no funcionan mientras se edita un campo de texto.
      </p>
    </Modal>
  );
}
