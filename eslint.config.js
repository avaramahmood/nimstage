import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", ".data", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Three.js scenes mutate uniforms/objects inside useFrame by design; the compiler lint misreads that.
    files: ["src/stage/**/*.{ts,tsx}"],
    rules: { "react-hooks/immutability": "off", "react-hooks/refs": "off" },
  },
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "scripts/**/*.{ts,mts,mjs}", "tests/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
