"use client";

import { useState, useRef, useEffect } from "react";

interface QuickTimeEditProps {
  value: string | null | undefined;
  onSave: (newValue: string) => void;
  placeholder?: string;
  className?: string;
}

function normalizeTimeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 4) return null;
  const padded = digits.padStart(4, "0");
  const hh = parseInt(padded.slice(0, 2), 10);
  const mm = parseInt(padded.slice(2, 4), 10);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

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
    const normalized = normalizeTimeInput(local);
    if (normalized === null) {
      setLocal(value || "");
      setEditing(false);
      return;
    }
    if (normalized !== (value || "")) onSave(normalized);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={local}
        onChange={(e) => {
          const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 4);
          setLocal(digitsOnly.length >= 3 ? `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}` : digitsOnly);
        }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setLocal(value || ""); setEditing(false); }
        }}
        placeholder="HHMM"
        className={`w-14 rounded border border-brand bg-white px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-brand-tint ${className}`}
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
      className={`inline-block cursor-text whitespace-nowrap rounded px-1 hover:bg-brand-tint ${className}`}
      title="Click para editar (escribe 4 dígitos)"
    >
      {value || placeholder}
    </span>
  );
}
