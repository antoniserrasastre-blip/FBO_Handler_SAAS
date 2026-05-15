import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Live tracking en pausa durante migración v2. Ver docs/REFACTOR-V2.md." },
    { status: 503 }
  );
}
