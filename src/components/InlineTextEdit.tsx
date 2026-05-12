"use client";

import { useState } from "react";

interface Props {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** When true, stops click propagation so it can be embedded in clickable rows. */
  stopPropagation?: boolean;
}

/**
 * Click-to-edit text field. Blur or Enter saves. Escape cancels.
 * Used in PassengerCrewModal and the /dia tablon for inline parking edits.
 */
export function InlineTextEdit({
  value,
  onSave,
  placeholder,
  className = "",
  inputClassName = "",
  stopPropagation = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (!editing) {
    return (
      <span
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setLocal(value);
          setEditing(true);
        }}
        className={`cursor-text rounded px-1 py-0.5 hover:bg-blue-50 ${className}`}
        title="Click para editar"
      >
        {value || <span className="text-gray-300">{placeholder || "---"}</span>}
      </span>
    );
  }

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onClick={(e) => stopPropagation && e.stopPropagation()}
      onBlur={() => {
        if (local !== value) onSave(local);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          setEditing(false);
        }
      }}
      autoFocus
      className={`w-full rounded border border-blue-400 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${inputClassName}`}
    />
  );
}
