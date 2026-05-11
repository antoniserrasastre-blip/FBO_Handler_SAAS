// Common upload validation for import endpoints.

export type UploadKind = "pdf" | "xlsx";

const RULES: Record<UploadKind, { maxBytes: number; mimes: string[]; exts: string[] }> = {
  pdf: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    mimes: ["application/pdf"],
    exts: [".pdf"],
  },
  xlsx: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    mimes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      // Some browsers/sources send an empty MIME for binary files; the extension check covers it.
      "",
      "application/octet-stream",
    ],
    exts: [".xlsx", ".xls"],
  },
};

export type ValidationError =
  | { ok: false; status: 413; message: string }
  | { ok: false; status: 415; message: string };

export type ValidationResult = { ok: true } | ValidationError;

export function validateUpload(file: { name?: string; type?: string; size: number }, kind: UploadKind): ValidationResult {
  const rule = RULES[kind];
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / 1024 / 1024);
    return { ok: false, status: 413, message: `Archivo "${file.name || "(sin nombre)"}" supera ${mb} MB` };
  }
  const ext = (file.name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const mime = (file.type || "").toLowerCase();
  const mimeOk = rule.mimes.includes(mime);
  const extOk = ext !== "" && rule.exts.includes(ext);
  if (!mimeOk && !extOk) {
    return { ok: false, status: 415, message: `Tipo no admitido para "${file.name || "(sin nombre)"}" (esperado ${rule.exts.join("/")})` };
  }
  return { ok: true };
}
