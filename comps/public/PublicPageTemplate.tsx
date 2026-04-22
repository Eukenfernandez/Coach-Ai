import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clock,
  Globe,
  MessageSquare,
  Play,
  Shield,
  Star,
  Target,
  TrendingUp,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  getAlternates,
  getHomeHeroResponsiveImage,
  getLoginHref,
  getPageContent,
  HOME_HERO_HEIGHT,
  HOME_HERO_WIDTH,
  PUBLIC_MEDIA_POSTER_SRC,
  PUBLIC_MEDIA_VIDEO_SRC,
  getRelatedPages,
  localeConfig,
  type PublicPageContent,
  type PublicPageId,
} from "../../seo/site";
import type { Language } from "../../types";

interface PublicPageTemplateProps {
  page: PublicPageContent;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
  nativeMode?: boolean;
  onPublicNavigate?: (path: string) => void;
}

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  lead?: string;
  desc: string;
  href?: string;
}

interface BenefitCard {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const featureIcons: LucideIcon[] = [Video, Activity, MessageSquare, Target, BarChart3, Clock];
const benefitIcons: LucideIcon[] = [Zap, Shield, TrendingUp, Users];

const homeSports = [
  "🏃 Atletismo",
  "🏋️ Gimnasio",
  "⚽ Fútbol",
  "🏊 Natación",
  "🚴 Ciclismo",
  "🥊 Combate",
  "🎾 Tenis",
  "🏀 Baloncesto",
  "⚾ Béisbol",
  "🏈 Rugby",
];

const uiCopy = {
  es: {
    watchDemo: "Mira cómo funciona",
    aiTitle: "Potenciado por Gemini AI",
    aiSubtitle: "Inteligencia artificial de Google al servicio de tu entrenamiento",
    aiShowcaseAlt: "Interfaz de Coach AI analizando un vídeo de entrenamiento",
    aiShowcaseMessage: "Hola, soy tu entrenador IA. ¿Qué quieres analizar de este vídeo?",
    benefitsTitle: "¿Cómo mejorará tus entrenamientos?",
    sportsTitle: "Para todos los deportes",
    sportsDescription:
      "Coach AI mantiene su estética original mientras expone una capa pública útil para descubrir el producto.",
    relatedTitle: "Explora Coach AI",
    relatedDescription:
      "Navega por las páginas públicas principales sin cambiar la estética original del producto.",
    faqTitle: "Preguntas frecuentes",
    faqIntro: "Respuestas visibles y reales antes de entrar en la app.",
    ctaLabel: "Crear Cuenta Gratis",
    footerText: "© 2026 Coach AI. Todos los derechos reservados.",
  },
  ing: {
    watchDemo: "See how it works",
    aiTitle: "Powered by Gemini AI",
    aiSubtitle: "Google's artificial intelligence at the service of your training",
    aiShowcaseAlt: "Coach AI interface analyzing a training video",
    aiShowcaseMessage: "Hi, I'm your AI coach. What do you want to analyze in this video?",
    benefitsTitle: "How will it improve your training?",
    sportsTitle: "For all sports",
    sportsDescription:
      "Coach AI keeps its original visual identity while exposing a public layer that explains the product.",
    relatedTitle: "Explore Coach AI",
    relatedDescription:
      "Browse the main public pages while preserving the original product look and feel.",
    faqTitle: "Frequently asked questions",
    faqIntro: "Clear, visible answers before opening the app.",
    ctaLabel: "Create Free Account",
    footerText: "© 2026 Coach AI. All rights reserved.",
  },
  eus: {
    watchDemo: "Ikusi nola funtzionatzen duen",
    aiTitle: "Gemini IA-rekin Potentziaturik",
    aiSubtitle: "Google-ren adimen artifiziala zure entrenamenduaren zerbitzura",
    aiShowcaseAlt: "Coach AI interfazea entrenamendu bideo bat aztertzen",
    aiShowcaseMessage: "Kaixo, zure IA entrenatzailea naiz. Zer aztertu nahi duzu bideo honetan?",
    benefitsTitle: "Nola hobetuko ditu zure entrenamenduak?",
    sportsTitle: "Kirol guztietarako",
    sportsDescription:
      "Coach AI-k jatorrizko itxura mantentzen du produktua azaltzen duen geruza publikoarekin.",
    relatedTitle: "Arakatu Coach AI",
    relatedDescription:
      "Arakatu orri publiko nagusiak produktuaren jatorrizko itxura galdu gabe.",
    faqTitle: "Ohiko galderak",
    faqIntro: "Erantzun argiak eta ikusgarriak app-ean sartu aurretik.",
    ctaLabel: "Sortu Kontu Doakoa",
    footerText: "© 2026 Coach AI. Eskubide guztiak erreserbatuak.",
  },
} as const;

const topStartLabels: Record<Language, string> = {
  es: "Comenzar",
  ing: "Start",
  eus: "Hasi",
};

const languages: { code: Language; label: string; flag: string }[] = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ing", label: "English", flag: "🇬🇧" },
  { code: "eus", label: "Euskara", flag: "🟢" },
];

