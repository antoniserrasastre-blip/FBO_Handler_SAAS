import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls pdfjs-dist 5.x and (transitively) @napi-rs/canvas. Keep
  // them external so Next does not try to bundle them. The actual
  // DOMMatrix/Path2D/ImageData polyfills live in src/lib/pdfPolyfills.ts —
  // we don't depend on Vercel shipping the @napi-rs/canvas native binary.
  serverExternalPackages: [
    "@libsql/client",
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "pdfkit",
  ],
};

export default nextConfig;
