import { mtConfig } from "@material-tailwind/react";

const materialTailwind = mtConfig({
  radius: "1rem",
  fonts: {
    sans: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  colors: {
    background: "#f8fafc",
    foreground: "#334155",
    surface: {
      default: "#e2e8f0",
      dark: "#cbd5e1",
      light: "#f1f5f9",
      foreground: "#0f172a",
    },
    primary: {
      default: "#24513f",
      dark: "#193c2e",
      light: "#326b54",
      foreground: "#ffffff",
    },
  },
});

// Material Tailwind currently registers every package component as a source.
// Limit source discovery to this app; the Button classes in use are registered
// explicitly in globals.css to avoid invalid selectors from unused beta widgets.
const materialTailwindPlugin = {
  ...materialTailwind,
  config: {
    ...materialTailwind.config,
    content: [],
  },
};

const config = {
  content: [
    "./app/**/*.{js,jsx,mdx}",
    "./components/**/*.{js,jsx,mdx}",
  ],
  plugins: [materialTailwindPlugin],
};

export default config;
