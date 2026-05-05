import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output para Docker (copia solo lo necesario)
  output: "standalone",
  // pdfjs-dist is kept external so Next does not bundle it.
  // @libsql/client and pdfkit have native/CJS internals that must stay external.
  serverExternalPackages: [
    "@libsql/client",
    "pdfjs-dist",
    "pdfkit",
  ],
  // pdfjs-dist loads pdf.worker.mjs via dynamic import that nft cannot trace,
  // so Vercel ships the function without it. Force-include both build dirs.
  outputFileTracingIncludes: {
    "/api/import": [
      "./node_modules/pdfjs-dist/build/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
    ],
  },
};

export default nextConfig;
