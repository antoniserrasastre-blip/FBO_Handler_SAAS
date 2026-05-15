// PassportField — surfaces a passport number with a lock UI. Click reveals
// the value, click again hides it. The value comes pre-decrypted from the
// API (the crypto.decrypt happens server-side); this component never sees
// ciphertext. The provenance tag (NETJETS, MANUAL, GENDEC_PASTE…) hints to
// the handler whether the data is trustworthy.

"use client";

import { useState } from "react";
import { Lock, Eye } from "lucide-react";

export interface PassportFieldProps {
  value: string | null | undefined;
  source?: string | null;          // PassengerSource — NETJETS | VISTAJET | EJU | GENDEC_PASTE | MANUAL
  size?: "sm" | "md";
}

const MASK = "•••••• ••••";

export function PassportField({ value, source, size = "md" }: PassportFieldProps) {
  const [revealed, setRevealed] = useState(false);
  if (!value) {
    return (
      <span className="hx-pii locked" style={{ fontSize: size === "sm" ? 11 : undefined }}>
        <Lock size={12} className="lock" />
        <span className="value">sin pasaporte</span>
      </span>
    );
  }
  return (
    <span
      className={`hx-pii ${revealed ? "revealed" : "locked"}`}
      style={{ fontSize: size === "sm" ? 11 : undefined }}
    >
      {revealed ? <Eye size={12} className="lock" /> : <Lock size={12} className="lock" />}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setRevealed((v) => !v); }}
        title={revealed ? "Ocultar pasaporte" : "Mostrar pasaporte"}
      >
        <span className="value">{revealed ? value : MASK}</span>
      </button>
      {source && source !== "MANUAL" ? <span className="source-tag">{source}</span> : null}
    </span>
  );
}
