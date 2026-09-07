// Se ejecuta antes de cada fichero de test (ver vitest.config.ts → setupFiles).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.className = "";
});
