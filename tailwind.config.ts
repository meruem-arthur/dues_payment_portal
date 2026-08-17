import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Admin panel palette (dark + purple), matches internal admin tooling
        admin: {
          bg: "#0d0a14",
          surface: "#15111f",
          surfaceHover: "#1c1728",
          border: "#2a2338",
          accent: "#a855f7",
          accentDark: "#7e22ce",
          text: "#f1eefb",
          muted: "#9c93b3",
        },
        // Public / student-facing palette (light + teal), matches university portal branding
        portal: {
          bg: "#f4f7f8",
          surface: "#ffffff",
          border: "#e2e8ec",
          accent: "#0f9b8e",
          accentDark: "#0b7a70",
          text: "#1a2332",
          muted: "#64748b",
        },
      },
      borderRadius: { lg: "0.9rem", md: "0.6rem", sm: "0.4rem" },
      boxShadow: {
        glow: "0 0 40px -10px rgba(168, 85, 247, 0.35)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