const geminiShowcaseSrc = "/ai-chat-demo.png";
const homeHeroScreenAltByLocale = {
  es: "Pantalla inicial de CoachAI mostrando análisis técnico y de rendimiento",
  en: "Coach AI home screen showing technique and performance analysis",
  eu: "Coach AI hasierako pantaila teknika eta errendimendu analisia erakusten",
} as const;
const primarySectionsId = "public-sections";
const homeLocaleSwitchLinks = { es: "/es", en: "/en", eu: "/eu" } as const;

function trimCards<T>(items: T[], size: number) {
  return items.slice(0, size);
}

function useFeatureCards(page: PublicPageContent) {
  return useMemo<FeatureCard[]>(() => {
    if (page.id === "home") {
      return page.sections.map((section, index) => ({
        icon: featureIcons[index % featureIcons.length],
        title: section.title,
        lead: section.lead,
        desc: section.body,
      }));
    }

    const sectionCards = page.sections.map((section, index) => ({
      icon: featureIcons[index % featureIcons.length],
      title: section.title,
      desc: section.body,
    }));

    const relatedCards = page.relatedPages.map((pageId, index) => {
      const linkedPage = getPageContent(pageId, page.locale);
      return {
        icon: featureIcons[(sectionCards.length + index) % featureIcons.length],
        title: linkedPage.shortTitle,
        desc: linkedPage.metaDescription,
        href: linkedPage.path,
      };
    });

    return trimCards([...sectionCards, ...relatedCards], 6);
  }, [page]);
}

function useBenefitCards(page: PublicPageContent) {
  return useMemo<BenefitCard[]>(() => {
    if (page.benefitCards?.length) {
      return page.benefitCards.map((card, index) => ({
        icon: benefitIcons[index % benefitIcons.length],
        title: card.title,
        desc: card.body,
      }));
    }

    const primaryCards = page.supportingPoints.map((point, index) => ({
      icon: benefitIcons[index % benefitIcons.length],
      title: point,
      desc: page.sections[index]?.body || page.intro,
    }));

    const relatedCards = page.relatedPages.map((pageId, index) => {
      const linkedPage = getPageContent(pageId, page.locale);
      return {
        icon: benefitIcons[(primaryCards.length + index) % benefitIcons.length],
        title: linkedPage.shortTitle,
        desc: linkedPage.metaDescription,
      };
    });

    return trimCards([...primaryCards, ...relatedCards], 4);
  }, [page]);
}

