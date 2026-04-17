"use client";

import { useState, useRef, useEffect } from "react";

interface QuickTimeEditProps {
  value: string | null | undefined;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Click-to-edit time field. Used inline in collapsed cards for ETA/ETD.
 * Blur or Enter saves. Escape cancels.
 */
export function QuickTimeEdit({ value, onSave, placeholder = "--:--", className = "" }: QuickTimeEditProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    if (local !== (value || "")) onSave(local);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setLocal(value || ""); setEditing(false); }
        }}
        placeholder="HH:MM"
        className={`w-14 rounded border border-blue-400 bg-white px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
      />
    );
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setLocal(value || "");
        setEditing(true);
      }}
      className={`cursor-text rounded px-1 hover:bg-blue-50 ${className}`}
      title="Click para editar"
    >
      {value || placeholder}
    </span>
  );
}
