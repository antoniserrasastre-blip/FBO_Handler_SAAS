// /api/export — v2: deprecated until rewritten against Visit/Movement.
// Returns 503 so the UI can degrade gracefully. The exports were
// PDF/Excel renders of the day sheet; porting them is tracked in
// docs/REFACTOR-V2.md.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Export en pausa durante migración v2. Ver docs/REFACTOR-V2.md." },
    { status: 503 }
  );
}
