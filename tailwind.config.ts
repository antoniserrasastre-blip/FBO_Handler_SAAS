import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Flight state colors
        flight: {
          expected: "#9CA3AF",   // gray
          ground: "#3B82F6",     // blue
          boarding: "#EAB308",   // yellow
          dispatched: "#22C55E", // green
          alert: "#EF4444",      // red
        },
      },
    },
  },
  plugins: [],
};

export default config;
