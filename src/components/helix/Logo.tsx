/**
 * Helix wordmark — double-helix in cobalt. Used in app chrome and login.
 * Source: design-system/Helix Design System.html (brand-mark / logo-large).
 */
export function HelixLogo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-26 -26 52 52"
      className={className}
      aria-label="Helix"
      role="img"
    >
      <g fill="none" stroke="var(--c-brand)" strokeWidth={3} strokeLinecap="round">
        <path d="M 0,-22 C -11,-22 -11,-11 0,-11 C 11,-11 11,0 0,0 C -11,0 -11,11 0,11 C 11,11 11,22 0,22" />
        <path
          d="M 0,-22 C 11,-22 11,-11 0,-11 C -11,-11 -11,0 0,0 C 11,0 11,11 0,11 C -11,11 -11,22 0,22"
          opacity={0.42}
        />
      </g>
    </svg>
  );
}
