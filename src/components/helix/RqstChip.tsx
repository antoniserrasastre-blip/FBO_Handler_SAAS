// RqstChip — NetJets ALS order number. Mono, small. Surfaces provenance
// without competing with the callsign for attention.

export function RqstChip({ rqstNumber }: { rqstNumber?: string | null }) {
  if (!rqstNumber) return null;
  return (
    <span className="hx-pill-rqst" title={`Orden NJE ${rqstNumber}`}>
      #{rqstNumber}
    </span>
  );
}
