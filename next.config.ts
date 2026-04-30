import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse → pdfjs-dist → @napi-rs/canvas (native .node binary that
  // installs DOMMatrix/Path2D/ImageData on globalThis). Externalising the
  // packages tells Next not to bundle them, but Next's outputFileTracing
  // misses @napi-rs/canvas because pdf-parse's bundled CJS uses dynamic
  // requires that nft cannot follow. We force-include the package and its
  // platform-specific binary so Vercel ships the .node file with the
  // serverless function — without it the API route throws
  // "DOMMatrix is not defined".
  serverExternalPackages: [
    "@libsql/client",
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "pdfkit",
  ],
  outputFileTracingIncludes: {
    "/api/import": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/pdf-parse/**/*",
    ],
  },
};

export default nextConfig;
