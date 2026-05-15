import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Export por vuelo en pausa durante migración v2. Ver docs/REFACTOR-V2.md." },
    { status: 503 }
  );
}
