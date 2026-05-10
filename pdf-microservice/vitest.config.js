import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// We live inside the Next.js app's repo, which has a postcss.config.mjs at
// the root. We pin Vite's root here and pass an inline (empty) PostCSS
// config so Vite stops walking up the tree looking for tailwindcss.
export default defineConfig({
  root: __dirname,
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.js'],
    environment: 'node',
  },
});
