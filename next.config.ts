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
  // pdfjs-dist v3 legacy CJS build: nft cannot trace dynamic requires inside
  // the worker, so force-include the entire legacy build directory.
  outputFileTracingIncludes: {
    "/api/import": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
};

export default nextConfig;
