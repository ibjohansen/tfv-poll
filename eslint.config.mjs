import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  { files: ["app/**/*.{js,mjs}", "components/**/*.{js,mjs}", "lib/**/*.{js,mjs}", "proxy.js"], rules: { "no-undef": "error" } },
  globalIgnores([".next/**", ".netlify/**", "out/**", "build/**"]),
]);
