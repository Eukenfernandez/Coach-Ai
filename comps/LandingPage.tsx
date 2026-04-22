import React from "react";
import { ArrowRight, Globe } from "lucide-react";
import { PublicPageTemplate } from "./public/PublicPageTemplate";
import {
  getPageContent,
  getHomeHeroResponsiveImage,
  type PublicPageContent,
  toSeoLocale,
} from "../seo/site";
import type { Language } from "../types";

interface LandingPageProps {
  onContinue?: () => void;
  language: Language;
  onLanguageChange?: (lang: Language) => void;
  nativeMode?: boolean;
  onPublicNavigate?: (path: string) => void;
  page?: PublicPageContent;
}

const nativeLanguageOptions: Array<{ code: Language; label: string }> = [
  { code: "es", label: "ES" },
  { code: "ing", label: "EN" },
  { code: "eus", label: "EU" },
];

const nativeStartLabels: Record<Language, string> = {
  es: "Comenzar",
  ing: "Start",
  eus: "Hasi",
};

function NativeLandingPage({
  language,
  onContinue,
  onLanguageChange,
}: Pick<LandingPageProps, "language" | "onContinue" | "onLanguageChange">) {
  const locale = toSeoLocale(language);
  const page = getPageContent("home", locale);
  const heroImage = getHomeHeroResponsiveImage(locale);

  return (
    <div className="native-app-shell min-h-screen h-[100dvh] w-full overflow-y-auto bg-black text-white">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_12px_26px_rgba(249,115,22,0.35)]">
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
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-orange-400/80">
                CoachAI
              </p>
              <p className="text-xl font-bold tracking-tight">
                Coach <span className="text-orange-500">AI</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/6 p-1 backdrop-blur">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-white/75">
              <Globe size={16} aria-hidden="true" />
            </div>
            {nativeLanguageOptions.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => onLanguageChange?.(entry.code)}
                className={`min-w-[48px] rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                  language === entry.code
                    ? "bg-orange-500 text-white"
                    : "text-white/78 hover:bg-white/10"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-1 flex-col gap-6 sm:mt-8 sm:grid sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:items-center sm:gap-8">
          <div className="order-2 flex flex-col justify-center sm:order-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-orange-400/80">
              {page.eyebrow}
            </p>
            <h1 className="max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              {page.h1}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/72 sm:text-lg">
              {page.intro}
            </p>

            <div className="mt-6 space-y-3">
              {page.supportingPoints.slice(0, 3).map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-sm"
                >
                  <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-orange-500" />
                  <p className="text-sm leading-6 text-white/78 sm:text-[15px]">{point}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onContinue}
              className="mt-7 hidden h-14 w-fit items-center gap-3 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-8 text-base font-bold text-white shadow-[0_16px_34px_rgba(249,115,22,0.34)] transition-transform hover:scale-[1.01] sm:inline-flex"
            >
              <span>{nativeStartLabels[language]}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="order-1 sm:order-2">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
              <img
                src={heroImage.fallbackSrc}
                srcSet={heroImage.pngSrcSet}
                sizes="(orientation: landscape) 52vw, 100vw"
                alt={page.h1}
                width={heroImage.width}
                height={heroImage.height}
                className="block h-auto w-full"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-6 inline-flex h-14 items-center justify-center gap-3 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-8 text-base font-bold text-white shadow-[0_16px_34px_rgba(249,115,22,0.34)] sm:hidden"
        >
          <span>{nativeStartLabels[language]}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onContinue,
  language,
  onLanguageChange,
  nativeMode,
  onPublicNavigate,
  page,
}) => {
  const locale = toSeoLocale(language);
  const resolvedPage = nativeMode ? getPageContent("home", locale) : page || getPageContent("home", locale);

  if (nativeMode) {
    return (
      <NativeLandingPage
        language={language}
        onContinue={onContinue}
        onLanguageChange={onLanguageChange}
      />
    );
  }

  return (
    <PublicPageTemplate
      page={resolvedPage}
      language={language}
      onLanguageChange={onLanguageChange}
      nativeMode={nativeMode}
      onPublicNavigate={onPublicNavigate}
    />
  );
};
