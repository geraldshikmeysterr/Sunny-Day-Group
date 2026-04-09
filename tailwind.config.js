/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#FFFBF0",
          100: "#FFF3CC",
          200: "#FFE566",
          500: "#F57300",
          600: "#E06500",
          700: "#C45500",
        },
        sun:  { 100: "#FFF8D6", 200: "#FFF1B2", 400: "#FFE32B" },
        leaf: { 500: "#3E8719" },
        neutral: {
          0:   "#FFFFFF",
          50:  "#FAFAF8",
          100: "#F5F4F0",
          200: "#EDECEA",
          300: "#D9D8D4",
          400: "#B8B7B2",
          500: "#8C8B87",
          600: "#6B6A66",
          700: "#4A4946",
          800: "#2E2D2B",
          900: "#1A1917",
        },
        success: { 50: "#F0FAF0", 500: "#22C55E", 600: "#16A34A", 700: "#15803D" },
        warning: { 50: "#FFFBEB", 500: "#F59E0B", 700: "#B45309" },
        danger:  { 50: "#FFF1F2", 200: "#FECDD3", 500: "#EF4444", 600: "#DC2626", 700: "#B91C1C" },
        info:    { 50: "#EFF6FF", 500: "#3B82F6", 700: "#1D4ED8" },
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-yanone)", "sans-serif"],
      },
      borderRadius: { sm: "6px", md: "8px", lg: "12px", xl: "16px" },
      boxShadow: {
        card:     "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-md":"0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        "card-lg":"0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "fade-in":  "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "scale-in": "scaleIn 0.15s ease-out",
        shimmer:    "shimmer 1.5s infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(4px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        scaleIn: { from: { transform: "scale(0.96)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};
