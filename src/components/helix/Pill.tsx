import { HTMLAttributes, ReactNode } from "react";

type PillTone = "default" | "success" | "warning" | "danger" | "info" | "brand";

export interface HelixPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  dot?: boolean;
  children?: ReactNode;
}

const toneClass: Record<PillTone, string> = {
  default: "hx-pill-default",
  success: "hx-pill-success",
  warning: "hx-pill-warning",
  danger: "hx-pill-danger",
  info: "hx-pill-info",
  brand: "hx-pill-brand",
};

export function HelixPill({
  tone = "default",
  dot,
  className = "",
  children,
  ...rest
}: HelixPillProps) {
  return (
    <span className={`hx-pill ${toneClass[tone]} ${className}`} {...rest}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

/* ─── State pill (FBO sagrados — los 7 estados de turnaround) ───────────── */

export type FboState =
  | "expected"
  | "approach"
  | "onblocks"
  | "parked"
  | "turn"
  | "board"
  | "departed";

const stateClass: Record<FboState, string> = {
  expected: "hx-st-expected",
  approach: "hx-st-approach",
  onblocks: "hx-st-onblocks",
  parked: "hx-st-parked",
  turn: "hx-st-turn",
  board: "hx-st-board",
  departed: "hx-st-departed",
};

const stateLabel: Record<FboState, string> = {
  expected: "Previsto",
  approach: "Aprox",
  onblocks: "On blocks",
  parked: "Parked",
  turn: "Turn",
  board: "Boarding",
  departed: "Departed",
};

export function StatePill({
  state,
  label,
  dot = true,
  className = "",
}: {
  state: FboState;
  label?: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`hx-state-pill ${stateClass[state]} ${className}`}>
      {dot ? <span className="dot" /> : null}
      {label ?? stateLabel[state]}
    </span>
  );
}
