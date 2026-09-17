import { mtConfig } from "@material-tailwind/react";

const materialTailwind = mtConfig({
  radius: "1rem",
  fonts: {
    sans: "var(--font-body-sans)",
  },
  colors: {
    background: "#EBEBDE",
    foreground: "#493F39",
    surface: {
      default: "#FFFFFF",
      dark: "#DDD9CA",
      light: "#F6F5EC",
      foreground: "#493F39",
    },
    primary: {
      default: "#955E6E",
      dark: "#5A2636",
      light: "#B98493",
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
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body-sans)'],
        display: ['var(--font-chap)', 'Arial', 'sans-serif'],
      },
    },
  },
};

export default config;
