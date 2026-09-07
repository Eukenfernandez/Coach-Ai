// ESLint flat config (ESLint 10). Ver docs/ARCHITECTURE.md → "Calidad de código".
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig([
  globalIgnores([
    "node_modules/",
    "dist/",
    "el-dist/",
    "coverage/",
    "fns/lib/",
    "fns/node_modules/",
    "fns/output/",
    "android/",
    "ios/",
    ".claude/",
    ".firebase/",
    "pub/",
  ]),

  // ---- Base para todo el TypeScript del repo
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // El código existente no fue escrito con lint; estas reglas quedan en
      // "warn" para no bloquear CI hoy y poder ir bajándolas a "error".
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      // Señalan código muerto/redundante real (p.ej. bloques `{false && ...}`)
      // pero no bugs; se corrigen al refactorizar cada componente.
      "no-constant-binary-expression": "warn",
      "no-useless-assignment": "warn",
      "no-useless-catch": "warn",
    },
  },

  // ---- Frontend (React 18 + Vite)
  {
    files: [
      "*.tsx",
      "*.ts",
      "comps/**/*.{ts,tsx}",
      "hks/**/*.ts",
      "svcs/**/*.ts",
      "utl/**/*.ts",
      "seo/**/*.{ts,tsx}",
    ],
    ignores: ["vite.config.ts", "capacitor.config.ts", "vitest.config.ts"],
    extends: [reactHooks.configs.flat.recommended],
    plugins: { "react-refresh": reactRefresh },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Reglas del React Compiler (react-hooks v7). El código actual no fue
      // escrito para el compilador; quedan en "warn" como guía de migración.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
    },
  },

  // ---- Scripts de build y configs (Node)
  {
    files: [
      "scripts/**/*.{ts,tsx}",
      "vite.config.ts",
      "capacitor.config.ts",
      "vitest.config.ts",
      "eslint.config.js",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ---- Cloud Functions (Node 20/22, ESM)
  {
    files: ["fns/src/**/*.ts", "fns/test/**/*.{mjs,js}", "fns/scripts/**/*.{mjs,js}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ---- Electron main (CommonJS)
  {
    files: ["electron/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // ---- Tests (Vitest + jsdom)
  {
    files: ["test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Desactiva reglas de formato que chocan con Prettier. Siempre el último.
  prettier,
]);
