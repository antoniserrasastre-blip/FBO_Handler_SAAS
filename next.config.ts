import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls pdfjs-dist 5.x and (transitively) @napi-rs/canvas. Keep
  // them external so Next does not try to bundle them. The
  // DOMMatrix/Path2D/ImageData polyfills live in src/lib/pdfPolyfills.ts.
  serverExternalPackages: [
    "@libsql/client",
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "pdfkit",
  ],
  // pdfjs-dist loads its "fake worker" (pdf.worker.mjs) via dynamic import
  // that nft cannot trace, so Vercel ships the function without it and the
  // route fails with "Cannot find module .../pdf.worker.mjs". Force-include
  // the legacy build directory in the /api/import bundle.
  outputFileTracingIncludes: {
    "/api/import": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
};

export default nextConfig;
