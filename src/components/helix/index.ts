/**
 * Helix Design System — public primitives.
 *
 * Source of truth: design-system/Helix Design System.html
 * Tokens (colour / type / spacing / radius / shadow) live in src/app/globals.css
 * and are exposed to Tailwind via tailwind.config.ts.
 */
export { HelixLogo } from "./Logo";
export { HelixButton } from "./Button";
export type { HelixButtonProps } from "./Button";
export { HelixPill, StatePill } from "./Pill";
export type { HelixPillProps, FboState } from "./Pill";
export { ServicePip } from "./ServicePip";
export type { ServicePipProps, ServicePipState } from "./ServicePip";
export { ServiceIcons, ServiceLabels } from "./ServiceIcons";
export type { ServiceKey } from "./ServiceIcons";
export { Stat, StatBand } from "./Stat";
export type { StatProps } from "./Stat";
export { HelixHeader } from "./AppHeader";
export type { HelixHeaderProps, HeaderTab } from "./AppHeader";
export { HelixFooter } from "./AppFooter";
export type { HelixFooterProps } from "./AppFooter";
export { AppShell } from "./AppShell";
export { useDate } from "./useDate";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedControlOption } from "./SegmentedControl";

// v2 — domain-aware primitives
export { CategoryPill } from "./CategoryPill";
export type { CategoryPillProps } from "./CategoryPill";
export { AircraftBadge } from "./AircraftBadge";
export type { AircraftBadgeProps } from "./AircraftBadge";
export { OperatorBadge } from "./OperatorBadge";
export type { OperatorBadgeProps } from "./OperatorBadge";
export { RqstChip } from "./RqstChip";
export { PetCount } from "./PetCount";
export { PassportField } from "./PassportField";
export type { PassportFieldProps } from "./PassportField";
export { MovementRow } from "./MovementRow";
export type { MovementRowProps } from "./MovementRow";
