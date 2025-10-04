import type { Config } from "tailwindcss";

const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: withOpacity("--border"),
        input: withOpacity("--input"),
        ring: withOpacity("--ring"),
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        card: {
          DEFAULT: withOpacity("--card"),
          foreground: withOpacity("--card-foreground"),
        },
        muted: {
          DEFAULT: withOpacity("--muted"),
          foreground: withOpacity("--muted-foreground"),
        },
        primary: {
          DEFAULT: withOpacity("--primary"),
          foreground: withOpacity("--primary-foreground"),
        },
        accent: {
          DEFAULT: withOpacity("--accent"),
          foreground: withOpacity("--accent-foreground"),
        },
        success: {
          DEFAULT: withOpacity("--success"),
          foreground: withOpacity("--success-foreground"),
        },
        destructive: {
          DEFAULT: withOpacity("--destructive"),
          foreground: withOpacity("--destructive-foreground"),
        },
        "accent-border": withOpacity("--accent-border"),
        "success-border": withOpacity("--success-border"),
        "destructive-border": withOpacity("--destructive-border"),
        "tier-2-start": withOpacity("--tier-2-start"),
        "tier-2-end": withOpacity("--tier-2-end"),
        "tier-3-start": withOpacity("--tier-3-start"),
        "tier-3-end": withOpacity("--tier-3-end"),
        "tier-4-start": withOpacity("--tier-4-start"),
        "tier-4-end": withOpacity("--tier-4-end"),
        "tier-5-start": withOpacity("--tier-5-start"),
        "tier-5-end": withOpacity("--tier-5-end"),
      },
    },
  },
  plugins: [],
};

export default config;
