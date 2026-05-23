// CrewInventory — inventario de objetos que la crew deja guardados en la llegada y se devuelven en la salida.

"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, Check, Package } from "lucide-react";
import { CREW_ITEM_TYPES, CREW_ITEM_LABELS, type CrewItemType } from "@/types";
import { HelixButton } from "@/components/helix";

interface CrewItem {
  id: string;
  type: string;
  customName: string | null;
  quantity: number;
  state: string; // "STORED" | "RETURNED"
  notes: string | null;
  storedAt: Date | string | null;
  returnedAt: Date | string | null;
  createdAt: Date | string;
}

export interface CrewInventoryProps {
  visitId: string;
  items: CrewItem[];
  readOnly?: boolean;
  onChanged?: () => void;
}

function labelFor(item: CrewItem): string {
  if (item.type === "CUSTOM") return item.customName?.trim() || CREW_ITEM_LABELS.CUSTOM;
  return CREW_ITEM_LABELS[item.type as CrewItemType] ?? item.type;
}

interface CrewItemChipProps {
  item: CrewItem;
  readOnly?: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function CrewItemChip({ item, readOnly, onToggle, onDelete }: CrewItemChipProps) {
  const returned = item.state === "RETURNED";
  const label = labelFor(item);
  const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
  const stateText = returned ? "Devuelto" : "Guardado";

  const toneClass = returned
    ? "hx-pill-success opacity-60 line-through"
    : "hx-pill-default";

  const ariaHint = readOnly
    ? ""
    : returned
      ? " — toca para reabrir (marcar guardado)"
      : " — toca para marcar devuelto";

  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        disabled={readOnly}
        onClick={readOnly ? undefined : onToggle}
        className={`hx-pill ${toneClass} ${readOnly ? "cursor-default" : "cursor-pointer"}`}
        title={`${label}${qty}: ${stateText}${item.notes ? ` · ${item.notes}` : ""}${ariaHint}`}
        aria-label={`${label}${qty}: ${stateText}.${ariaHint}`}
        style={{ touchAction: "manipulation", paddingRight: readOnly ? undefined : "1.25rem" }}
      >
        {returned ? <Check size={11} aria-hidden /> : <span className="dot" aria-hidden />}
        <span className="max-w-[160px] truncate">
          {label}
          {qty}
        </span>
      </button>
      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Eliminar ${label}`}
          title="Eliminar"
          className="absolute right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-3 opacity-0 transition hover:bg-bg-muted hover:text-danger-strong group-hover:opacity-100 focus:opacity-100"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function CrewInventory({ visitId, items, readOnly, onChanged }: CrewInventoryProps) {
  const [localItems, setLocalItems] = useState<CrewItem[]>(items);
  const [open, setOpen] = useState(false);
  const [pickType, setPickType] = useState<CrewItemType>(CREW_ITEM_TYPES[0]);
  const [pickQty, setPickQty] = useState(1);
  const [pickName, setPickName] = useState("");
  const [busy, setBusy] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Re-sincroniza con la prop si el padre nos pasa un array distinto por identidad.
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Click-outside + Escape para cerrar el popover.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Autofocus al nombre cuando el tipo es CUSTOM.
  useEffect(() => {
    if (open && pickType === "CUSTOM") nameInputRef.current?.focus();
  }, [open, pickType]);

  const base = `/api/flights/${visitId}/crew-items`;

  const resetPicker = () => {
    setPickType(CREW_ITEM_TYPES[0]);
    setPickQty(1);
    setPickName("");
  };

  const closePicker = () => {
    setOpen(false);
    resetPicker();
  };

  const refetch = async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) return;
      const data = (await res.json()) as CrewItem[];
      if (Array.isArray(data)) setLocalItems(data);
    } catch (err) {
      console.error("CrewInventory refetch error", err);
    }
  };

  const addItem = async () => {
    if (busy) return;
    const trimmed = pickName.trim();
    if (pickType === "CUSTOM" && !trimmed) return;
    const qty = Number.isFinite(pickQty) && pickQty > 0 ? Math.floor(pickQty) : 1;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pickType,
          customName: pickType === "CUSTOM" ? trimmed : undefined,
          quantity: qty,
        }),
      });
      if (!res.ok) throw new Error(`POST failed: ${res.status}`);
      const created = (await res.json()) as CrewItem;
      setLocalItems((prev) => [...prev, created]);
      onChanged?.();
      closePicker();
    } catch (err) {
      console.error("CrewInventory addItem error", err);
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (item: CrewItem) => {
    if (busy) return;
    const nextState = item.state === "RETURNED" ? "STORED" : "RETURNED";
    // Optimista: aplicamos el cambio y revertimos si falla.
    const prevItems = localItems;
    setLocalItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, state: nextState } : it)));
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, state: nextState }),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      const updated = (await res.json()) as CrewItem;
      setLocalItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      onChanged?.();
    } catch (err) {
      console.error("CrewInventory toggleItem error", err);
      setLocalItems(prevItems);
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (item: CrewItem) => {
    if (busy) return;
    const prevItems = localItems;
    setLocalItems((prev) => prev.filter((it) => it.id !== item.id));
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      onChanged?.();
    } catch (err) {
      console.error("CrewInventory deleteItem error", err);
      setLocalItems(prevItems);
    } finally {
      setBusy(false);
    }
  };

  const hasItems = localItems.length > 0;

  // Sin items y en solo-lectura: no renderizamos nada.
  if (readOnly && !hasItems) return <></>;

  const showHeader = hasItems || !readOnly;

  return (
    <div className="flex flex-col gap-1.5">
      {showHeader && (
        <span className="text-xs font-medium text-ink-3">Inventario crew</span>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {localItems.map((item) => (
          <CrewItemChip
            key={item.id}
            item={item}
            readOnly={readOnly}
            onToggle={() => void toggleItem(item)}
            onDelete={() => void deleteItem(item)}
          />
        ))}

        {!readOnly && (
          <div className="relative" ref={popoverRef}>
            <HelixButton
              variant="ghost"
              size="sm"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <Plus size={12} aria-hidden /> Inventario
            </HelixButton>

            {open && (
              <div
                role="dialog"
                aria-label="Añadir al inventario crew"
                className="absolute left-0 top-full z-20 mt-1 flex w-64 flex-col gap-2 rounded-hx-md border border-line bg-bg p-3 shadow-hx-lg"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <Package size={13} aria-hidden /> Añadir al inventario
                </div>

                <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                  Tipo
                  <select
                    value={pickType}
                    onChange={(e) => setPickType(e.target.value as CrewItemType)}
                    className="rounded-hx-md border border-line bg-bg-muted px-2 py-1.5 text-xs text-ink-1"
                  >
                    {CREW_ITEM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CREW_ITEM_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>

                {pickType === "CUSTOM" && (
                  <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                    Nombre
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={pickName}
                      onChange={(e) => setPickName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addItem();
                        }
                      }}
                      placeholder="Describe el objeto…"
                      maxLength={64}
                      className="rounded-hx-md border border-line bg-bg-muted px-2 py-1.5 text-xs text-ink-1"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1 text-[11px] text-ink-3">
                  Cantidad
                  <input
                    type="number"
                    min={1}
                    value={pickQty}
                    onChange={(e) => setPickQty(Number(e.target.value))}
                    className="rounded-hx-md border border-line bg-bg-muted px-2 py-1.5 text-xs text-ink-1"
                  />
                </label>

                <div className="mt-1 flex items-center justify-end gap-2">
                  <HelixButton variant="ghost" size="sm" onClick={closePicker}>
                    Cancelar
                  </HelixButton>
                  <HelixButton
                    variant="primary"
                    size="sm"
                    disabled={busy || (pickType === "CUSTOM" && !pickName.trim())}
                    onClick={() => void addItem()}
                  >
                    Añadir
                  </HelixButton>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
