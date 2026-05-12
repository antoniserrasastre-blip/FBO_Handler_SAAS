"use client";

import { useState, useEffect } from "react";

interface Props {
  value: number | null | undefined;
  onSave: (v: number | null) => void;
  min?: number;
  max?: number;
  /** Allow null when input is cleared. Otherwise resets to 0. */
  nullable?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Inline numeric editor. Click swaps to input, blur or Enter saves, Escape cancels.
 * Used in /dia panel for crew/pax counts.
 */
export function InlineNumber({
  value,
  onSave,
  min = 0,
  max,
  nullable = false,
  className = "",
  placeholder = "—",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value?.toString() ?? "");

  useEffect(() => {
    setLocal(value?.toString() ?? "");
  }, [value]);

  if (!editing) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setLocal(value?.toString() ?? "");
          setEditing(true);
        }}
        className={`cursor-text rounded px-1 py-0.5 hover:bg-blue-50 ${className}`}
        title="Click para editar"
      >
        {value ?? <span className="text-gray-300">{placeholder}</span>}
      </span>
    );
  }

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      if (nullable) onSave(null);
      else onSave(0);
    } else {
      const n = parseInt(trimmed, 10);
      if (Number.isFinite(n) && n !== value) {
        let bounded = n;
        if (typeof min === "number" && bounded < min) bounded = min;
        if (typeof max === "number" && bounded > max) bounded = max;
        onSave(bounded);
      }
    }
    setEditing(false);
  };

  return (
    <input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setLocal(value?.toString() ?? "");
          setEditing(false);
        }
      }}
      autoFocus
      className={`w-14 rounded border border-blue-400 px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
    />
  );
}
