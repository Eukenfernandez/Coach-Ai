import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicPageTemplate } from "../comps/public/PublicPageTemplate";
import { getStructuredData } from "../seo/structuredData";
import {
  DEFAULT_OG_IMAGE,
  SPANISH_HOME_ALIAS_PATH,
  SITE_NAME,
  SITE_URL,
  getAbsoluteUrl,
  getAllPages,
  getAlternates,
  getHomeHeroResponsiveImage,
  getPageContent,
  getVerificationToken,
  localeConfig,
  type PublicPageContent,
  type PublicPageId,
} from "../seo/site";

type ManifestEntry = {
  file: string;
  css?: string[];
  src?: string;
  isEntry?: boolean;
};

const distDir = path.resolve(process.cwd(), "dist");

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAssetUrl(assetPath: string) {
  return `/${assetPath.replace(/\\/g, "/")}`;
}

function toOutputFile(pagePath: string) {
  if (pagePath === "/") return path.join(distDir, "index.html");
  return path.join(distDir, `${pagePath.replace(/^\//, "")}.html`);
}

function buildAnalyticsScript(page: PublicPageContent) {
  return `
<script>
window.dataLayer = window.dataLayer || [];
document.addEventListener('click', function (event) {
  var target = event.target && event.target.closest ? event.target.closest('[data-cta-event]') : null;
  if (!target) return;
  window.dataLayer.push({
    event: 'coachai_cta_click',
    cta_name: target.getAttribute('data-cta-event'),
    page_path: '${page.path}',
    page_locale: '${page.locale}'
  });
});
</script>`.trim();
}

function buildServiceWorkerScript() {
  return `
<script>
if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
  var isLocalHost = ['localhost', '127.0.0.1', '::1'].indexOf(window.location.hostname) !== -1;
  window.addEventListener('load', function () {
    if (isLocalHost) {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        registrations.forEach(function (registration) { registration.unregister(); });
      }).catch(function () {});
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.filter(function (key) { return key.indexOf('coach-ai') === 0; }).forEach(function (key) { caches.delete(key); });
        }).catch(function () {});
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
</script>`.trim();
}

function buildPreloadLinks(page: PublicPageContent) {
  if (page.id !== "home") {
    return "";
  }

  const heroImage = getHomeHeroResponsiveImage(page.locale);
  return `<link rel="preload" as="image" href="${heroImage.preloadHref}" imagesrcset="${heroImage.preloadSrcSet}" imagesizes="${heroImage.sizes}" type="image/avif" fetchpriority="high" />`;
}

