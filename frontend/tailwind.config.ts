import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0b1020", soft: "#10172a", card: "#131a2e" },
        line: { DEFAULT: "#1f2a44" },
        brand: { DEFAULT: "#6366f1", soft: "#818cf8" },
        ink: { DEFAULT: "#e6e9f5", soft: "#a4abc7", dim: "#6b7396" },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,.25), 0 8px 32px rgba(0,0,0,.35)",
      },
    },
  },
  plugins: [],
};
export default config;