import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/roles";
import { parseGenDecText } from "@/lib/gendecParser";

export const dynamic = "force-dynamic";

const MAX_TEXT_BYTES = 200_000; // 200 KB — generous for big GenDec emails

/**
 * POST /api/flights/[id]/gendec/extract
 * Body: { text: string }
 * Returns: { crew: ParsedPerson[], passengers: ParsedPerson[] }
 *
 * Parsea el texto pegado y devuelve preview. NO escribe en DB. La UI deja
 * editar y luego POSTea cada entrada a /crew y /passengers existentes.
 *
 * Privacidad: el parser corre en proceso. Nada sale del container.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireWriter();
  if (error) return error;

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: "text too large" }, { status: 413 });
  }

  const result = parseGenDecText(text);
  return NextResponse.json(result);
}
