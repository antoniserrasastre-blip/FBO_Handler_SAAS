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
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-600">{s.action}</span>
            <kbd className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{s.key}</kbd>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-400">Los atajos no funcionan mientras se edita un campo de texto.</p>
    </Modal>
  );
}
