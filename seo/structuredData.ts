import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  getAbsoluteUrl,
  getPageContent,
  getSupportEmail,
  localeConfig,
  type FaqItem,
  type PublicPageContent,
  type PublicPageId,
  type SeoLocale,
} from "./site";

type JsonLdNode = Record<string, unknown>;

function buildOrganizationJsonLd(locale: SeoLocale): JsonLdNode {
  const supportEmail = getSupportEmail();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    description: getPageContent("home", locale).metaDescription,
    contactPoint: supportEmail
      ? [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: supportEmail,
            availableLanguage: ["es", "en", "eu"],
          },
        ]
      : undefined,
  };
}

function buildWebSiteJsonLd(locale: SeoLocale): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: localeConfig[locale].localeTag,
    description: getPageContent("home", locale).metaDescription,
    image: DEFAULT_OG_IMAGE,
  };
}

function buildWebPageJsonLd(page: PublicPageContent): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.metaTitle,
    description: page.metaDescription,
    url: getAbsoluteUrl(page.path),
    inLanguage: localeConfig[page.locale].localeTag,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    breadcrumb: {
      "@id": `${getAbsoluteUrl(page.path)}#breadcrumb`,
    },
    about: {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "SportsApplication",
    },
  };
}

function buildSoftwareApplicationJsonLd(page: PublicPageContent): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "SportsApplication",
    operatingSystem: "Web, Android, iOS, Windows",
    applicationSubCategory: "Sports video analysis and training tracking",
    url: getAbsoluteUrl(page.path),
    image: DEFAULT_OG_IMAGE,
    inLanguage: localeConfig[page.locale].localeTag,
    description: page.metaDescription,
    featureList: page.supportingPoints,
  };
}

function buildBreadcrumbJsonLd(page: PublicPageContent): JsonLdNode {
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: getPageContent("home", page.locale).shortTitle,
      item: getAbsoluteUrl(getPageContent("home", page.locale).path),
    },
  ];

  if (page.id !== "home") {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: page.shortTitle,
      item: getAbsoluteUrl(page.path),
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${getAbsoluteUrl(page.path)}#breadcrumb`,
    itemListElement: items,
  };
}

function buildFaqJsonLd(page: PublicPageContent, faqItems: FaqItem[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function getStructuredData(pageId: PublicPageId, locale: SeoLocale) {
  const page = getPageContent(pageId, locale);
  const nodes: JsonLdNode[] = [
    buildOrganizationJsonLd(locale),
    buildWebSiteJsonLd(locale),
    buildWebPageJsonLd(page),
    buildSoftwareApplicationJsonLd(page),
    buildBreadcrumbJsonLd(page),
  ];

  if (page.id === "faq" && page.faqItems?.length) {
    nodes.push(buildFaqJsonLd(page, page.faqItems));
  }

  return nodes;
}
