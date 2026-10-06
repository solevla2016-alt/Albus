/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Albus brand ramp, derived from the red on the logo card (#9a3c37).
        // Kept desaturated on purpose: it reads as brick/terracotta rather than
        // alarm red, so it can carry the UI accents without shouting.
        brand: {
          50: "#fbf5f4",
          100: "#f6e6e4",
          200: "#eac8c4",
          300: "#d9a09a",
          400: "#c4736b",
          500: "#ae534b",
          600: "#9a3c37",
          700: "#7c2f2b",
          800: "#5d2320",
          900: "#3e1715",
          950: "#240d0c",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-dot": "pulseDot 1.4s infinite ease-in-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%": { transform: "scale(1)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
