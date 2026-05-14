import { ReactElement, SVGProps } from "react";

/**
 * Helix service icon catalog — 20 pictograms covering everything an FBO can sell.
 * Source: design-system/Helix Design System.html (svc-catalog section).
 *
 * Use directly, or wrap in <ServicePip> for a circular badge with state colours.
 */

export type ServiceKey =
  | "fuel"
  | "water"
  | "lavatory"
  | "catering"
  | "cleaning"
  | "laundry"
  | "pets"
  | "customs"
  | "pushback"
  | "deice"
  | "gpu"
  | "ac"
  | "hotel"
  | "transport"
  | "maintenance"
  | "medical"
  | "vip"
  | "stairs"
  | "coffee"
  | "cargo";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const ServiceIcons: Record<ServiceKey, (p?: IconProps) => ReactElement> = {
  fuel: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 22h12" />
      <path d="M4 9h10" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </svg>
  ),
  water: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M9 2h6v2H9z" />
      <path d="M10 4v2c-2 0-2 1-2 3v11a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V9c0-2 0-3-2-3V4" />
      <line x1="8" y1="13" x2="16" y2="13" />
    </svg>
  ),
  lavatory: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M5 4h14v6H5z" />
      <path d="M6 12h12l-1 4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
      <line x1="11" y1="18" x2="11" y2="21" />
      <line x1="13" y1="18" x2="13" y2="21" />
    </svg>
  ),
  catering: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 3 0 0 0-5 3v7c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  ),
  cleaning: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 3h7v3H3z" />
      <path d="M3 6v14a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V6" />
      <line x1="7" y1="3" x2="7" y2="1" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="18" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="15" r="1" fill="currentColor" />
    </svg>
  ),
  laundry: (p) => (
    <svg {...baseProps} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="6" cy="6" r="0.7" fill="currentColor" />
      <circle cx="9" cy="6" r="0.7" fill="currentColor" />
      <circle cx="12" cy="14" r="5" />
      <path d="M9.5 12c.5-1 2-1.5 3-1.5s2.5 .5 3 1.5" />
    </svg>
  ),
  pets: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M10 5l-2 4M14 5l2 4" />
      <path d="M7 12c0-2 2-3 5-3s5 1 5 3" />
      <path d="M5 14c0 4 3 6 7 6s7-2 7-6" />
      <circle cx="10" cy="14" r="0.8" fill="currentColor" />
      <circle cx="14" cy="14" r="0.8" fill="currentColor" />
      <path d="M11 17h2" />
    </svg>
  ),
  customs: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M4 14h16v3H4z" />
      <path d="M5 14v-3a7 4 0 0 1 14 0v3" />
      <path d="M8 11h8" />
      <circle cx="12" cy="11" r="1" fill="currentColor" />
    </svg>
  ),
  pushback: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M2 9h11v8H2z" />
      <path d="M13 11h5l3 3v3h-8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  deice: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M12 2v8" />
      <path d="M9 5l3 3 3-3" />
      <path d="M12 11c-2 0-3 2-3 4a3 3 0 0 0 6 0c0-2-1-4-3-4z" />
    </svg>
  ),
  gpu: (p) => (
    <svg {...baseProps} {...p}>
      <line x1="9" y1="3" x2="9" y2="9" />
      <line x1="15" y1="3" x2="15" y2="9" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0z" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  ),
  ac: (p) => (
    <svg {...baseProps} {...p}>
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="7" x2="22" y2="17" />
      <line x1="2" y1="17" x2="22" y2="7" />
      <path d="M12 5l-3-3M12 5l3-3M12 19l-3 3M12 19l3 3" />
    </svg>
  ),
  hotel: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M2 19v-7" />
      <path d="M22 19v-7" />
      <line x1="2" y1="14" x2="22" y2="14" />
      <path d="M2 11h8a3 3 0 0 1 3 3" />
      <path d="M5 11V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  transport: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M5 14l2-5h10l2 5" />
      <path d="M3 14h18v4H3z" />
      <circle cx="7" cy="17" r="1.2" fill="currentColor" />
      <circle cx="17" cy="17" r="1.2" fill="currentColor" />
    </svg>
  ),
  maintenance: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5.7 5.7l-7 7a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0l7-7a4 4 0 0 0 5.7-5.7l-3 3-2-2 3-3z" />
    </svg>
  ),
  medical: (p) => (
    <svg {...baseProps} {...p}>
      <rect x="10" y="3" width="4" height="18" rx="1" fill="currentColor" />
      <rect x="3" y="10" width="18" height="4" rx="1" fill="currentColor" />
    </svg>
  ),
  vip: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M5 10v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
      <path d="M3 10h18" />
      <path d="M7 10V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v4" />
    </svg>
  ),
  stairs: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M4 21h4v-3h4v-3h4v-3h4v-3" />
    </svg>
  ),
  coffee: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      <path d="M16 10a3 3 0 0 1 0 6" />
      <path d="M8 4v2M12 4v2M16 4v2" />
    </svg>
  ),
  cargo: (p) => (
    <svg {...baseProps} {...p}>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  ),
};

export const ServiceLabels: Record<ServiceKey, string> = {
  fuel: "Fuel",
  water: "Water",
  lavatory: "Lavatory",
  catering: "Catering",
  cleaning: "Limpieza",
  laundry: "Laundry",
  pets: "Pets",
  customs: "Customs",
  pushback: "Pushback",
  deice: "De-ice",
  gpu: "GPU",
  ac: "AC",
  hotel: "Hotel",
  transport: "Transport",
  maintenance: "Maint.",
  medical: "Médico",
  vip: "VIP",
  stairs: "Stairs",
  coffee: "Coffee",
  cargo: "Cargo",
};