export function PublicPageTemplate({
  page,
  language,
  onLanguageChange,
  nativeMode = false,
  onPublicNavigate,
}: PublicPageTemplateProps) {
  const locale = localeConfig[page.locale];
  const uiLanguage = locale.appLanguage;
  const copy = uiCopy[uiLanguage];
  const loginHref = getLoginHref(page.locale);
  const relatedPages = getRelatedPages(page.id, page.locale);
  const alternates = getAlternates(page.id);
  const accessPage = getPageContent("access", page.locale);
  const featureCards = useFeatureCards(page);
  const benefitCards = useBenefitCards(page);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const currentLanguage = languages.find((entry) => entry.code === uiLanguage) || languages[0];
  const heroLabel =
    page.heroMedia?.type === "video" ? page.heroMedia.label : page.eyebrow;
  const heroImage =
    page.heroMedia?.type === "image" ? page.heroMedia.src : PUBLIC_MEDIA_POSTER_SRC;
  const isHomeHero = page.id === "home";
  const homeHeroScreenAlt = homeHeroScreenAltByLocale[page.locale];
  const homeHeroResponsiveImage = getHomeHeroResponsiveImage(page.locale);
  const exploreLinks =
    page.id === "home"
      ? homeSports.map((sport) => ({ label: sport }))
      : relatedPages.map((linkedPage) => ({
          label: linkedPage.shortTitle,
          href: linkedPage.path,
        }));
  const footerPageLinks = useMemo(() => {
    const uniquePages = new Map<string, { title: string; href: string }>();
    [getPageContent("home", page.locale), ...relatedPages].forEach((linkedPage) => {
      if (linkedPage.id === page.id) return;
      if (!uniquePages.has(linkedPage.path)) {
        uniquePages.set(linkedPage.path, {
          title: linkedPage.shortTitle,
          href: linkedPage.path,
        });
      }
    });
    return Array.from(uniquePages.values());
  }, [page.id, page.locale, relatedPages]);
  let footerLocaleLinks = [
    { label: "Español", href: alternates.es, active: page.locale === "es" },
    { label: "English", href: alternates.en, active: page.locale === "en" },
    { label: "Euskara", href: alternates.eu, active: page.locale === "eu" },
  ];
  const isHomeFeatures = page.id === "home";
  const heroLocaleCode = page.locale.toUpperCase();
  let heroLanguageLinks = [
    { code: "ES", href: alternates.es, active: page.locale === "es" },
    { code: "EN", href: alternates.en, active: page.locale === "en" },
    { code: "EU", href: alternates.eu, active: page.locale === "eu" },
  ];

  if (page.id === "home") {
    footerLocaleLinks = footerLocaleLinks.map((item) =>
      item.active && page.locale === "es"
        ? { ...item, href: homeLocaleSwitchLinks.es }
        : item.label === "EspaÃ±ol"
          ? { ...item, href: homeLocaleSwitchLinks.es }
          : item,
    );
    heroLanguageLinks = heroLanguageLinks.map((item) =>
      item.code === "ES" ? { ...item, href: homeLocaleSwitchLinks.es } : item,
    );
  }

  if (page.id === "home" && footerLocaleLinks[0]) {
    footerLocaleLinks[0] = { ...footerLocaleLinks[0], href: homeLocaleSwitchLinks.es };
  }

  const localePathByLanguage: Record<Language, string> = {
    es: page.id === "home" ? homeLocaleSwitchLinks.es : alternates.es,
    ing: page.id === "home" ? homeLocaleSwitchLinks.en : alternates.en,
    eus: page.id === "home" ? homeLocaleSwitchLinks.eu : alternates.eu,
  };

  const handleNativeLinkNavigation = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!nativeMode || !onPublicNavigate || !href.startsWith("/")) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

    event.preventDefault();
    setShowLangMenu(false);
    onPublicNavigate(href);
  };

  const getAnchorNavigationProps = (href: string) => ({
    href,
    onClick: nativeMode && onPublicNavigate && href.startsWith("/")
      ? handleNativeLinkNavigation(href)
      : undefined,
  });

  const handleLanguageSelect = (nextLanguage: Language) => {
    setShowLangMenu(false);

    if (nativeMode && onPublicNavigate) {
      const targetPath = localePathByLanguage[nextLanguage];
      if (targetPath) {
        onPublicNavigate(targetPath);
        return;
      }
    }

    onLanguageChange?.(nextLanguage);
  };

  const homeHeroTopLeftClassName = nativeMode
    ? "absolute safe-left-4 safe-top-8 z-20 flex items-start gap-3"
    : "absolute left-[1.4%] top-[0.42%] z-10 flex items-start gap-3";
  const homeHeroTopRightClassName = nativeMode
    ? "absolute safe-right-4 safe-top-8 z-20"
    : "absolute right-[1.25%] top-[0.38%] z-10";

  return (
    <div className="min-h-screen w-full overflow-x-hidden overflow-y-auto bg-white text-neutral-900 transition-colors duration-300 dark:bg-black dark:text-white">
      {!isHomeHero ? (
        <header className={`fixed top-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-xl border-b border-neutral-200/50 dark:bg-black/60 dark:border-neutral-800/50 ${nativeMode ? "native-app-shell" : ""}`}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a {...getAnchorNavigationProps(locale.homeHref)} className="flex items-center gap-3 group cursor-pointer">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center rotate-3 shadow-lg shadow-orange-500/30 group-hover:rotate-6 transition-transform duration-300">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                <span className="font-bold text-lg tracking-tight">
                  Coach <span className="text-orange-600 dark:text-orange-500">AI</span>
                </span>
              </a>

              <div className="relative">
                <button
                  type="button"
                  onClick={onLanguageChange ? () => setShowLangMenu((value) => !value) : undefined}
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-label="Change language"
                >
                  <Globe size={16} className="text-neutral-500" aria-hidden="true" />
                  <span className="text-sm font-medium">{currentLanguage.flag}</span>
                </button>
                {onLanguageChange && showLangMenu ? (
                  <div className="absolute top-full left-0 mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-50">
                    {languages.map((entry) => (
                      <button
                        key={entry.code}
                        type="button"
                        onClick={() => {
                          handleLanguageSelect(entry.code);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${
                          uiLanguage === entry.code
                            ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600"
                            : ""
                        }`}
                      >
                        <span>{entry.flag}</span>
                        <span>{entry.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <a
              {...getAnchorNavigationProps(loginHref)}
              data-cta-event="header-login"
              className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-full transition-all duration-300 flex items-center gap-2 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105"
            >
              <span>{locale.loginLabel}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </header>
      ) : null}

      <main>
        {isHomeHero ? (
          <section className="relative bg-black pt-2 pb-0 md:min-h-screen md:pb-6">
            <div className="mx-auto flex w-full max-w-7xl items-start justify-center md:min-h-screen">
              <div className="relative w-full">
                <div className="relative aspect-[1536/1024] w-full overflow-hidden bg-black">
                  <picture>
                    <source
                      type="image/avif"
                      srcSet={homeHeroResponsiveImage.avifSrcSet}
                      sizes={homeHeroResponsiveImage.sizes}
                    />
                    <source
                      type="image/webp"
                      srcSet={homeHeroResponsiveImage.webpSrcSet}
                      sizes={homeHeroResponsiveImage.sizes}
                    />
                    <img
                      src={homeHeroResponsiveImage.fallbackSrc}
                      srcSet={homeHeroResponsiveImage.pngSrcSet}
                      sizes={homeHeroResponsiveImage.sizes}
                      alt={homeHeroScreenAlt}
                      width={HOME_HERO_WIDTH}
                      height={HOME_HERO_HEIGHT}
                      loading="eager"
                      {...({ fetchpriority: "high" } as Record<string, string>)}
                      className="absolute inset-x-0 top-[14%] h-auto w-full max-w-none md:top-0"
                    />
                  </picture>

                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[7.1%] bg-gradient-to-b from-black via-black to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 top-[6.05%] h-px bg-white/10" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-black via-black/95 to-transparent" />

                  <div className={homeHeroTopLeftClassName}>
                    <a
                      {...getAnchorNavigationProps(locale.homeHref)}
                      aria-label="CoachAI"
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_10px_24px_rgba(249,115,22,0.3)]">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                      <span className="pt-0.5 text-[18px] font-bold tracking-tight text-white">
                        Coach <span className="text-orange-500">AI</span>
                      </span>
                    </a>

                    <details className="relative mt-[1px]">
                      <summary className="flex h-10 list-none items-center gap-2 rounded-[15px] border border-white/18 bg-[#2d2d2d]/95 px-3 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(0,0,0,0.24)] cursor-pointer [&::-webkit-details-marker]:hidden">
                        <Globe size={14} className="text-neutral-300" aria-hidden="true" />
                        <span>{heroLocaleCode}</span>
                      </summary>
                      <div className="absolute left-0 top-[calc(100%+8px)] min-w-[96px] overflow-hidden rounded-[15px] border border-white/10 bg-[#1f1f1f]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                        {heroLanguageLinks.map((item) => (
                          <a
                            key={item.code}
                            {...getAnchorNavigationProps(item.href)}
                            className={`flex items-center rounded-[11px] px-3 py-2 text-[13px] font-medium transition-colors ${
                              item.active ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10"
                            }`}
                          >
                            {item.code}
                          </a>
                        ))}
                      </div>
                    </details>
                  </div>

                  <div className={homeHeroTopRightClassName}>
                    <a
                      {...getAnchorNavigationProps(loginHref)}
                      data-cta-event="hero-top-start"
                      aria-label={locale.startLabel}
                      className="flex h-11 items-center gap-2 rounded-[20px] bg-gradient-to-r from-orange-500 to-orange-600 px-7 text-[14px] font-bold text-white shadow-[0_10px_26px_rgba(249,115,22,0.28)] transition-all duration-300 hover:from-orange-400 hover:to-orange-500 hover:shadow-[0_12px_30px_rgba(249,115,22,0.38)]"
                    >
                      <span>{topStartLabels[uiLanguage]}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </div>

                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-20">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className="absolute top-20 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]" />
              <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/15 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
              <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-[0_0_40px_rgba(234,88,12,0.5)]">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              <p className="text-4xl md:text-6xl font-bold mb-4 tracking-tight leading-tight">
                Coach <span className="text-orange-600 dark:text-orange-500">AI</span>
              </p>

              <h1 className="text-2xl md:text-3xl font-semibold mb-4 max-w-3xl">
                {page.h1}
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mb-10 text-base md:text-lg">
                {page.intro}
              </p>

              <div className="w-full max-w-3xl mb-8">
                <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-4 flex items-center justify-center gap-2">
                  <Play size={16} className="text-orange-500" aria-hidden="true" />
                  {heroLabel || copy.watchDemo}
                </p>
                <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-2xl bg-black">
                  {page.heroMedia?.type === "image" ? (
                    <img
                      src={heroImage}
                      alt={page.heroMedia.alt}
                      width={page.heroMedia.width}
                      height={page.heroMedia.height}
                      loading={page.heroMedia.loading || "eager"}
                      {...(page.heroMedia.fetchPriority
                        ? ({ fetchpriority: page.heroMedia.fetchPriority } as Record<string, string>)
                        : {})}
                      className="w-full h-auto"
                    />
                  ) : (
                    <video
                      src={page.heroMedia?.type === "video" ? page.heroMedia.src : PUBLIC_MEDIA_VIDEO_SRC}
                      poster={PUBLIC_MEDIA_POSTER_SRC}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-auto"
                      aria-label={heroLabel || copy.watchDemo}
                    />
                  )}
                </div>
              </div>

              <div className="mt-8 animate-bounce">
                <ChevronDown size={32} className="text-neutral-400" aria-hidden="true" />
              </div>
            </div>
          </section>
        )}

        <div className="h-8 bg-gradient-to-b from-white dark:from-black to-neutral-50 dark:to-neutral-950 md:h-24" />

        <section id={primarySectionsId} className="py-20 px-4 bg-neutral-50 dark:bg-neutral-950">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{locale.sectionsLabel}</h2>
              <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
                {page.metaDescription}
              </p>
            </div>

            <div
              className={
                isHomeFeatures
                  ? "grid grid-cols-1 md:grid-cols-6 gap-6"
                  : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              }
            >
              {featureCards.map((card, index) => {
                const Icon = card.icon;
                const cardClassName =
                  "group p-6 bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl transition-all duration-300 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-white hover:to-orange-50 dark:hover:from-neutral-900 dark:hover:to-neutral-800";
                const cardLayoutClassName =
                  isHomeFeatures
                    ? index < 3
                      ? "md:col-span-2"
                      : index === 3
                        ? "md:col-start-2 md:col-span-2"
                        : "md:col-start-4 md:col-span-2"
                    : "";

                const content = (
                  <>
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="text-orange-600 dark:text-orange-500" size={24} aria-hidden="true" />
                    </div>
                    <h3 className="font-bold text-lg mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">
                      {card.title}
                    </h3>
                    {card.lead ? (
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 leading-relaxed mb-2">
                        {card.lead}
                      </p>
                    ) : null}
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                      {card.desc}
                    </p>
                  </>
                );

                if (card.href) {
                  return (
                    <a
                      key={`${card.title}-${index}`}
                      {...getAnchorNavigationProps(card.href)}
                      className={`${cardClassName} ${cardLayoutClassName} cursor-pointer`}
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <article key={`${card.title}-${index}`} className={`${cardClassName} ${cardLayoutClassName}`}>
                    {content}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <div className="h-24 bg-gradient-to-b from-neutral-50 dark:from-neutral-950 via-neutral-900/50 to-purple-950" />

        <section className="py-24 px-4 bg-gradient-to-br from-purple-950 via-black to-blue-950 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-[100px] animate-pulse" />
            <div
              className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"
              style={{ animationDelay: "1s" }}
            />
          </div>

          <div className="max-w-6xl mx-auto relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="text-white">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur rounded-full mb-6 border border-white/20">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#gemini-gradient-public)" />
                    <path d="M2 17L12 22L22 17" stroke="url(#gemini-gradient-public)" strokeWidth="2" />
                    <path d="M2 12L12 17L22 12" stroke="url(#gemini-gradient-public)" strokeWidth="2" />
                    <defs>
                      <linearGradient id="gemini-gradient-public" x1="2" y1="2" x2="22" y2="22">
                        <stop stopColor="#4285F4" />
                        <stop offset="0.5" stopColor="#9B72CB" />
                        <stop offset="1" stopColor="#D96570" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-sm font-semibold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Google Gemini
                  </span>
                </div>

                <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                  {copy.aiTitle}
                </h2>
                <p className="text-lg text-purple-200 mb-4">{copy.aiSubtitle}</p>
                <p className="text-neutral-300 mb-8 leading-relaxed">{page.footerSummary}</p>

                <ul className="space-y-3">
                  {page.supportingPoints.slice(0, 3).map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                        <CheckCircle size={14} className="text-white" aria-hidden="true" />
                      </div>
                      <span className="text-white/90">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative group max-w-lg mx-auto lg:mx-0">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black">
                  <img
                    src={geminiShowcaseSrc}
                    alt={copy.aiShowcaseAlt}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="h-24 bg-gradient-to-b from-blue-950 via-neutral-900 to-white dark:to-black" />

        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
              {page.benefitsTitle || copy.benefitsTitle}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {benefitCards.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <article
                    key={`${benefit.title}-${index}`}
                    className="group flex gap-4 p-4 rounded-2xl hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <Icon className="text-white" size={28} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">
                        {benefit.title}
                      </h3>
                      <p className="text-neutral-500 dark:text-neutral-400">{benefit.desc}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {page.id === "faq" && page.faqItems?.length ? (
          <section className="py-20 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.faqTitle}</h2>
                <p className="text-neutral-500 dark:text-neutral-400">{copy.faqIntro}</p>
              </div>

              <div className="space-y-4">
                {page.faqItems.map((item) => (
                  <details
                    key={item.question}
                    className="group p-6 bg-white dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 rounded-2xl transition-all duration-300 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10"
                  >
                    <summary className="cursor-pointer list-none font-bold text-lg group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">
                      {item.question}
                    </summary>
                    <p className="mt-4 text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {page.id === "home" ? copy.sportsTitle : copy.relatedTitle}
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-10 max-w-2xl mx-auto">
              {page.id === "home" ? copy.sportsDescription : copy.relatedDescription}
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              {exploreLinks.map((item) =>
                item.href ? (
                  <a
                    key={item.label}
                    {...getAnchorNavigationProps(item.href)}
                    className="px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full text-sm font-medium hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-500 transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-md"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span
                    key={item.label}
                    className="px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full text-sm font-medium hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-500 transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-md"
                  >
                    {item.label}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="py-24 px-4 bg-gradient-to-br from-orange-600 to-orange-700">
          <div className="max-w-3xl mx-auto text-center text-white">
            <Star className="mx-auto mb-6" size={48} aria-hidden="true" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{page.finalCtaTitle}</h2>
            <p className="text-orange-100 mb-10 text-lg">{page.finalCtaDescription}</p>
            <a
              {...getAnchorNavigationProps(page.id === "access" ? loginHref : accessPage.path)}
              data-cta-event="footer-login"
              className="px-10 py-4 bg-white text-orange-600 font-bold rounded-full transition-all hover:scale-105 shadow-xl flex items-center gap-3 mx-auto text-lg w-fit"
            >
              <span>{page.id === "access" ? locale.loginLabel : copy.ctaLabel}</span>
              <ArrowRight size={22} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between md:gap-12">
            <div className="flex-1">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                {locale.footerLinksLabel}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {footerPageLinks.map((item) => (
                  <a
                    key={item.href}
                    {...getAnchorNavigationProps(item.href)}
                    className="text-sm text-neutral-600 transition-colors hover:text-orange-600 dark:text-neutral-300 dark:hover:text-orange-500"
                  >
                    {item.title}
                  </a>
                ))}
              </div>
            </div>

            <div className="md:min-w-52">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                {locale.footerLocalesLabel}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {footerLocaleLinks.map((item) => (
                  <a
                    key={item.href}
                    {...getAnchorNavigationProps(item.href)}
                    className={`text-sm transition-colors ${
                      item.active
                        ? "text-orange-600 dark:text-orange-500"
                        : "text-neutral-600 hover:text-orange-600 dark:text-neutral-300 dark:hover:text-orange-500"
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            <p>{copy.footerText}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
