// CategoryPill — surfaces flightCategory (COMMERCIAL | FERRY | CANCELLED)
// and the orthogonal modifiedFlag. COMMERCIAL renders nothing because it's
// the default; FERRY/CANCELLED are loud because they're rare and actionable.

import { HelixPill } from "./Pill";
import type { FlightCategory } from "@/types/v2";

export interface CategoryPillProps {
  category: FlightCategory;
  modified?: boolean;
}

export function CategoryPill({ category, modified }: CategoryPillProps) {
  if (category === "COMMERCIAL" && !modified) return null;
  const pieces = [];
  if (category === "FERRY") {
    pieces.push(
      <span key="cat" className="hx-pill hx-pill-ferry">
        <span className="dot" />
        FERRY
      </span>
    );
  } else if (category === "CANCELLED") {
    pieces.push(
      <span key="cat" className="hx-pill hx-pill-cancelled">
        <span className="dot" />
        CANCELADO
      </span>
    );
  }
  if (modified) {
    pieces.push(
      <HelixPill key="mod" tone="warning" className="hx-pill-modified">
        ★ modificado
      </HelixPill>
    );
  }
  return <>{pieces}</>;
}
