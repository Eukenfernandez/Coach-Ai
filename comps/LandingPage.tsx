import React from "react";
import { PublicPageTemplate } from "./public/PublicPageTemplate";
import { getPageContent, type PublicPageContent, toSeoLocale } from "../seo/site";
import type { Language } from "../types";

interface LandingPageProps {
  onContinue?: () => void;
  language: Language;
  onLanguageChange?: (lang: Language) => void;
  page?: PublicPageContent;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  language,
  onLanguageChange,
  page,
}) => {
  const locale = toSeoLocale(language);
  const resolvedPage = page || getPageContent("home", locale);

  return (
    <PublicPageTemplate
      page={resolvedPage}
      language={language}
      onLanguageChange={onLanguageChange}
    />
  );
};
