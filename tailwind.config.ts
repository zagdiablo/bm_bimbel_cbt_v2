import type { Config } from "tailwindcss";
import { mtConfig } from "@material-tailwind/react";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@material-tailwind/react/src/components/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@material-tailwind/react/src/theme/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    mtConfig({
      fonts: {
        sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      },
    }),
  ],
} satisfies Config;
