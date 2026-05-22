// AddServicePicker — chip-row de servicios disponibles para añadir a un vuelo.
//
// Mezcla:
//   • Chips built-in (SERVICE_TYPES sin CUSTOM): los de toda la vida.
//   • Chips de presets (CustomServicePreset, compartidos entre handlers):
//     se distinguen con un anillo punteado + asterisco. Long-press los borra
//     (con confirm, mismo patrón que ServiceChipRow).
//   • Chip "+ Custom" → cambia el strip por un input + dos botones:
//        - "Solo este vuelo"        → añade CUSTOM con customName sin guardar.
//        - "Guardar como permanente" → crea un preset Y añade el servicio.
//
// Visualmente nos atamos a las clases helix existentes (hx-btn, hx-btn-ghost,
// edit-service-picker) para que el componente encaje sin diseñar tokens nuevos.

"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Star, X } from "lucide-react";
import { SERVICE_TYPES, SERVICE_LABELS, type ServiceType } from "@/types";
import { useServicePresets, type CustomServicePreset } from "@/hooks/useServicePresets";
import { useLongPress } from "@/hooks/useLongPress";

export interface AddServicePickerProps {
  flightId: string;
  onAddService: (
    flightId: string,
    type: string,
    customName?: string,
    reference?: string,
    target?: string
  ) => void;
  onToast?: (text: string, type?: "success" | "info" | "warning") => void;
  onClose?: () => void;
}

interface PresetChipProps {
  preset: CustomServicePreset;
  onClick: () => void;
  onDelete: () => void;
}

function PresetChip({ preset, onClick, onDelete }: PresetChipProps) {
  const { handlers, isPressing } = useLongPress({
    onLongPress: () => {
      if (typeof window !== "undefined" && window.confirm(`¿Eliminar "${preset.name}" de la lista de presets?`)) {
        onDelete();
      }
    },
    onClick,
  });

  const pressClass = isPressing ? "scale-95 ring-2 ring-danger-strong/40" : "";

  return (
    <button
      type="button"
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      className={`hx-btn hx-btn-ghost hx-btn-sm ring-1 ring-dashed ring-line inline-flex items-center gap-1 ${pressClass}`}
      title={`${preset.name} — mantén pulsado para borrar de la lista`}
      style={{ touchAction: "manipulation" }}
    >
      <Star size={10} aria-hidden />
      <span className="truncate max-w-[160px]">{preset.name}</span>
    </button>
  );
}

export function AddServicePicker({ flightId, onAddService, onToast, onClose }: AddServicePickerProps) {
  const { presets, create, remove } = useServicePresets();
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus al entrar en modo custom.
  useEffect(() => {
    if (customMode) inputRef.current?.focus();
  }, [customMode]);

  const closePicker = () => {
    setCustomMode(false);
    setCustomName("");
    onClose?.();
  };

  const addOneOff = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onAddService(flightId, "CUSTOM", trimmed);
    closePicker();
  };

  const saveAndAdd = async () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const preset = await create(trimmed);
    // Aunque create falle (red caída), añadimos igual al vuelo para no
    // bloquear al operador. La pérdida es: el preset no se guarda.
    onAddService(flightId, "CUSTOM", trimmed);
    if (preset) onToast?.(`"${trimmed}" guardado como preset`, "success");
    else onToast?.("Servicio añadido pero no se pudo guardar como preset", "warning");
    closePicker();
  };

  const addBuiltin = (type: ServiceType) => {
    // Mantenemos la firma estricta a 2 args para no romper consumidores que
    // hagan toHaveBeenCalledWith("id", "TYPE") exacto.
    onAddService(flightId, type);
    closePicker();
  };

  const addPreset = (preset: CustomServicePreset) => {
    onAddService(flightId, "CUSTOM", preset.name, undefined, preset.defaultTarget ?? undefined);
    closePicker();
  };

  if (customMode) {
    return (
      <div className="edit-service-picker flex flex-col gap-2">
        <input
          ref={inputRef}
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setCustomMode(false);
              setCustomName("");
            } else if (e.key === "Enter") {
              e.preventDefault();
              addOneOff();
            }
          }}
          placeholder="Nombre del servicio…"
          maxLength={64}
          className="rounded border border-line px-2 py-1 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="hx-btn hx-btn-ghost hx-btn-sm"
            disabled={!customName.trim()}
            onClick={addOneOff}
          >
            Solo este vuelo
          </button>
          <button
            type="button"
            className="hx-btn hx-btn-ghost hx-btn-sm"
            disabled={!customName.trim()}
            onClick={saveAndAdd}
          >
            <Star size={10} aria-hidden /> Guardar como permanente
          </button>
          <button
            type="button"
            aria-label="Cancelar custom"
            className="hx-btn hx-btn-ghost hx-btn-sm ml-auto"
            onClick={() => {
              setCustomMode(false);
              setCustomName("");
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-service-picker">
      {SERVICE_TYPES.filter((t) => t !== "CUSTOM").map((t) => (
        <button
          key={t}
          type="button"
          className="hx-btn hx-btn-ghost hx-btn-sm"
          onClick={() => addBuiltin(t)}
        >
          {SERVICE_LABELS[t]}
        </button>
      ))}
      {presets.map((p) => (
        <PresetChip
          key={p.id}
          preset={p}
          onClick={() => addPreset(p)}
          onDelete={() => {
            void remove(p.id);
            onToast?.(`Preset "${p.name}" eliminado`, "info");
          }}
        />
      ))}
      <button
        type="button"
        className="hx-btn hx-btn-ghost hx-btn-sm"
        onClick={() => setCustomMode(true)}
      >
        <Plus size={10} aria-hidden /> Custom
      </button>
    </div>
  );
}
