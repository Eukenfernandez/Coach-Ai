import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Config de tests del frontend. Las Cloud Functions (fns/) tienen su propia
// suite con node:test; se lanza con `npm run test:fns`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}", "{comps,hks,svcs,utl,seo}/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "fns", "android", "ios", ".claude"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["comps/**", "hks/**", "svcs/**", "utl/**", "seo/**", "App.tsx", "types.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
});
