import { describe, expect, it } from "vitest";
import {
  SITE_URL,
  SPANISH_HOME_ALIAS_PATH,
  getAbsoluteUrl,
  getAllPages,
  getAlternates,
  getPublicLanguageByPath,
  getPublicPageByPath,
  publicPageIds,
  toSeoLocale,
} from "@/seo/site";

describe("toSeoLocale", () => {
  it("mapea los idiomas internos de la app a locales SEO", () => {
    expect(toSeoLocale("es")).toBe("es");
    expect(toSeoLocale("ing")).toBe("en");
    expect(toSeoLocale("eus")).toBe("eu");
  });
});

describe("getAbsoluteUrl", () => {
  it("resuelve rutas relativas contra SITE_URL", () => {
    expect(getAbsoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(getAbsoluteUrl("/login")).toBe(`${SITE_URL}/login`);
  });
});

describe("páginas públicas", () => {
  const pages = getAllPages();

  it("existe al menos la home en cada locale", () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(publicPageIds).toContain("home");
  });

  it("no hay dos páginas con la misma ruta", () => {
    const paths = pages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("cada página se resuelve de vuelta por su propia ruta", () => {
    for (const page of pages) {
      const found = getPublicPageByPath(page.path);
      expect(found?.path, page.path).toBe(page.path);
      expect(found?.locale, page.path).toBe(page.locale);
    }
  });

  it("el alias /es apunta a la home en español", () => {
    const home = getPublicPageByPath(SPANISH_HOME_ALIAS_PATH);
    expect(home?.locale).toBe("es");
    expect(getPublicLanguageByPath(SPANISH_HOME_ALIAS_PATH)).toBe("es");
  });

  it("una ruta desconocida devuelve null", () => {
    expect(getPublicPageByPath("/esta-ruta-no-existe")).toBeNull();
    expect(getPublicLanguageByPath("/esta-ruta-no-existe")).toBeNull();
  });

  it("las alternates de la home cubren los tres locales y x-default", () => {
    const alternates = getAlternates("home");
    expect(Object.keys(alternates)).toEqual(expect.arrayContaining(["es", "en", "eu", "x-default"]));
    expect(alternates["x-default"]).toBe(alternates.es);
  });
});
