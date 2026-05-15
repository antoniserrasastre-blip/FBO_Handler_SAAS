// PetCount — small dog-paw icon plus count, shown only when petCount > 0.
// Pets are tracked separately from pax counts in NetJets ALS.

export function PetCount({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="hx-pill hx-pill-pet" title={`${count} mascota${count > 1 ? "s" : ""}`}>
      <PawIcon />
      {count}
    </span>
  );
}

function PawIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="4" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <circle cx="2" cy="16" r="2" />
      <path d="M11 9c-2.5 0-5 2-5 5 0 2 1 4 3 5 1.5.75 2.5.75 4 0 2-1 3-3 3-5 0-3-2.5-5-5-5z" />
    </svg>
  );
}
