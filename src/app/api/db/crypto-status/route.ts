// GET /api/db/crypto-status?secret=… — diagnostico de la clave PII (read-only).
//
// Cuando los endpoints que devuelven crew/pax dan 500 lo habitual es:
//   1. PASSPORT_ENCRYPTION_KEY no esta seteada en el runtime
//   2. La key del runtime no coincide con la que cifro los datos existentes
//   3. La key esta mal formateada (no son 32 bytes base64)
//
// Este endpoint distingue los tres casos sin exponer la clave ni los datos.
// Protegido con SETUP_SECRET para no revelar metadata sobre los registros.
//
// Usage:
//   https://<host>/api/db/crypto-status?secret=<SETUP_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const provided = req.nextUrl.searchParams.get("secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = process.env.PASSPORT_ENCRYPTION_KEY;
  const keyPresent = !!raw;
  const keyLength = raw ? raw.length : 0;
  let keyBytes = 0;
  let keyLooksValid = false;
  if (raw) {
    try {
      keyBytes = Buffer.from(raw, "base64").length;
      keyLooksValid = keyBytes === 32;
    } catch {
      keyLooksValid = false;
    }
  }

  async function probe(
    finder: () => Promise<{ id: string; passportEncrypted: string | null } | null>,
  ): Promise<{ sampleId: string | null; canDecrypt: boolean | null; error: string | null }> {
    try {
      const row = await finder();
      if (!row) return { sampleId: null, canDecrypt: null, error: null };
      if (!row.passportEncrypted) return { sampleId: row.id, canDecrypt: null, error: "no ciphertext on sample row" };
      try {
        decrypt(row.passportEncrypted);
        return { sampleId: row.id, canDecrypt: true, error: null };
      } catch (e) {
        return {
          sampleId: row.id,
          canDecrypt: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    } catch (e) {
      return {
        sampleId: null,
        canDecrypt: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const [passengerProbe, crewProbe] = await Promise.all([
    probe(() =>
      prisma.passenger.findFirst({
        where: { passportEncrypted: { not: null } },
        select: { id: true, passportEncrypted: true },
        orderBy: { createdAt: "desc" },
      }),
    ),
    probe(() =>
      prisma.crewMember.findFirst({
        where: { passportEncrypted: { not: null } },
        select: { id: true, passportEncrypted: true },
        orderBy: { createdAt: "desc" },
      }),
    ),
  ]);

  let diagnosis: string;
  if (!keyPresent) {
    diagnosis = "PASSPORT_ENCRYPTION_KEY is not set on this runtime — set it and redeploy";
  } else if (!keyLooksValid) {
    diagnosis = `PASSPORT_ENCRYPTION_KEY is set but decodes to ${keyBytes} bytes (expected 32) — fix the value`;
  } else if (passengerProbe.canDecrypt === false || crewProbe.canDecrypt === false) {
    diagnosis = "Key is well-formed but does not decrypt existing data — likely the key changed since the data was written";
  } else if (passengerProbe.canDecrypt === null && crewProbe.canDecrypt === null) {
    diagnosis = "Key looks valid; no encrypted rows in DB yet to verify against";
  } else {
    diagnosis = "Key is valid and decrypts existing data";
  }

  return NextResponse.json({
    keyPresent,
    keyLength,
    keyBytes,
    keyLooksValid,
    passengerProbe,
    crewProbe,
    diagnosis,
  });
}
