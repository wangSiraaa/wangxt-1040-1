/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        navy: "#0F172A",
        "cyan-accent": "#06D6A0",
        "warn-orange": "#FF6B35",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ['"Noto Sans SC"', "sans-serif"],
      },
      animation: {
        fadeInUp: "fadeInUp 0.4s ease-out both",
        slideInLeft: "slideInLeft 0.35s ease-out both",
        slideOutLeft: "slideOutLeft 0.3s ease-in both",
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideOutLeft: {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(-16px)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 4px rgba(6,214,160,0.3)" },
          "50%": { boxShadow: "0 0 16px rgba(6,214,160,0.6)" },
        },
      },
    },
  },
  plugins: [],
};
