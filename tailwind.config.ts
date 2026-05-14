import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
        display: ["var(--font-plex-condensed)", "var(--font-plex-sans)", "sans-serif"],
      },
      fontSize: {
        // Helix Bloomberg-dense scale — namespaced to avoid clashing with
        // Tailwind defaults already used across the app.
        "hx-2xs": ["10px", { lineHeight: "1.4" }],
        "hx-xs": ["11px", { lineHeight: "1.4" }],
        "hx-sm": ["12px", { lineHeight: "1.5" }],
        "hx-md": ["13px", { lineHeight: "1.5" }],
        "hx-lg": ["15px", { lineHeight: "1.45" }],
        "hx-xl": ["17px", { lineHeight: "1.4" }],
        "hx-2xl": ["20px", { lineHeight: "1.3" }],
        "hx-3xl": ["26px", { lineHeight: "1.2" }],
        "hx-4xl": ["34px", { lineHeight: "1.1" }],
        "hx-5xl": ["48px", { lineHeight: "1" }],
      },
      colors: {
        // Helix tokens via CSS variables.
        bg: {
          DEFAULT: "var(--c-bg)",
          subtle: "var(--c-bg-subtle)",
          muted: "var(--c-bg-muted)",
          sunken: "var(--c-bg-sunken)",
        },
        ink: {
          1: "var(--c-text-1)",
          2: "var(--c-text-2)",
          3: "var(--c-text-3)",
          muted: "var(--c-text-muted)",
          disabled: "var(--c-text-disabled)",
        },
        line: {
          DEFAULT: "var(--c-border)",
          subtle: "var(--c-border-subtle)",
          strong: "var(--c-border-strong)",
        },
        brand: {
          DEFAULT: "var(--c-brand)",
          hover: "var(--c-brand-hover)",
          active: "var(--c-brand-active)",
          tint: "var(--c-brand-tint)",
          tint2: "var(--c-brand-tint-2)",
          on: "var(--c-brand-on)",
        },
        chrome: {
          bg: "var(--c-dark-bg)",
          bg2: "var(--c-dark-bg-2)",
          bg3: "var(--c-dark-bg-3)",
          border: "var(--c-dark-border)",
          text1: "var(--c-dark-text-1)",
          text2: "var(--c-dark-text-2)",
          text3: "var(--c-dark-text-3)",
          muted: "var(--c-dark-text-muted)",
        },
        success: {
          DEFAULT: "var(--c-success)",
          bg: "var(--c-success-bg)",
          strong: "var(--c-success-strong)",
        },
        warning: {
          DEFAULT: "var(--c-warning)",
          bg: "var(--c-warning-bg)",
          strong: "var(--c-warning-strong)",
        },
        danger: {
          DEFAULT: "var(--c-danger)",
          bg: "var(--c-danger-bg)",
          strong: "var(--c-danger-strong)",
        },
        info: {
          DEFAULT: "var(--c-info)",
          bg: "var(--c-info-bg)",
          strong: "var(--c-info-strong)",
        },
        fbo: {
          expected: "var(--c-state-expected)",
          approach: "var(--c-state-approach)",
          landed: "var(--c-state-landed)",
          onblocks: "var(--c-state-onblocks)",
          parked: "var(--c-state-parked)",
          turn: "var(--c-state-turn)",
          board: "var(--c-state-board)",
          departed: "var(--c-state-departed)",
          overnight: "var(--c-state-overnight)",
        },
        // Legacy palette kept for components not yet migrated to Helix.
        flight: {
          expected: "#9CA3AF",
          ground: "#3B82F6",
          boarding: "#EAB308",
          dispatched: "#22C55E",
          alert: "#EF4444",
        },
      },
      borderRadius: {
        "hx-sm": "3px",
        "hx-md": "5px",
        "hx-lg": "8px",
        "hx-pill": "999px",
      },
      boxShadow: {
        "hx-sm": "0 1px 2px rgb(0 0 0 / 0.04)",
        "hx-md": "0 2px 6px -1px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
        "hx-lg": "0 10px 24px -8px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.04)",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.32, 0, 0.16, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
