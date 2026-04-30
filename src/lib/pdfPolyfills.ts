// Stub the DOM globals that pdfjs-dist 5.x references at module init.
//
// pdfjs-dist evaluates `new DOMMatrix()` (and friends) at top level. In
// browsers the globals exist; in Node they normally come from
// @napi-rs/canvas, which pdf-parse loads transitively. On Vercel's
// serverless runtime that native binary is unreliable to ship — even with
// outputFileTracingIncludes the require path can fail. Since the only
// pdf-parse code path we use is `getTextContent`, which never invokes any
// of these classes' methods, empty stubs are sufficient to let module init
// complete. Verified locally: with @napi-rs/canvas removed and these stubs
// in place, parseCybermaxPdf still extracts every flight on the April PDFs.
//
// This file must be imported BEFORE any module that imports pdf-parse.

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as any;

if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = class {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: unknown) {}
    multiply() { return new g.DOMMatrix(); }
    invertSelf() { return this; }
    translateSelf() { return this; }
    scaleSelf() { return this; }
    transformPoint(p: unknown) { return p; }
  };
}

if (typeof g.Path2D === "undefined") {
  g.Path2D = class {
    constructor(_init?: unknown) {}
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
  };
}

if (typeof g.ImageData === "undefined") {
  g.ImageData = class {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(((w || 1) * (h || 1)) * 4);
    }
  };
}
