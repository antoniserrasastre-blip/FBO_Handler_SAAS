// Set the encryption key before importing the module — the module caches the
// parsed key on first use, so env must be present before the first call.
import { beforeAll, describe, it, expect } from "vitest";

// A stable 32-byte test key (all zeros). Never use in production.
const TEST_KEY_BASE64 = Buffer.alloc(32, 0).toString("base64");

beforeAll(() => {
  process.env.PASSPORT_ENCRYPTION_KEY = TEST_KEY_BASE64;
});

// Import after env is guaranteed to be set (static import hoisting is fine
// because vitest runs beforeAll before any test in the file, and the module
// is evaluated lazily only when a test function runs).
import { encrypt, decrypt, hashPII, encryptWithHash } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// encrypt / decrypt round-trip
// ---------------------------------------------------------------------------
describe("encrypt / decrypt round-trip", () => {
  it("encrypts and decrypts a plain ASCII string", () => {
    const plain = "Hello, World!";
    const cipher = encrypt(plain);
    expect(cipher).not.toBeNull();
    expect(cipher).not.toBe(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  it("round-trips a string with non-ASCII characters (ñ, acentos)", () => {
    const plain = "José María Ñoño — pasajero nº 3";
    const cipher = encrypt(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  it("round-trips a string with emojis and mixed Unicode", () => {
    const plain = "Ângela Björk-Müller 🛫 席位";
    const cipher = encrypt(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  it("round-trips a passport number (alphanumeric)", () => {
    const plain = "PAB123456";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("each call produces a different ciphertext (random IV)", () => {
    const plain = "same input";
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    // Different IVs → different ciphertext, even for same plaintext
    expect(c1).not.toBe(c2);
    // But both decrypt correctly
    expect(decrypt(c1)).toBe(plain);
    expect(decrypt(c2)).toBe(plain);
  });

  it("returns null for null input (symmetric null pass-through)", () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(encrypt(undefined)).toBeNull();
    expect(decrypt(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(encrypt("")).toBeNull();
  });

  it("decrypt(null) → null (symmetric)", () => {
    expect(decrypt(encrypt(null))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decrypt — error on malformed / too-short payload
// ---------------------------------------------------------------------------
describe("decrypt — malformed ciphertext", () => {
  it('throws "too short" when payload is too short', () => {
    // IV=12 bytes + tag=16 bytes + at least 1 byte of ciphertext = 29 bytes minimum.
    // A 28-byte base64 payload should fail.
    const shortPayload = Buffer.alloc(28, 0).toString("base64");
    expect(() => decrypt(shortPayload)).toThrow(/too short/i);
  });

  it("throws when payload has valid length but corrupted auth tag (GCM integrity)", () => {
    // Start with a valid ciphertext, then flip a byte in the auth-tag area
    const plain = "sensitive data";
    const valid = encrypt(plain) as string;
    const buf = Buffer.from(valid, "base64");
    // Flip a byte in the auth tag (bytes 12..27)
    buf[15] ^= 0xff;
    const corrupted = buf.toString("base64");
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("throws when ciphertext bytes are corrupted (GCM integrity)", () => {
    const plain = "sensitive data";
    const valid = encrypt(plain) as string;
    const buf = Buffer.from(valid, "base64");
    // Flip a byte in the actual ciphertext (after IV+tag = byte 28+)
    buf[buf.length - 1] ^= 0xff;
    const corrupted = buf.toString("base64");
    expect(() => decrypt(corrupted)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// hashPII — deterministic, normalised SHA-256
// ---------------------------------------------------------------------------
describe("hashPII", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const h = hashPII("ABC123");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input always gives same hash", () => {
    expect(hashPII("AB123456")).toBe(hashPII("AB123456"));
  });

  it("normalizes to upper-case before hashing (dedupe)", () => {
    expect(hashPII("ab12cd")).toBe(hashPII("AB12CD"));
    expect(hashPII("Ab12Cd")).toBe(hashPII("AB12CD"));
  });

  it("normalizes by trimming whitespace (dedupe of passport duplicates)", () => {
    expect(hashPII("  AB12CD  ")).toBe(hashPII("AB12CD"));
    expect(hashPII(" José ")).toBe(hashPII("JOSÉ"));
  });

  it("different inputs produce different hashes", () => {
    expect(hashPII("PAB123456")).not.toBe(hashPII("PAB123457"));
  });

  it("returns null for null input", () => {
    expect(hashPII(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(hashPII(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(hashPII("")).toBeNull();
  });

  it("hash of non-ASCII input is stable across calls", () => {
    const h1 = hashPII("ñoño");
    const h2 = hashPII("ÑOÑO");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// encryptWithHash — convenience wrapper
// ---------------------------------------------------------------------------
describe("encryptWithHash", () => {
  it("returns both encrypted and hash for a valid value", () => {
    const result = encryptWithHash("PAB123456");
    expect(result.encrypted).not.toBeNull();
    expect(result.hash).not.toBeNull();
    // Decrypt should recover the original
    expect(decrypt(result.encrypted)).toBe("PAB123456");
    // Hash should match standalone hashPII
    expect(result.hash).toBe(hashPII("PAB123456"));
  });

  it("returns { encrypted: null, hash: null } for null input", () => {
    const result = encryptWithHash(null);
    expect(result).toEqual({ encrypted: null, hash: null });
  });

  it("returns { encrypted: null, hash: null } for empty string", () => {
    const result = encryptWithHash("");
    expect(result).toEqual({ encrypted: null, hash: null });
  });

  it("hash is stable (same value → same hash) even with different ciphertexts", () => {
    const r1 = encryptWithHash("passport");
    const r2 = encryptWithHash("passport");
    // Different ciphertexts (random IV)
    expect(r1.encrypted).not.toBe(r2.encrypted);
    // Same hash
    expect(r1.hash).toBe(r2.hash);
  });

  it("non-ASCII value round-trips correctly via encryptWithHash", () => {
    const value = "María Ñuño";
    const result = encryptWithHash(value);
    expect(decrypt(result.encrypted)).toBe(value);
    expect(result.hash).toBe(hashPII(value));
  });
});
