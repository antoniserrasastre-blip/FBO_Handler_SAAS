// AES-256-GCM encryption + SHA-256 hashing for passenger/crew PII.
//
// Keys live in env. The key is base64-encoded 32 bytes. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Stored ciphertext format: base64(iv || authTag || ciphertext).
// Loss of PASSPORT_ENCRYPTION_KEY = permanent loss of decrypted PII. Back it up.

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;     // recommended for GCM
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PASSPORT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PASSPORT_ENCRYPTION_KEY missing. Generate with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PASSPORT_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        "Use a fresh 32-byte random value, base64-encoded."
    );
  }
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext string. Returns null when input is empty/null so callers
 * can pass-through unencrypted nullable fields directly.
 */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a base64 ciphertext produced by `encrypt`. Returns null for null
 * input so the round-trip is symmetric.
 */
export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext too short — malformed payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Deterministic SHA-256 hash for indexable PII (passport number, fullName).
 * Input is normalised: trimmed and upper-cased so "ab12cd" and " Ab12CD "
 * collide as expected for dedupe.
 */
export function hashPII(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const normalised = value.trim().toUpperCase();
  return crypto.createHash("sha256").update(normalised, "utf8").digest("hex");
}

/** Convenience: encrypt + hash in one call for passport-like fields. */
export function encryptWithHash(
  value: string | null | undefined
): { encrypted: string | null; hash: string | null } {
  return { encrypted: encrypt(value), hash: hashPII(value) };
}