function buildHead(page: PublicPageContent, cssHrefs: string[]) {
  const alternates = getAlternates(page.id);
  const verificationToken = getVerificationToken();
  const locale = localeConfig[page.locale];
  const structuredDataScripts = getStructuredData(page.id, page.locale)
    .map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`)
    .join("\n");

  return `
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${escapeHtml(page.metaTitle)}</title>
<meta name="description" content="${escapeHtml(page.metaDescription)}" />
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
<meta name="theme-color" content="#ea580c" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(page.socialTitle || page.metaTitle)}" />
<meta property="og:description" content="${escapeHtml(page.socialDescription || page.metaDescription)}" />
<meta property="og:url" content="${getAbsoluteUrl(page.path)}" />
<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />
<meta property="og:locale" content="${locale.ogLocale}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(page.socialTitle || page.metaTitle)}" />
<meta name="twitter:description" content="${escapeHtml(page.socialDescription || page.metaDescription)}" />
<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />
${verificationToken ? `<meta name="google-site-verification" content="${escapeHtml(verificationToken)}" />` : ""}
<link rel="canonical" href="${getAbsoluteUrl(page.path)}" />
<link rel="alternate" href="${getAbsoluteUrl(alternates.es)}" hreflang="es" />
<link rel="alternate" href="${getAbsoluteUrl(alternates.en)}" hreflang="en" />
<link rel="alternate" href="${getAbsoluteUrl(alternates.eu)}" hreflang="eu" />
<link rel="alternate" href="${getAbsoluteUrl(alternates["x-default"])}" hreflang="x-default" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
<link rel="manifest" href="/manifest.json" />
${buildPreloadLinks(page)}
${cssHrefs.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n")}
${structuredDataScripts}`.trim();
}

function renderDocument(page: PublicPageContent, bodyMarkup: string, cssHrefs: string[], scriptHref?: string) {
  const scripts = [buildAnalyticsScript(page), buildServiceWorkerScript()];
  if (scriptHref) {
    scripts.push(`<script type="module" src="${scriptHref}"></script>`);
  }

  return `<!DOCTYPE html>
<html lang="${page.locale}" class="dark">
<head>
${buildHead(page, cssHrefs)}
</head>
<body class="bg-gray-100 text-neutral-900 dark:bg-neutral-950 dark:text-white min-h-[100dvh] w-full transition-colors duration-300">
${bodyMarkup}
${scripts.join("\n")}
</body>
</html>`;
}

function renderPageMarkup(pageId: PublicPageId, locale: keyof typeof localeConfig) {
  const page = getPageContent(pageId, locale);
  return renderToStaticMarkup(<PublicPageTemplate page={page} />);
}

async function readManifest() {
  const manifestPath = path.join(distDir, ".vite", "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, ManifestEntry>;
  const entry =
    manifest["index.html"] ||
    Object.values(manifest).find((value) => value.isEntry && value.src === "index.tsx");

  if (!entry) {
    throw new Error("No se pudo localizar la entrada principal de Vite en el manifest.");
  }

  return {
    cssHrefs: (entry.css || []).map(toAssetUrl),
    scriptHref: toAssetUrl(entry.file),
  };
}

async function ensureDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writePublicPages(cssHrefs: string[]) {
  for (const page of getAllPages()) {
    if (page.path === "/") continue;
    const bodyMarkup = renderPageMarkup(page.id, page.locale);
    const html = renderDocument(page, bodyMarkup, cssHrefs);
    const outputFile = toOutputFile(page.path);
    await ensureDirectory(outputFile);
    await fs.writeFile(outputFile, html, "utf8");
  }
}

async function writeSpanishHomeAlias(cssHrefs: string[]) {
  const homePage = getPageContent("home", "es");
  const bodyMarkup = renderPageMarkup("home", "es");
  const html = renderDocument(homePage, bodyMarkup, cssHrefs);
  const outputFile = toOutputFile(SPANISH_HOME_ALIAS_PATH);
  await ensureDirectory(outputFile);
  await fs.writeFile(outputFile, html, "utf8");
}

async function writeRootIndex(cssHrefs: string[]) {
  const homePage = getPageContent("home", "es");
  const appMarkup = renderToStaticMarkup(
    <div id="root" className="h-full w-full">
      <PublicPageTemplate page={homePage} />
    </div>
  );
  const html = renderDocument(homePage, appMarkup, cssHrefs);
  await fs.writeFile(path.join(distDir, "index.html"), html, "utf8");
}

async function writeLoginEntry(cssHrefs: string[], scriptHref: string) {
  const html = `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Acceso a CoachAI</title>
<meta name="description" content="Área autenticada de CoachAI. Esta experiencia no debe indexarse." />
<meta name="robots" content="noindex,nofollow,noarchive" />
<meta name="theme-color" content="#ea580c" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
<link rel="manifest" href="/manifest.json" />
${cssHrefs.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n")}
</head>
<body class="bg-gray-100 text-neutral-900 dark:bg-neutral-950 dark:text-white min-h-[100dvh] w-full transition-colors duration-300">
<div id="root" class="h-full w-full"></div>
<script type="module" src="${scriptHref}"></script>
${buildServiceWorkerScript()}
</body>
</html>`;

  const outputFile = toOutputFile("/login");
  await ensureDirectory(outputFile);
  await fs.writeFile(outputFile, html, "utf8");
}

async function writeRobots() {
  const robots = `User-agent: *
Allow: /
Disallow: /checkout_redirect/
Disallow: /*?lang=
Disallow: /*?payment=

Sitemap: ${SITE_URL}/sitemap.xml
Host: coachai.es
`;
  await fs.writeFile(path.join(distDir, "robots.txt"), robots, "utf8");
}

function buildSitemapUrl(page: PublicPageContent) {
  const alternates = getAlternates(page.id);
  const alternateLinks = [
    `    <xhtml:link rel="alternate" hreflang="es" href="${getAbsoluteUrl(alternates.es)}" />`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${getAbsoluteUrl(alternates.en)}" />`,
    `    <xhtml:link rel="alternate" hreflang="eu" href="${getAbsoluteUrl(alternates.eu)}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${getAbsoluteUrl(alternates["x-default"])}" />`,
  ].join("\n");

  return `  <url>
    <loc>${getAbsoluteUrl(page.path)}</loc>
${alternateLinks}
    <lastmod>${new Date().toISOString()}</lastmod>
  </url>`;
}

async function writeSitemap() {
  const sitemapEntries = getAllPages().map(buildSitemapUrl).join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapEntries}
</urlset>`;
  await fs.writeFile(path.join(distDir, "sitemap.xml"), sitemap, "utf8");
}

async function writeNotFound(cssHrefs: string[]) {
  const page = `
<main class="min-h-screen flex items-center justify-center px-4">
  <section class="max-w-2xl rounded-3xl border border-neutral-200 bg-white p-10 text-center shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
    <p class="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-500">404</p>
    <h1 class="mb-4 text-4xl font-bold">Página no encontrada</h1>
    <p class="mb-8 text-neutral-500 dark:text-neutral-400">La URL solicitada no forma parte de la capa pública indexable de CoachAI. Usa la home, las landings SEO o el acceso principal.</p>
    <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
      <a href="/" class="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3.5 font-bold text-white shadow-lg shadow-orange-500/30">Ir a la home</a>
      <a href="/es/acceso" class="rounded-full border border-neutral-300 px-8 py-3.5 font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">Acceso</a>
    </div>
  </section>
</main>`;
  const verificationToken = getVerificationToken();
  const html = `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>404 | CoachAI</title>
<meta name="description" content="Página no encontrada en CoachAI." />
<meta name="robots" content="noindex,follow" />
<meta name="theme-color" content="#ea580c" />
${verificationToken ? `<meta name="google-site-verification" content="${escapeHtml(verificationToken)}" />` : ""}
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
${cssHrefs.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n")}
</head>
<body class="bg-gray-100 text-neutral-900 dark:bg-neutral-950 dark:text-white min-h-[100dvh] w-full transition-colors duration-300">
${page}
${buildAnalyticsScript(getPageContent("home", "es"))}
</body>
</html>`;
  await fs.writeFile(path.join(distDir, "404.html"), html, "utf8");
}

async function main() {
  const { cssHrefs, scriptHref } = await readManifest();
  await writeRootIndex(cssHrefs);
  await writeLoginEntry(cssHrefs, scriptHref);
  await writePublicPages(cssHrefs);
  await writeSpanishHomeAlias(cssHrefs);
  await writeRobots();
  await writeSitemap();
  await writeNotFound(cssHrefs);
}

main().catch((error) => {
  console.error("[seo] Error generating SEO pages", error);
  process.exitCode = 1;
});
