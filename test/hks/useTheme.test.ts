import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "@/hks/useTheme";

describe("useTheme", () => {
  it("arranca en oscuro y aplica la clase 'dark' al <html>", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("recupera el tema guardado en localStorage", () => {
    window.localStorage.setItem("coachai_theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme alterna, persiste y actualiza la clase", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(window.localStorage.getItem("coachai_theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(window.localStorage.getItem("coachai_theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
