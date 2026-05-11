import { describe, it, expect } from "vitest";
import { validateUpload, validateContentLength } from "./uploadValidation";

describe("validateUpload", () => {
  it("accepts a small valid PDF", () => {
    const r = validateUpload({ name: "in.pdf", type: "application/pdf", size: 1024 }, "pdf");
    expect(r.ok).toBe(true);
  });

  it("rejects a PDF over 10 MB with 413", () => {
    const r = validateUpload({ name: "huge.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }, "pdf");
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects text/plain for PDF endpoint with 415", () => {
    const r = validateUpload({ name: "in.txt", type: "text/plain", size: 100 }, "pdf");
    expect(r).toMatchObject({ ok: false, status: 415 });
  });

  it("accepts xlsx by mime", () => {
    const r = validateUpload({
      name: "x.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 1024,
    }, "xlsx");
    expect(r.ok).toBe(true);
  });

  it("accepts xlsx by extension when mime is blank", () => {
    const r = validateUpload({ name: "x.xlsx", type: "", size: 1024 }, "xlsx");
    expect(r.ok).toBe(true);
  });

  it("rejects xlsx over 5 MB with 413", () => {
    const r = validateUpload({ name: "x.xlsx", type: "", size: 6 * 1024 * 1024 }, "xlsx");
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects pdf masquerading as xlsx", () => {
    const r = validateUpload({ name: "x.pdf", type: "application/pdf", size: 100 }, "xlsx");
    expect(r).toMatchObject({ ok: false, status: 415 });
  });
});

describe("validateContentLength", () => {
  it("passes when header is missing", () => {
    expect(validateContentLength(null, "pdf")).toEqual({ ok: true });
  });

  it("passes when value is non-numeric", () => {
    expect(validateContentLength("not-a-number", "pdf")).toEqual({ ok: true });
  });

  it("passes for body under the limit", () => {
    const oneMb = String(1 * 1024 * 1024);
    expect(validateContentLength(oneMb, "pdf")).toEqual({ ok: true });
  });

  it("rejects with 413 when body exceeds the pdf limit", () => {
    const twentyMb = String(20 * 1024 * 1024);
    expect(validateContentLength(twentyMb, "pdf")).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects with 413 when body exceeds the xlsx limit", () => {
    const tenMb = String(10 * 1024 * 1024);
    expect(validateContentLength(tenMb, "xlsx")).toMatchObject({ ok: false, status: 413 });
  });
});
