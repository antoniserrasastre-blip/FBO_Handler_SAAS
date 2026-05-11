import { describe, it, expect } from "vitest";
import { validateUpload } from "./uploadValidation";

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
