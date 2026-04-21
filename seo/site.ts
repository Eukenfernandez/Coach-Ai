import type { Language } from "../types";

export const SITE_URL = "https://coachai.es";
export const SITE_NAME = "CoachAI";
export const SITE_TITLE_SUFFIX = "CoachAI";
export const PUBLIC_MEDIA_VIDEO_SRC = "/video/coach.mp4";
export const PUBLIC_MEDIA_POSTER_SRC = "/video/coach-poster.jpg";
export const DEFAULT_OG_IMAGE = `${SITE_URL}${PUBLIC_MEDIA_POSTER_SRC}`;
export const DEFAULT_SUPPORT_EMAIL = "";
export const SPANISH_HOME_ALIAS_PATH = "/es";
export const HOME_HERO_WIDTH = 1536;
export const HOME_HERO_HEIGHT = 1024;

const HOME_HERO_TARGET_WIDTHS = [640, 960, 1280, 1536] as const;
const HOME_HERO_FALLBACK_WIDTH = 960;
const homeHeroOptimizedBaseByLocale = {
  es: "/optimized/home-hero-screen",
  en: "/optimized/home-hero-screen-en",
  eu: "/optimized/home-hero-screen-eu",
} as const;

export type SeoLocale = "es" | "en" | "eu";
export type PublicPageId =
  | "home"
  | "video-analysis"
  | "technique-analysis"
  | "training-tracking"
  | "personal-records"
  | "progress-tracking"
  | "faq"
  | "access";

export type HeroMedia =
  | { type: "video"; src: string; label: string }
  | {
      type: "image";
      src: string;
      alt: string;
      width: number;
      height: number;
      loading?: "eager" | "lazy";
      fetchPriority?: "high" | "auto";
    };

export interface SectionBlock {
  title: string;
  lead?: string;
  body: string;
  bullets?: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PublicPageContent {
  id: PublicPageId;
  locale: SeoLocale;
  path: string;
  shortTitle: string;
  metaTitle: string;
  metaDescription: string;
  socialTitle?: string;
  socialDescription?: string;
  eyebrow: string;
  h1: string;
  intro: string;
  supportingPoints: string[];
  benefitsTitle?: string;
  benefitCards?: SectionBlock[];
  sections: SectionBlock[];
  heroMedia?: HeroMedia;
  faqItems?: FaqItem[];
  relatedPages: PublicPageId[];
  finalCtaTitle: string;
  finalCtaDescription: string;
  footerSummary: string;
}

export interface LocaleCopy {
  localeName: string;
  localeTag: string;
  ogLocale: string;
  appLanguage: Language;
  homeHref: string;
  loginLabel: string;
  startLabel: string;
  secondaryCtaLabel: string;
  sectionsLabel: string;
  faqLabel: string;
  relatedLabel: string;
  breadcrumbLabel: string;
  footerLinksLabel: string;
  footerLocalesLabel: string;
  visibleFaqIntro: string;
  accessSupportIntro: string;
  accessSupportFallback: string;
  accessLoginHint: string;
  accessRegisterHint: string;
  accessContactHint: string;
}

export type ResponsiveHomeHeroImage = {
  width: number;
  height: number;
  sizes: string;
  fallbackSrc: string;
  pngSrcSet: string;
  webpSrcSet: string;
  avifSrcSet: string;
  preloadHref: string;
  preloadSrcSet: string;
};

export const localeConfig: Record<SeoLocale, LocaleCopy> = {
  es: {
    localeName: "Español",
    localeTag: "es-ES",
    ogLocale: "es_ES",
    appLanguage: "es",
    homeHref: "/",
    loginLabel: "Acceso",
    startLabel: "Entrar en CoachAI",
    secondaryCtaLabel: "Ver preguntas frecuentes",
    sectionsLabel: "Qué puedes hacer",
    faqLabel: "Preguntas frecuentes",
    relatedLabel: "Explora también",
    breadcrumbLabel: "Breadcrumb",
    footerLinksLabel: "Páginas principales",
    footerLocalesLabel: "Idiomas",
    visibleFaqIntro: "Respuestas visibles y útiles antes de crear tu cuenta.",
    accessSupportIntro: "CoachAI separa la capa pública indexable de la zona privada con login.",
    accessSupportFallback:
      "Añade un email de soporte en la configuración SEO para mostrar contacto directo.",
    accessLoginHint:
      "Entra en tu área privada sin indexar dashboards, registros ni datos del usuario.",
    accessRegisterHint:
      "Crea tu cuenta para empezar con vídeo, técnica, marcas personales y seguimiento del progreso.",
    accessContactHint:
      "La capa pública deja preparado el contacto sin inventar datos que hoy no existen.",
  },
  en: {
    localeName: "English",
    localeTag: "en-US",
    ogLocale: "en_US",
    appLanguage: "ing",
    homeHref: "/en",
    loginLabel: "Access",
    startLabel: "Open CoachAI",
    secondaryCtaLabel: "Read the FAQ",
    sectionsLabel: "What you can do",
    faqLabel: "FAQ",
    relatedLabel: "Explore related pages",
    breadcrumbLabel: "Breadcrumb",
    footerLinksLabel: "Main pages",
    footerLocalesLabel: "Languages",
    visibleFaqIntro: "Clear answers before signup.",
    accessSupportIntro:
      "CoachAI keeps its public indexable layer separate from the authenticated workspace.",
    accessSupportFallback:
      "Add a support email in the SEO configuration to show direct contact here.",
    accessLoginHint:
      "Open the private app without exposing dashboards or athlete data to search engines.",
    accessRegisterHint:
      "Create an account to start with video review, personal records, and training progress.",
    accessContactHint:
      "The support layer is ready even if direct contact details still need to be configured.",
  },
  eu: {
    localeName: "Euskara",
    localeTag: "eu-ES",
    ogLocale: "eu_ES",
    appLanguage: "eus",
    homeHref: "/eu",
    loginLabel: "Sarbidea",
    startLabel: "Ireki CoachAI",
    secondaryCtaLabel: "Irakurri FAQ orria",
    sectionsLabel: "Zer egin dezakezu",
    faqLabel: "Ohiko galderak",
    relatedLabel: "Lotutako orriak",
    breadcrumbLabel: "Breadcrumb",
    footerLinksLabel: "Orri nagusiak",
    footerLocalesLabel: "Hizkuntzak",
    visibleFaqIntro: "Kontua sortu aurretik ikus daitezkeen erantzun argiak.",
    accessSupportIntro:
      "CoachAIk geruza publikoa eta eremu pribatu autentifikatua bereizten ditu.",
    accessSupportFallback:
      "Gehitu laguntza helbide elektroniko bat SEO konfigurazioan kontaktu zuzena erakusteko.",
    accessLoginHint:
      "Sartu eremu pribatura dashboardak edo erabiltzaileen datuak indexatu gabe.",
    accessRegisterHint:
      "Sortu kontua bideo analisia, marka pertsonalak eta aurrerapenaren jarraipena hasteko.",
    accessContactHint:
      "Kontaktu publikorako oinarria prest dago, baina benetako xehetasunak konfiguratu behar dira.",
  },
};

function withSuffix(title: string) {
  return `${title} | ${SITE_TITLE_SUFFIX}`;
}

function buildHomeHeroSrcSet(basePath: string, extension: "avif" | "webp" | "png") {
  return HOME_HERO_TARGET_WIDTHS.map((width) => `${basePath}-${width}.${extension} ${width}w`).join(", ");
}

export function getHomeHeroResponsiveImage(locale: SeoLocale): ResponsiveHomeHeroImage {
  const basePath = homeHeroOptimizedBaseByLocale[locale];
  return {
    width: HOME_HERO_WIDTH,
    height: HOME_HERO_HEIGHT,
    sizes: "100vw",
    fallbackSrc: `${basePath}-${HOME_HERO_FALLBACK_WIDTH}.png`,
    pngSrcSet: buildHomeHeroSrcSet(basePath, "png"),
    webpSrcSet: buildHomeHeroSrcSet(basePath, "webp"),
    avifSrcSet: buildHomeHeroSrcSet(basePath, "avif"),
    preloadHref: `${basePath}-${HOME_HERO_FALLBACK_WIDTH}.avif`,
    preloadSrcSet: buildHomeHeroSrcSet(basePath, "avif"),
  };
}

function entry(
  id: PublicPageId,
  locale: SeoLocale,
  data: Omit<PublicPageContent, "id" | "locale">,
): PublicPageContent {
  return { id, locale, ...data };
}

function imageHero(alt: string, loading: "eager" | "lazy" = "lazy"): HeroMedia {
  return {
    type: "image",
    src: PUBLIC_MEDIA_POSTER_SRC,
    alt,
    width: 1918,
    height: 988,
    loading,
    fetchPriority: loading === "eager" ? "high" : "auto",
  };
}

function videoHero(label: string): HeroMedia {
  return {
    type: "video",
    src: PUBLIC_MEDIA_VIDEO_SRC,
    label,
  };
}

const pageMap = {} as Record<PublicPageId, Record<SeoLocale, PublicPageContent>>;

Object.assign(pageMap, {
  home: {
    es: entry("home", "es", {
      path: "/",
      shortTitle: "Inicio",
      metaTitle: withSuffix("App de entrenamiento con IA para analizar vídeo, técnica y progreso"),
      metaDescription:
        "Analiza tus vídeos con inteligencia artificial, corrige tu técnica con precisión, registra tus mejores marcas y sigue tu evolución en un solo lugar. Coach AI convierte cada entrenamiento en una oportunidad real de progresar.",
      socialTitle: "App de entrenamiento con IA para analizar vídeo y progreso",
      socialDescription:
        "Analiza tus vídeos con inteligencia artificial, corrige tu técnica con precisión, registra tus mejores marcas y sigue tu evolución en un solo lugar.",
      eyebrow: "CoachAI",
      h1: "App de entrenamiento con IA para analizar vídeo, técnica y progreso",
      intro:
        "Coach AI convierte cada entrenamiento en una oportunidad real de progresar con análisis de vídeo, técnica, marcas personales y seguimiento en un solo lugar.",
      supportingPoints: [
        "Analiza tus vídeos con inteligencia artificial.",
        "Corrige tu técnica con precisión.",
        "Registra tus mejores marcas y sigue tu evolución.",
      ],
      benefitsTitle: "¿En qué puede mejorar tu entrenamiento?",
      benefitCards: [
        {
          title: "Corrige errores que no ves",
          body:
            "Detecta fallos técnicos que a simple vista suelen pasar desapercibidos.",
        },
        {
          title: "Entiende mejor cada ejecución",
          body:
            "Revisa tus vídeos con más claridad y descubre qué debes ajustar.",
        },
        {
          title: "Sigue tu progreso real",
          body:
            "Guarda tus marcas y comprueba cómo evolucionas con el tiempo.",
        },
        {
          title: "Entrena con más criterio",
          body:
            "Toma mejores decisiones con ayuda de datos, vídeo y contexto.",
        },
      ],
      sections: [
        {
          title: "Análisis de vídeo",
          lead: "Convierte cada vídeo en mejora real",
          body:
            "La IA analiza tu ejecución, detecta errores técnicos y te muestra qué debes corregir.",
        },
        {
          title: "Técnica de ejercicios",
          lead: "Corrige tu técnica con más precisión",
          body:
            "Detecta fallos que a simple vista pasan desapercibidos y entrena con más control.",
        },
        {
          title: "Seguimiento de entrenamientos",
          lead: "Todo tu progreso, en un solo lugar",
          body:
            "Reúne sesiones, vídeos, métricas y evolución para entender cómo avanzas.",
        },
        {
          title: "Marcas personales",
          lead: "Registra tus marcas y supéralas",
          body:
            "Guarda tus mejores resultados y relaciónalos con tu técnica y entrenamiento.",
        },
        {
          title: "Progreso de entrenamiento",
          lead: "Sigue tu evolución con claridad",
          body:
            "Visualiza qué funciona, qué debes ajustar y cómo seguir mejorando.",
        },
      ],
      heroMedia: videoHero("Demo de CoachAI analizando un entrenamiento"),
      faqItems: [
        {
          question: "¿CoachAI sirve para analizar vídeos de ejercicios con IA?",
          answer:
            "Sí. Está pensada para revisar vídeos de entrenamientos, detectar patrones técnicos y aportar feedback útil sobre la ejecución.",
        },
        {
          question: "¿También sirve para registrar marcas personales y progreso?",
          answer:
            "Sí. Combina análisis técnico con seguimiento de entrenamientos, evolución y mejores marcas en la misma cuenta.",
        },
        {
          question: "¿El área privada se indexa en Google?",
          answer:
            "No. La estrategia separa la capa pública indexable de la zona autenticada y excluye áreas privadas del sitemap.",
        },
      ],
      relatedPages: [
        "video-analysis",
        "technique-analysis",
        "training-tracking",
        "personal-records",
        "progress-tracking",
        "faq",
        "access",
      ],
      finalCtaTitle: "Empieza a analizar tus entrenamientos con más contexto",
      finalCtaDescription:
        "Accede a CoachAI para revisar vídeos, mejorar técnica, registrar marcas y seguir tu progreso.",
      footerSummary:
        "Aplicación para análisis de vídeo deportivo con IA, seguimiento técnico y progreso del entrenamiento.",
    }),
    en: entry("home", "en", {
      path: "/en",
      shortTitle: "Home",
      metaTitle: withSuffix("AI training app for video analysis, technique, and progress"),
      metaDescription:
        "CoachAI is an AI training app for sports video analysis, exercise technique review, personal records logging, and training progress tracking.",
      socialTitle: "AI training app for video analysis and progress tracking",
      socialDescription:
        "Analyze workout videos, improve technique, log records, and track progress with CoachAI.",
      eyebrow: "CoachAI",
      h1: "AI training app for video analysis, technique, and progress",
      intro:
        "CoachAI combines AI workout analysis, technical review, personal records logging, and training progress tracking in one product for athletes and coaches.",
      supportingPoints: [
        "Analyze training videos with AI.",
        "Detect repeated technical issues.",
        "Track personal records and progress.",
      ],
      sections: [
        {
          title: "AI sports video analysis with useful context",
          body:
            "Upload videos and review technical observations, comparison points, and movement context instead of relying on isolated clips.",
          bullets: [
            "AI sports video analysis.",
            "Frame and segment review.",
            "Technique comparison over time.",
          ],
        },
        {
          title: "Turn every session into measurable progress",
          body:
            "CoachAI connects videos with logs, plans, and records so progress has real context across training blocks.",
          bullets: [
            "Workout tracking.",
            "Personal records logging.",
            "Technical history in one place.",
          ],
        },
        {
          title: "Public SEO layer, private workspace",
          body:
            "The public layer stays crawlable while the authenticated workspace remains outside the index.",
          bullets: [
            "Real initial HTML.",
            "Protected private app areas.",
            "Scalable landing framework.",
          ],
        },
      ],
      heroMedia: videoHero("CoachAI training analysis demo"),
      faqItems: [
        {
          question: "Can CoachAI analyze workout videos with AI?",
          answer:
            "Yes. It reviews training videos, detects technical patterns, and provides useful feedback for athletes and coaches.",
        },
        {
          question: "Does it also track personal records and progress?",
          answer:
            "Yes. The app combines video analysis, records logging, and progress tracking in the same product.",
        },
        {
          question: "Is the private area indexed by Google?",
          answer:
            "No. The SEO setup separates the public site from the authenticated workspace and excludes private URLs from the sitemap.",
        },
      ],
      relatedPages: [
        "video-analysis",
        "technique-analysis",
        "training-tracking",
        "personal-records",
        "progress-tracking",
        "faq",
        "access",
      ],
      finalCtaTitle: "Start reviewing your training with more technical clarity",
      finalCtaDescription:
        "Open CoachAI to analyze videos, improve technique, log records, and track progress.",
      footerSummary:
        "AI product for sports video analysis, exercise technique review, and workout progress tracking.",
    }),
    eu: entry("home", "eu", {
      path: "/eu",
      shortTitle: "Hasiera",
      metaTitle: withSuffix("Entrenamendu appa IArekin bideoa, teknika eta aurrerapena aztertzeko"),
      metaDescription:
        "CoachAI entrenamendu app bat da IArekin: kirol bideoak aztertu, ariketen teknika hobetu, marka pertsonalak erregistratu eta aurrerapena jarraitzeko.",
      socialTitle: "Entrenamendu appa IArekin bideoa eta aurrerapena aztertzeko",
      socialDescription:
        "Aztertu bideoak, hobetu teknika, erregistratu markak eta jarraitu aurrerapena CoachAI-rekin.",
      eyebrow: "CoachAI",
      h1: "Entrenamendu appa IArekin bideoa, teknika eta aurrerapena aztertzeko",
      intro:
        "CoachAIk bideo analisia, berrikuspen teknikoa, marka pertsonalen erregistroa eta entrenamenduaren bilakaera produktu berean biltzen ditu.",
      supportingPoints: [
        "Aztertu entrenamendu bideoak IArekin.",
        "Detektatu akats tekniko errepikatuak.",
        "Jarraitu markak eta aurrerapena.",
      ],
      sections: [
        {
          title: "Kirol bideo analisia testuinguru erabilgarriarekin",
          body:
            "Igo bideoak eta berrikusi behaketa teknikoak, konparazioak eta hobekuntza puntuak ariketa bakoitzean.",
          bullets: [
            "IA bidezko kirol bideo analisia.",
            "Frame eta tarte mailako berrikuspena.",
            "Saiakeren konparazio teknikoa.",
          ],
        },
        {
          title: "Saio bakoitza aurrerapen neurgarri bihurtu",
          body:
            "CoachAIk bideoa, entrenamenduak, markak eta bilakaera lotzen ditu saioen arteko testuingurua ez galtzeko.",
          bullets: [
            "Entrenamenduen jarraipena.",
            "Marka pertsonalen erregistroa.",
            "Historia tekniko erabilgarria.",
          ],
        },
        {
          title: "Geruza publikoa eta eremu pribatua bereizita",
          body:
            "Geruza publikoa indexagarria da eta eremu autentifikatua bilatzaileetatik kanpo geratzen da.",
          bullets: [
            "Hasierako HTML erabilgarria.",
            "Zona pribatu babestua.",
            "Etorkizuneko landingentzako oinarri eskalagarria.",
          ],
        },
      ],
      heroMedia: videoHero("CoachAI entrenamendu analisiaren demoa"),
      faqItems: [
        {
          question: "CoachAIk entrenamendu bideoak IArekin aztertzen ditu?",
          answer:
            "Bai. Entrenamendu bideoak berrikusteko eta eredu teknikoak identifikatzeko diseinatuta dago.",
        },
        {
          question: "Marka pertsonalak eta aurrerapena ere jarraitu daitezke?",
          answer:
            "Bai. Bideo analisia, marka erregistroa eta entrenamendu bilakaera produktu berean uztartzen ditu.",
        },
        {
          question: "Zona pribatua Google-n indexatzen da?",
          answer:
            "Ez. Geruza publikoa eta eremu autentifikatua bereizita daude, eta URL pribatuak sitemap-etik kanpo uzten dira.",
        },
      ],
      relatedPages: [
        "video-analysis",
        "technique-analysis",
        "training-tracking",
        "personal-records",
        "progress-tracking",
        "faq",
        "access",
      ],
      finalCtaTitle: "Hasi zure entrenamenduak testuinguru gehiagorekin berrikusten",
      finalCtaDescription:
        "Ireki CoachAI bideoak aztertzeko, teknika hobetzeko eta aurrerapena jarraitzeko.",
      footerSummary:
        "IA duen aplikazioa kirol bideo analisia, teknikaren ebaluazioa eta entrenamenduaren jarraipena egiteko.",
    }),
  },
});

Object.assign(pageMap, {
  "video-analysis": {
    es: entry("video-analysis", "es", {
      path: "/es/analisis-video-deportivo-ia",
      shortTitle: "Análisis de vídeo",
      metaTitle: withSuffix("Análisis de vídeo deportivo con IA"),
      metaDescription:
        "Landing pública de CoachAI para análisis de vídeo deportivo con IA: revisa técnica, detecta errores, compara ejecuciones y conecta el vídeo con tu progreso.",
      eyebrow: "Análisis de vídeo deportivo con IA",
      h1: "Análisis de vídeo deportivo con IA para entender mejor cada entrenamiento",
      intro:
        "CoachAI convierte vídeos de entrenamientos en observaciones técnicas accionables para atletas y entrenadores.",
      supportingPoints: [
        "Sube vídeos de entrenamiento o competición.",
        "Revisa técnica frame a frame o por tramos.",
        "Usa IA para detectar patrones repetidos.",
      ],
      sections: [
        {
          title: "Qué mejora una app de análisis de vídeo deportivo con IA",
          body:
            "La revisión útil no solo marca errores: conecta gesto, secuencia técnica y contexto del entrenamiento.",
          bullets: [
            "Lectura técnica de movimientos.",
            "Detección de patrones repetidos.",
            "Comparación entre intentos.",
          ],
        },
        {
          title: "CoachAI lo conecta con tu progreso real",
          body:
            "El vídeo deja de ser aislado porque la app lo relaciona con entrenamientos, marcas y evolución.",
          bullets: [
            "Historial de vídeos.",
            "Contexto de sesiones.",
            "Seguimiento de cambios técnicos.",
          ],
        },
      ],
      heroMedia: imageHero("Interfaz de análisis de vídeo deportivo con IA en CoachAI"),
      faqItems: [
        {
          question: "¿Qué tipo de vídeos puede analizar CoachAI?",
          answer:
            "Vídeos de entrenamientos, ejercicios y sesiones técnicas donde importa revisar ejecución, postura y secuencia.",
        },
        {
          question: "¿Puedo comparar dos vídeos?",
          answer:
            "Sí. La app está preparada para comparar intentos y revisar cambios técnicos entre sesiones.",
        },
        {
          question: "¿Sirve para distintos deportes?",
          answer:
            "Sí. Está orientada a contextos deportivos y de ejercicio donde el vídeo ayuda a leer técnica y evolución.",
        },
      ],
      relatedPages: ["technique-analysis", "training-tracking", "progress-tracking", "faq", "access"],
      finalCtaTitle: "Accede a CoachAI para revisar tu técnica sobre vídeo",
      finalCtaDescription:
        "Entra en la app para subir vídeos, revisar patrones técnicos y conectar el análisis con tu progreso.",
      footerSummary:
        "CoachAI ayuda a revisar técnica y evolución a partir de vídeos deportivos con IA.",
    }),
    en: entry("video-analysis", "en", {
      path: "/en/ai-sports-video-analysis",
      shortTitle: "Video analysis",
      metaTitle: withSuffix("AI sports video analysis"),
      metaDescription:
        "Public CoachAI landing for AI sports video analysis: review technique, detect recurring issues, compare attempts, and connect video feedback with training context.",
      eyebrow: "AI sports video analysis",
      h1: "AI sports video analysis for clearer training decisions",
      intro:
        "CoachAI turns workout and sports videos into technical observations that help athletes and coaches review execution and timing.",
      supportingPoints: [
        "Upload training or competition videos.",
        "Review technique frame by frame or by segment.",
        "Use AI to identify repeated issues.",
      ],
      sections: [
        {
          title: "Why AI sports video analysis matters",
          body:
            "Useful review connects visible issues with movement quality and training context instead of isolated screenshots.",
          bullets: [
            "Structured movement review.",
            "Pattern detection.",
            "Side-by-side comparisons.",
          ],
        },
        {
          title: "CoachAI links video with the rest of your training",
          body:
            "The product ties video to logs, performance history, and personal records so feedback is easier to act on.",
          bullets: [
            "Video library per athlete.",
            "Session context.",
            "Technical evolution over time.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI AI sports video analysis interface"),
      faqItems: [
        {
          question: "What kind of videos can CoachAI analyze?",
          answer:
            "Training, exercise, and technical sports videos where review helps evaluate execution, posture, and repeated movement patterns.",
        },
        {
          question: "Can I compare two videos?",
          answer: "Yes. The app supports comparison workflows between attempts or sessions.",
        },
        {
          question: "Does it work for different sports?",
          answer:
            "Yes. It is designed for sports and exercise contexts where video helps review technique.",
        },
      ],
      relatedPages: ["technique-analysis", "training-tracking", "progress-tracking", "faq", "access"],
      finalCtaTitle: "Open CoachAI to review your training videos with more context",
      finalCtaDescription:
        "Use the app to upload videos, inspect technical patterns, and connect video feedback with progress.",
      footerSummary:
        "CoachAI helps athletes and coaches analyze sports videos with AI and training context.",
    }),
    eu: entry("video-analysis", "eu", {
      path: "/eu/kirol-bideo-analisia-ia",
      shortTitle: "Bideo analisia",
      metaTitle: withSuffix("Kirol bideo analisia IArekin"),
      metaDescription:
        "CoachAI-ren landing publikoa IA bidezko kirol bideo analisirako: teknika berrikusi, akats errepikatuak detektatu eta feedbacka entrenamenduarekin lotu.",
      eyebrow: "Kirol bideo analisia IArekin",
      h1: "Kirol bideo analisia IArekin entrenamendua hobeto ulertzeko",
      intro:
        "CoachAIk entrenamendu bideoak behaketa tekniko baliagarri bihurtzen ditu atleta eta entrenatzaileentzat.",
      supportingPoints: [
        "Igo entrenamendu edo lehiaketa bideoak.",
        "Berrikusi teknika frame-ka edo tarteka.",
        "Erabili IA eredu teknikoak detektatzeko.",
      ],
      sections: [
        {
          title: "Zergatik da garrantzitsua bideo analisi adimentsua",
          body:
            "Berrikuspen erabilgarriak akatsak, mugimendu kalitatea eta entrenamendu testuingurua lotzen ditu.",
          bullets: [
            "Mugimenduaren berrikuspen egituratua.",
            "Eredu errepikatuak.",
            "Saiakeren konparazioa.",
          ],
        },
        {
          title: "CoachAIk bideoa gainerako entrenamenduarekin lotzen du",
          body:
            "Bideoa ez da elementu isolatua: saioak, errendimendua eta markak ere sartzen dira.",
          bullets: [
            "Bideo galeria.",
            "Saioen testuingurua.",
            "Bilakaera teknikoa denboran.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI kirol bideo analisi interfazea"),
      faqItems: [
        {
          question: "Zein bideo mota azter ditzake CoachAIk?",
          answer:
            "Entrenamendu, ariketa eta saio teknikoetako bideoak, exekuzioa, postura eta eredu teknikoak berrikusteko.",
        },
        {
          question: "Bi bideo konpara ditzaket?",
          answer: "Bai. Aplikazioak saiakerak edo saioak konparatzeko fluxuak onartzen ditu.",
        },
        {
          question: "Kirol desberdinetarako balio du?",
          answer:
            "Bai. Bideo bidez teknika berrikusi daitekeen kirol eta ariketa testuinguruetarako diseinatuta dago.",
        },
      ],
      relatedPages: ["technique-analysis", "training-tracking", "progress-tracking", "faq", "access"],
      finalCtaTitle: "Ireki CoachAI zure entrenamendu bideoak testuinguru gehiagorekin berrikusteko",
      finalCtaDescription:
        "Erabili appa bideoak igotzeko, eredu teknikoak aztertzeko eta feedbacka aurrerapenarekin lotzeko.",
      footerSummary:
        "CoachAIk kirol bideoak IArekin eta entrenamendu testuinguruarekin aztertzen laguntzen du.",
    }),
  },
  "technique-analysis": {
    es: entry("technique-analysis", "es", {
      path: "/es/analizar-tecnica-ejercicios",
      shortTitle: "Técnica de ejercicios",
      metaTitle: withSuffix("App para analizar técnica de ejercicios"),
      metaDescription:
        "CoachAI ayuda a analizar técnica de ejercicios con vídeo e IA para detectar errores, mejorar ejecución y revisar progreso técnico.",
      eyebrow: "App para analizar técnica de ejercicios",
      h1: "App para analizar técnica de ejercicios con vídeo e IA",
      intro:
        "CoachAI revisa técnica de ejercicios y gestos deportivos con apoyo visual, contexto técnico y seguimiento de la evolución.",
      supportingPoints: [
        "Detecta errores repetidos y compensaciones.",
        "Aporta contexto técnico sobre cada fase.",
        "Permite comparar ejecuciones y valorar mejoras.",
      ],
      sections: [
        {
          title: "Analizar técnica exige contexto",
          body:
            "Una app útil debe ayudarte a entender cómo cambia el gesto con el tiempo y dónde se repiten los fallos.",
          bullets: [
            "Revisión por fases.",
            "Contexto visual para postura.",
            "Comparación entre repeticiones.",
          ],
        },
        {
          title: "CoachAI une técnica, seguimiento y rendimiento",
          body:
            "El análisis técnico se conecta con marcas personales, planificación y entrenamientos.",
          bullets: [
            "Técnica ligada al historial.",
            "Seguimiento del progreso técnico.",
            "Visión clara de lo que funciona.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI analizando técnica de ejercicios"),
      faqItems: [
        {
          question: "¿CoachAI sirve para mejorar técnica de ejercicios?",
          answer:
            "Sí. Está orientada a revisar ejecución, postura y cambios técnicos a partir de vídeo.",
        },
        {
          question: "¿Puede usarse con ejercicios de gimnasio y técnica deportiva?",
          answer:
            "Sí. Está pensada para ejercicios y contextos deportivos donde el vídeo ayuda a interpretar mejor el movimiento.",
        },
        {
          question: "¿La técnica se relaciona con mi progreso?",
          answer: "Sí. CoachAI conecta el análisis técnico con tus registros y evolución.",
        },
      ],
      relatedPages: ["video-analysis", "training-tracking", "personal-records", "faq", "access"],
      finalCtaTitle: "Revisa tu técnica con más claridad y contexto",
      finalCtaDescription:
        "Entra en CoachAI para analizar ejercicios con vídeo y conectar el feedback con tu progreso real.",
      footerSummary:
        "CoachAI ayuda a analizar técnica de ejercicios y seguir mejoras con más contexto.",
    }),
    en: entry("technique-analysis", "en", {
      path: "/en/exercise-technique-analysis-app",
      shortTitle: "Technique analysis",
      metaTitle: withSuffix("App to analyze exercise technique"),
      metaDescription:
        "CoachAI helps athletes analyze exercise technique with video and AI to detect repeated issues and review technical progress.",
      eyebrow: "App to analyze exercise technique",
      h1: "App to analyze exercise technique with video and AI",
      intro:
        "CoachAI reviews exercise technique and sports movement with visual evidence, technical context, and progress tracking.",
      supportingPoints: [
        "Detect repeated technique issues.",
        "Review each movement phase.",
        "Compare executions and assess improvements.",
      ],
      sections: [
        {
          title: "Technique analysis needs context",
          body:
            "A useful app should show how movement changes over time and where issues keep repeating.",
          bullets: [
            "Phase-based review.",
            "Visual context for posture.",
            "Comparisons across reps.",
          ],
        },
        {
          title: "CoachAI connects technique with performance",
          body:
            "Technical analysis is tied to training history, personal records, and planning.",
          bullets: [
            "Technique linked to athlete history.",
            "Technical progress tracking.",
            "A clearer picture of what is working.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI exercise technique analysis interface"),
      faqItems: [
        {
          question: "Can CoachAI help improve exercise technique?",
          answer:
            "Yes. The app focuses on reviewing execution, posture, movement phases, and technical changes using video.",
        },
        {
          question: "Does it work for gym exercises and sports technique?",
          answer:
            "Yes. It is designed for exercise and sports contexts where video helps interpret movement quality.",
        },
        {
          question: "Is technique connected to my progress history?",
          answer:
            "Yes. CoachAI links technical review with progress tracking and personal records.",
        },
      ],
      relatedPages: ["video-analysis", "training-tracking", "personal-records", "faq", "access"],
      finalCtaTitle: "Review technique with more clarity and evidence",
      finalCtaDescription:
        "Open CoachAI to analyze exercises on video and connect technique feedback with measurable progress.",
      footerSummary:
        "CoachAI helps athletes review exercise technique and track technical improvement with context.",
    }),
    eu: entry("technique-analysis", "eu", {
      path: "/eu/ariketa-teknika-analisi-aplikazioa",
      shortTitle: "Teknika analisia",
      metaTitle: withSuffix("Ariketen teknika aztertzeko appa"),
      metaDescription:
        "CoachAIk ariketen teknika bideo eta IArekin aztertzen laguntzen du akats errepikatuak detektatzeko eta bilakaera teknikoa ikusteko.",
      eyebrow: "Ariketen teknika aztertzeko appa",
      h1: "Ariketen teknika aztertzeko appa bideoarekin eta IArekin",
      intro:
        "CoachAI ariketen eta kirol keinuaren teknika berrikusteko dago prestatuta, froga bisualarekin eta testuinguru teknikoarekin.",
      supportingPoints: [
        "Akats errepikatuak identifikatzen laguntzen du.",
        "Mugimenduaren faseei testuingurua ematen die.",
        "Exekuzioak konparatzeko balio du.",
      ],
      sections: [
        {
          title: "Teknika aztertzeko testuingurua behar da",
          body:
            "Aplikazio erabilgarri batek mugimendua nola aldatzen den eta non errepikatzen diren akatsak ulertzen lagundu behar du.",
          bullets: [
            "Fasez faseko berrikuspena.",
            "Postura eta teknikaren testuingurua.",
            "Errepikapenen arteko konparazioa.",
          ],
        },
        {
          title: "CoachAIk teknika eta errendimendua lotzen ditu",
          body:
            "Analisi teknikoa entrenamendu historiari, marka pertsonalei eta plangintzari lotzen zaio.",
          bullets: [
            "Teknika historiara lotuta.",
            "Bilakaera teknikoaren jarraipena.",
            "Funtzionatzen duenaren ikuspegi argiagoa.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI ariketen teknika analisi interfazea"),
      faqItems: [
        {
          question: "CoachAIk ariketen teknika hobetzen laguntzen du?",
          answer:
            "Bai. Appak exekuzioa, postura eta aldaketa teknikoak berrikustera bideratuta dago.",
        },
        {
          question: "Gimnasioko ariketetan eta kirol teknikan balio du?",
          answer:
            "Bai. Bideoak mugimenduaren kalitatea argiago irakurtzen laguntzen duen testuinguruetarako pentsatuta dago.",
        },
        {
          question: "Teknika nire aurrerapenarekin lotuta geratzen da?",
          answer:
            "Bai. CoachAIk analisi teknikoa zure bilakaerarekin eta marka pertsonalekin lotzen du.",
        },
      ],
      relatedPages: ["video-analysis", "training-tracking", "personal-records", "faq", "access"],
      finalCtaTitle: "Berrikusi zure teknika argitasun gehiagorekin",
      finalCtaDescription:
        "Ireki CoachAI ariketak bideoan aztertzeko eta feedback teknikoa aurrerapen errealarekin lotzeko.",
      footerSummary:
        "CoachAIk ariketen teknika aztertzen eta hobekuntza teknikoa jarraitzen laguntzen du.",
    }),
  },
});

Object.assign(pageMap, {
  "training-tracking": {
    es: entry("training-tracking", "es", {
      path: "/es/seguimiento-entrenamientos",
      shortTitle: "Seguimiento de entrenamientos",
      metaTitle: withSuffix("App seguimiento de entrenamientos"),
      metaDescription:
        "CoachAI funciona como app de seguimiento de entrenamientos para centralizar sesiones, vídeos, técnica, planes y métricas en un solo lugar.",
      eyebrow: "App seguimiento de entrenamientos",
      h1: "App seguimiento de entrenamientos con contexto técnico y de progreso",
      intro:
        "CoachAI organiza sesiones, vídeos, planes y referencias para que el seguimiento del entrenamiento sea útil y entendible.",
      supportingPoints: [
        "Agrupa vídeos, marcas, sesiones y planes.",
        "Hace visible la evolución entre entrenamientos.",
        "Relaciona técnica, carga y rendimiento.",
      ],
      sections: [
        {
          title: "Seguimiento real, no solo una lista de entrenos",
          body:
            "Una app útil debe reunir contexto técnico, historial y referencias para explicar por qué mejoras o te estancas.",
          bullets: [
            "Registro de sesiones.",
            "Historial centralizado.",
            "Trabajo técnico conectado al progreso.",
          ],
        },
        {
          title: "CoachAI combina datos y revisión visual",
          body:
            "El producto une registros, vídeos y progreso técnico para que el seguimiento no quede separado de la ejecución.",
          bullets: [
            "Vídeos asociados a la evolución.",
            "Planes y registros en la misma cuenta.",
            "Visión clara para atletas y coaches.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI seguimiento de entrenamientos"),
      faqItems: [
        {
          question: "¿CoachAI sirve como app para seguir entrenamientos?",
          answer:
            "Sí. Centraliza sesiones, vídeos, planes y métricas con contexto técnico para entender mejor la evolución.",
        },
        {
          question: "¿Puedo ver progreso y técnica en la misma app?",
          answer:
            "Sí. El seguimiento integra registros de entrenamiento, análisis de vídeo y cambios técnicos.",
        },
        {
          question: "¿Es útil para atletas y entrenadores?",
          answer:
            "Sí. La estructura está pensada para revisar evolución con más contexto y menos datos dispersos.",
        },
      ],
      relatedPages: ["progress-tracking", "video-analysis", "personal-records", "faq", "access"],
      finalCtaTitle: "Centraliza tus entrenamientos con contexto técnico",
      finalCtaDescription:
        "Accede a CoachAI para seguir sesiones, revisar vídeos y entender mejor tu evolución.",
      footerSummary:
        "CoachAI centraliza seguimiento de entrenamientos, vídeos y progreso técnico en un solo producto.",
    }),
    en: entry("training-tracking", "en", {
      path: "/en/training-tracking-app",
      shortTitle: "Training tracking",
      metaTitle: withSuffix("Training tracking app"),
      metaDescription:
        "CoachAI works as a training tracking app to centralize sessions, videos, technique review, plans, and metrics in one workspace.",
      eyebrow: "Training tracking app",
      h1: "Training tracking app with technical and progress context",
      intro:
        "CoachAI organizes sessions, videos, plans, and records so workout tracking becomes useful instead of fragmented.",
      supportingPoints: [
        "Group videos, records, sessions, and plans.",
        "Make progress visible across training blocks.",
        "Connect technique, workload, and results.",
      ],
      sections: [
        {
          title: "Real training tracking, not just a log",
          body:
            "A useful product should combine technical context, training history, and reference points to explain why progress changes.",
          bullets: [
            "Session logging.",
            "Centralized history.",
            "Technical work tied to progress.",
          ],
        },
        {
          title: "CoachAI combines data with visual review",
          body:
            "The product connects workout records, videos, and technical feedback so tracking is not separated from execution quality.",
          bullets: [
            "Videos tied to progress.",
            "Plans and records in one account.",
            "Clearer visibility for athletes and coaches.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI training tracking app"),
      faqItems: [
        {
          question: "Can CoachAI work as a training tracking app?",
          answer:
            "Yes. It centralizes sessions, videos, plans, and metrics with technical context.",
        },
        {
          question: "Can I review progress and technique in the same place?",
          answer:
            "Yes. The app combines workout records, video analysis, and technical review.",
        },
        {
          question: "Is it useful for both athletes and coaches?",
          answer:
            "Yes. The product is structured to review progress with more context and less scattered data.",
        },
      ],
      relatedPages: ["progress-tracking", "video-analysis", "personal-records", "faq", "access"],
      finalCtaTitle: "Centralize your training with more context",
      finalCtaDescription:
        "Open CoachAI to track sessions, review videos, and understand progress more clearly.",
      footerSummary:
        "CoachAI centralizes workout tracking, videos, and technical progress in one product.",
    }),
    eu: entry("training-tracking", "eu", {
      path: "/eu/entrenamenduen-jarraipena",
      shortTitle: "Entrenamenduen jarraipena",
      metaTitle: withSuffix("Entrenamenduen jarraipenerako appa"),
      metaDescription:
        "CoachAIk entrenamenduen jarraipenerako app gisa balio du: saioak, bideoak, teknika, planak eta metrikak toki berean biltzen ditu.",
      eyebrow: "Entrenamenduen jarraipenerako appa",
      h1: "Entrenamenduen jarraipenerako appa testuinguru teknikoarekin",
      intro:
        "CoachAIk saioak, bideoak, planak eta erreferentziak antolatzen ditu entrenamenduaren jarraipena erabilgarria izan dadin.",
      supportingPoints: [
        "Bideoak, markak, saioak eta planak bateratzen ditu.",
        "Entrenamenduen arteko bilakaera agerian uzten du.",
        "Teknika, karga eta errendimendua lotzen ditu.",
      ],
      sections: [
        {
          title: "Benetako jarraipena, ez saioen zerrenda hutsa",
          body:
            "Aplikazio erabilgarri batek testuinguru teknikoa, historia eta erreferentziak elkartu behar ditu aurrerapena ulertzeko.",
          bullets: [
            "Saioen erregistroa.",
            "Historia zentralizatua.",
            "Lan teknikoa aurrerapenarekin lotuta.",
          ],
        },
        {
          title: "CoachAIk datuak eta berrikuspen bisuala uztartzen ditu",
          body:
            "Produktua erregistroak, bideoak eta feedback teknikoa lotzeko prestatuta dago.",
          bullets: [
            "Bilakaerari lotutako bideoak.",
            "Planak eta erregistroak kontu berean.",
            "Atleta eta entrenatzaileentzako ikuspegi argiagoa.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI entrenamenduen jarraipena"),
      faqItems: [
        {
          question: "CoachAIk entrenamenduak jarraitzeko balio du?",
          answer:
            "Bai. Saioak, bideoak, planak eta metrikak testuinguru teknikoarekin zentralizatzen ditu.",
        },
        {
          question: "Aurrerapena eta teknika leku berean berrikusi daitezke?",
          answer:
            "Bai. Appak entrenamendu erregistroak, bideo analisia eta berrikuspen teknikoa uztartzen ditu.",
        },
        {
          question: "Atleta eta entrenatzaileentzat erabilgarria da?",
          answer: "Bai. Bilakaera testuinguru gehiagorekin berrikusteko diseinatuta dago.",
        },
      ],
      relatedPages: ["progress-tracking", "video-analysis", "personal-records", "faq", "access"],
      finalCtaTitle: "Zentralizatu zure entrenamenduak testuinguru teknikoarekin",
      finalCtaDescription:
        "Ireki CoachAI saioak jarraitzeko, bideoak berrikusteko eta bilakaera hobeto ulertzeko.",
      footerSummary:
        "CoachAIk entrenamenduen jarraipena, bideoak eta aurrerapen teknikoa produktu berean zentralizatzen ditu.",
    }),
  },
  "personal-records": {
    es: entry("personal-records", "es", {
      path: "/es/registrar-marcas-personales",
      shortTitle: "Marcas personales",
      metaTitle: withSuffix("App para registrar marcas personales"),
      metaDescription:
        "CoachAI ayuda a registrar marcas personales y relacionarlas con técnica, vídeos y evolución del entrenamiento en la misma aplicación.",
      eyebrow: "App para registrar marcas personales",
      h1: "App para registrar marcas personales con contexto técnico",
      intro:
        "CoachAI permite registrar PRs y entender cómo se relacionan con la técnica, el vídeo y la progresión del entrenamiento.",
      supportingPoints: [
        "Guarda mejores marcas y referencias.",
        "Relaciona cada registro con sesiones y vídeos.",
        "Da contexto a la evolución deportiva.",
      ],
      sections: [
        {
          title: "Registrar marcas es más útil con contexto",
          body:
            "Una marca personal aislada dice poco si no se conecta con el momento técnico, la carga y la evolución previa.",
          bullets: [
            "Historial de PRs.",
            "Relación con sesiones y bloque de trabajo.",
            "Lectura más útil del rendimiento.",
          ],
        },
        {
          title: "CoachAI integra marcas, técnica y seguimiento",
          body:
            "La app vincula registros de rendimiento con análisis técnico y progreso acumulado.",
          bullets: [
            "Registros ligados a entrenamientos.",
            "Vídeo y técnica asociados.",
            "Visión completa de la mejora.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI registro de marcas personales"),
      faqItems: [
        {
          question: "¿CoachAI sirve para registrar marcas personales?",
          answer:
            "Sí. Puedes llevar PRs y referencias de rendimiento dentro de la misma app que usas para vídeo y progreso.",
        },
        {
          question: "¿Las marcas se relacionan con mis entrenamientos?",
          answer:
            "Sí. La idea es que cada marca tenga contexto de sesiones, vídeo y evolución técnica.",
        },
        {
          question: "¿Es útil para deportes y gimnasio?",
          answer:
            "Sí. Está planteada para contextos donde las mejores marcas ayudan a medir evolución deportiva.",
        },
      ],
      relatedPages: ["training-tracking", "progress-tracking", "video-analysis", "faq", "access"],
      finalCtaTitle: "Registra tus mejores marcas con más contexto",
      finalCtaDescription:
        "Accede a CoachAI para guardar PRs, revisar técnica y entender tu evolución en conjunto.",
      footerSummary:
        "CoachAI ayuda a registrar marcas personales y conectarlas con técnica, vídeo y progreso.",
    }),
    en: entry("personal-records", "en", {
      path: "/en/personal-records-tracker",
      shortTitle: "Personal records",
      metaTitle: withSuffix("Personal records tracker app"),
      metaDescription:
        "CoachAI helps athletes log personal records and connect them with technique review, videos, and training progress in one product.",
      eyebrow: "Personal records tracker",
      h1: "Personal records tracker with technical context",
      intro:
        "CoachAI lets athletes log PRs and understand how results connect with technique, video review, and training progression.",
      supportingPoints: [
        "Save best marks and reference results.",
        "Connect each record with sessions and videos.",
        "Add context to athletic progress.",
      ],
      sections: [
        {
          title: "Records are more useful with context",
          body:
            "A personal best means more when it is tied to technique, workload, and the progression that led to it.",
          bullets: [
            "PR history.",
            "Links to sessions and training blocks.",
            "Clearer performance interpretation.",
          ],
        },
        {
          title: "CoachAI connects records, technique, and tracking",
          body:
            "The app links performance records with technical review and accumulated progress.",
          bullets: [
            "Records linked to workouts.",
            "Associated video and technique notes.",
            "A fuller picture of improvement.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI personal records tracker"),
      faqItems: [
        {
          question: "Can CoachAI track personal records?",
          answer:
            "Yes. You can log PRs and performance references inside the same app used for video analysis and progress tracking.",
        },
        {
          question: "Are records connected to my training history?",
          answer:
            "Yes. Each record can be understood together with sessions, video review, and technical evolution.",
        },
        {
          question: "Is it useful for sports and gym contexts?",
          answer:
            "Yes. It is designed for performance contexts where personal records help measure progress.",
        },
      ],
      relatedPages: ["training-tracking", "progress-tracking", "video-analysis", "faq", "access"],
      finalCtaTitle: "Track your best marks with more context",
      finalCtaDescription:
        "Open CoachAI to log PRs, review technique, and understand progress as a whole.",
      footerSummary:
        "CoachAI helps athletes log personal records and connect them with technique, video, and progress.",
    }),
    eu: entry("personal-records", "eu", {
      path: "/eu/marka-pertsonalak-erregistratu",
      shortTitle: "Marka pertsonalak",
      metaTitle: withSuffix("Marka pertsonalak erregistratzeko appa"),
      metaDescription:
        "CoachAIk marka pertsonalak erregistratzen laguntzen du eta teknika, bideoak eta entrenamendu bilakaerarekin lotzen ditu produktu berean.",
      eyebrow: "Marka pertsonalak erregistratzeko appa",
      h1: "Marka pertsonalak erregistratzeko appa testuinguru teknikoarekin",
      intro:
        "CoachAIk PRak erregistratzeko eta emaitzak teknikarekin, bideoarekin eta entrenamenduaren bilakaerarekin lotzeko aukera ematen du.",
      supportingPoints: [
        "Gorde marka onenak eta erreferentziak.",
        "Lotu erregistro bakoitza saio eta bideoekin.",
        "Bilakaera atletikoari testuingurua eman.",
      ],
      sections: [
        {
          title: "Marka pertsonalak testuinguruarekin baliagarriagoak dira",
          body:
            "Marka pertsonal batek gehiago balio du teknika, karga eta aurreko progresioarekin lotzen denean.",
          bullets: [
            "PRen historia.",
            "Saioekin eta blokeekin lotura.",
            "Errendimenduaren irakurketa argiagoa.",
          ],
        },
        {
          title: "CoachAIk markak, teknika eta jarraipena konektatzen ditu",
          body:
            "Appak errendimendu erregistroak berrikuspen teknikoarekin eta aurrerapen metatuarekin uztartzen ditu.",
          bullets: [
            "Entrenamenduei lotutako erregistroak.",
            "Bideo eta teknika oharrak.",
            "Hobekuntzaren ikuspegi osoagoa.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI marka pertsonalen erregistroa"),
      faqItems: [
        {
          question: "CoachAIk marka pertsonalak jarraitzeko balio du?",
          answer:
            "Bai. PRak eta errendimendu erreferentziak app berean eraman ditzakezu, bideo analisia eta aurrerapenarekin batera.",
        },
        {
          question: "Markak nire entrenamenduekin lotzen dira?",
          answer:
            "Bai. Erregistro bakoitza saioekin, bideo berrikuspenarekin eta bilakaera teknikoarekin ulertu daiteke.",
        },
        {
          question: "Kirol eta gimnasio testuinguruetarako erabilgarria da?",
          answer:
            "Bai. Marka pertsonalek kirol bilakaera neurtzen laguntzen duten testuinguruetarako diseinatuta dago.",
        },
      ],
      relatedPages: ["training-tracking", "progress-tracking", "video-analysis", "faq", "access"],
      finalCtaTitle: "Erregistratu zure marka onenak testuinguru gehiagorekin",
      finalCtaDescription:
        "Ireki CoachAI PRak gordetzeko, teknika berrikusteko eta bilakaera modu osoagoan ulertzeko.",
      footerSummary:
        "CoachAIk marka pertsonalak erregistratzen eta teknika, bideo eta aurrerapenarekin lotzen laguntzen du.",
    }),
  },
});

Object.assign(pageMap, {
  "progress-tracking": {
    es: entry("progress-tracking", "es", {
      path: "/es/progreso-entrenamiento",
      shortTitle: "Progreso de entrenamiento",
      metaTitle: withSuffix("App para seguir progreso de entrenamiento"),
      metaDescription:
        "CoachAI ayuda a seguir progreso de entrenamiento con vídeos, técnica, marcas personales y contexto histórico en la misma app.",
      eyebrow: "App para seguir progreso de entrenamiento",
      h1: "App para seguir progreso de entrenamiento con vídeo, técnica y marcas",
      intro:
        "CoachAI muestra la evolución del usuario uniendo análisis de vídeo, trabajo técnico, sesiones y mejores marcas.",
      supportingPoints: [
        "Visualiza la evolución entre sesiones.",
        "Relaciona técnica y rendimiento.",
        "Centraliza progreso, PRs y vídeo.",
      ],
      sections: [
        {
          title: "El progreso se entiende mejor con más señales",
          body:
            "El seguimiento es más útil cuando reúne observaciones técnicas, métricas y contexto de entrenamiento.",
          bullets: [
            "Evolución por bloques y sesiones.",
            "Relación entre vídeo y rendimiento.",
            "Lectura clara de cambios reales.",
          ],
        },
        {
          title: "CoachAI deja preparada una visión longitudinal",
          body:
            "La app organiza el historial para que puedas detectar tendencias, mejoras y estancamientos.",
          bullets: [
            "Progreso técnico acumulado.",
            "Registros y marcas relacionados.",
            "Más claridad para decidir próximos pasos.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI progreso de entrenamiento"),
      faqItems: [
        {
          question: "¿CoachAI sirve para seguir progreso de entrenamiento?",
          answer:
            "Sí. Integra vídeo, técnica, registros y sesiones para dar una visión más completa de la evolución.",
        },
        {
          question: "¿Puedo ver si mi técnica mejora con el tiempo?",
          answer:
            "Sí. La propuesta del producto es conectar revisión técnica con seguimiento del progreso.",
        },
        {
          question: "¿También incluye marcas personales?",
          answer:
            "Sí. Las mejores marcas forman parte del contexto para interpretar cómo evoluciona el rendimiento.",
        },
      ],
      relatedPages: ["training-tracking", "personal-records", "video-analysis", "faq", "access"],
      finalCtaTitle: "Sigue tu progreso con más contexto técnico",
      finalCtaDescription:
        "Entra en CoachAI para unir vídeo, marcas personales y evolución del entrenamiento.",
      footerSummary:
        "CoachAI ayuda a seguir progreso de entrenamiento uniendo vídeo, técnica y rendimiento.",
    }),
    en: entry("progress-tracking", "en", {
      path: "/en/workout-progress-tracker",
      shortTitle: "Progress tracking",
      metaTitle: withSuffix("Workout progress tracker app"),
      metaDescription:
        "CoachAI helps athletes track workout progress with video review, technique feedback, personal records, and training history in one app.",
      eyebrow: "Workout progress tracker",
      h1: "Workout progress tracker with video, technique, and records",
      intro:
        "CoachAI shows athletic progress by linking video analysis, technical work, training sessions, and best results.",
      supportingPoints: [
        "See changes across training sessions.",
        "Connect technique with performance.",
        "Centralize progress, PRs, and video review.",
      ],
      sections: [
        {
          title: "Progress makes sense when more signals are connected",
          body:
            "Tracking becomes more useful when technical observations, metrics, and training context live together.",
          bullets: [
            "Session and block-level progress.",
            "Video linked to performance.",
            "Clearer view of real changes.",
          ],
        },
        {
          title: "CoachAI supports a longitudinal view",
          body:
            "The app organizes history so athletes and coaches can spot trends, improvements, and plateaus.",
          bullets: [
            "Accumulated technical progress.",
            "Records tied to training history.",
            "More clarity for next decisions.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI workout progress tracker"),
      faqItems: [
        {
          question: "Can CoachAI track workout progress?",
          answer:
            "Yes. It combines video review, technique feedback, session tracking, and records in one place.",
        },
        {
          question: "Can I see whether my technique improves over time?",
          answer:
            "Yes. The product is designed to connect technical review with training progress.",
        },
        {
          question: "Does it also include personal records?",
          answer:
            "Yes. Best marks are part of the context used to interpret how performance evolves.",
        },
      ],
      relatedPages: ["training-tracking", "personal-records", "video-analysis", "faq", "access"],
      finalCtaTitle: "Track your progress with more technical context",
      finalCtaDescription:
        "Open CoachAI to connect video, personal records, and training progress in one product.",
      footerSummary:
        "CoachAI helps athletes track workout progress by connecting video, technique, and performance.",
    }),
    eu: entry("progress-tracking", "eu", {
      path: "/eu/entrenamendu-aurrerapena",
      shortTitle: "Aurrerapena",
      metaTitle: withSuffix("Entrenamendu aurrerapena jarraitzeko appa"),
      metaDescription:
        "CoachAIk entrenamenduaren aurrerapena jarraitzen laguntzen du bideo berrikuspena, teknika, marka pertsonalak eta historia produktu berean lotuz.",
      eyebrow: "Entrenamendu aurrerapena jarraitzeko appa",
      h1: "Entrenamendu aurrerapena jarraitzeko appa bideo, teknika eta markekin",
      intro:
        "CoachAIk erabiltzailearen bilakaera erakusten du bideo analisia, lan teknikoa, saioak eta marka onenak uztartuta.",
      supportingPoints: [
        "Saioen arteko aldaketak ikusi.",
        "Teknika eta errendimendua lotu.",
        "Aurrerapena, PRak eta bideoa zentralizatu.",
      ],
      sections: [
        {
          title: "Aurrerapena hobeto ulertzen da seinale gehiago lotzen direnean",
          body:
            "Jarraipena baliagarriagoa da behaketa teknikoak, metrikak eta entrenamendu testuingurua batera daudenean.",
          bullets: [
            "Saio eta blokeka bilakaera.",
            "Bideoa errendimenduarekin lotuta.",
            "Benetako aldaketen ikuspegi argiagoa.",
          ],
        },
        {
          title: "CoachAIk ikuspegi longitudinala prestatzen du",
          body:
            "Appak historia antolatzen du joerak, hobekuntzak eta geldialdiak detektatzeko.",
          bullets: [
            "Bilakaera tekniko metatua.",
            "Historiari lotutako markak.",
            "Hurrengo erabakiak argiago hartzeko laguntza.",
          ],
        },
      ],
      heroMedia: imageHero("CoachAI entrenamendu aurrerapena"),
      faqItems: [
        {
          question: "CoachAIk entrenamenduaren aurrerapena jarraitzeko balio du?",
          answer:
            "Bai. Bideo berrikuspena, feedback teknikoa, saioen jarraipena eta markak leku berean uztartzen ditu.",
        },
        {
          question: "Nire teknika denborarekin hobetzen den ikus dezaket?",
          answer:
            "Bai. Produktua berrikuspen teknikoa eta entrenamendu aurrerapena lotzeko diseinatuta dago.",
        },
        {
          question: "Marka pertsonalak ere sartzen dira?",
          answer:
            "Bai. Marka onenak errendimenduaren bilakaera interpretatzeko testuinguruaren parte dira.",
        },
      ],
      relatedPages: ["training-tracking", "personal-records", "video-analysis", "faq", "access"],
      finalCtaTitle: "Jarraitu zure aurrerapena testuinguru tekniko gehiagorekin",
      finalCtaDescription:
        "Ireki CoachAI bideoa, marka pertsonalak eta entrenamendu bilakaera produktu berean lotzeko.",
      footerSummary:
        "CoachAIk entrenamenduaren aurrerapena jarraitzen laguntzen du bideoa, teknika eta errendimendua lotuz.",
    }),
  },
  faq: {
    es: entry("faq", "es", {
      path: "/es/faq",
      shortTitle: "FAQ",
      metaTitle: withSuffix("Preguntas frecuentes sobre CoachAI"),
      metaDescription:
        "Preguntas frecuentes de CoachAI sobre análisis de vídeo deportivo con IA, técnica, progreso, marcas personales e indexación de la zona privada.",
      eyebrow: "Preguntas frecuentes",
      h1: "Preguntas frecuentes sobre CoachAI",
      intro:
        "Esta página pública responde las dudas más comunes sobre qué hace CoachAI, qué parte es indexable y cómo se usa el producto.",
      supportingPoints: [
        "Aclara la propuesta de valor del producto.",
        "Explica la separación entre público y privado.",
        "Responde dudas antes del registro.",
      ],
      sections: [
        {
          title: "Qué hace CoachAI",
          body:
            "CoachAI reúne análisis de vídeo, revisión técnica, seguimiento del entrenamiento y marcas personales en una sola herramienta.",
        },
        {
          title: "Qué parte es pública y qué parte es privada",
          body:
            "Las landings públicas describen el producto y la experiencia autenticada se mantiene fuera del índice y del sitemap.",
        },
      ],
      heroMedia: imageHero("Preguntas frecuentes sobre CoachAI"),
      faqItems: [
        {
          question: "¿CoachAI es una app de entrenamiento con IA?",
          answer:
            "Sí. La propuesta del producto combina análisis de vídeo deportivo con IA, revisión técnica, seguimiento de entrenamientos y registro de marcas personales.",
        },
        {
          question: "¿La zona privada aparece en Google?",
          answer:
            "No. La infraestructura SEO deja indexable solo la capa pública y excluye login, dashboard, callbacks y áreas autenticadas.",
        },
        {
          question: "¿CoachAI analiza técnica de ejercicios?",
          answer:
            "Sí. La app está orientada a revisar ejecución y patrones técnicos a partir de vídeo.",
        },
        {
          question: "¿También ayuda a seguir progreso de entrenamiento?",
          answer:
            "Sí. El producto centraliza sesiones, vídeo, técnica y marcas para entender mejor la evolución.",
        },
        {
          question: "¿CoachAI registra marcas personales?",
          answer:
            "Sí. Las mejores marcas se integran como parte del seguimiento del rendimiento.",
        },
        {
          question: "¿Puedo acceder o crear cuenta desde la web pública?",
          answer:
            "Sí. La página de acceso enlaza al flujo de login y registro sin exponer la experiencia privada a indexación accidental.",
        },
      ],
      relatedPages: ["home", "video-analysis", "training-tracking", "access"],
      finalCtaTitle: "Pasa de las dudas al uso real",
      finalCtaDescription:
        "Accede a CoachAI para ver cómo se conectan vídeo, técnica, marcas y progreso en un solo producto.",
      footerSummary:
        "FAQ pública de CoachAI para explicar el producto, su capa indexable y la separación del área privada.",
    }),
    en: entry("faq", "en", {
      path: "/en/faq",
      shortTitle: "FAQ",
      metaTitle: withSuffix("CoachAI frequently asked questions"),
      metaDescription:
        "CoachAI FAQ about AI sports video analysis, exercise technique review, progress tracking, personal records, and private-area indexation rules.",
      eyebrow: "Frequently asked questions",
      h1: "Frequently asked questions about CoachAI",
      intro:
        "This public page answers common questions about what CoachAI does, what is indexable, and how the product is structured.",
      supportingPoints: [
        "Clarifies the product value proposition.",
        "Explains the public versus private split.",
        "Answers key questions before signup.",
      ],
      sections: [
        {
          title: "What CoachAI does",
          body:
            "CoachAI brings together video analysis, technical review, workout tracking, and personal records in one tool.",
        },
        {
          title: "What is public and what is private",
          body:
            "Public landing pages describe the product while the authenticated workspace stays outside the index and sitemap.",
        },
      ],
      heroMedia: imageHero("CoachAI frequently asked questions"),
      faqItems: [
        {
          question: "Is CoachAI an AI training app?",
          answer:
            "Yes. The product combines AI sports video analysis, technical review, workout tracking, and personal records logging.",
        },
        {
          question: "Does the private workspace appear in Google?",
          answer:
            "No. The SEO setup keeps only the public layer indexable and excludes login, dashboard, callbacks, and authenticated areas.",
        },
        {
          question: "Can CoachAI review exercise technique?",
          answer:
            "Yes. The app is designed to review execution and technical patterns from video.",
        },
        {
          question: "Does it also help track training progress?",
          answer:
            "Yes. The product centralizes sessions, video, technique, and records to make progress easier to understand.",
        },
        {
          question: "Can it log personal records?",
          answer: "Yes. Best marks are part of the product's performance tracking model.",
        },
        {
          question: "Can I sign in or create an account from the public site?",
          answer:
            "Yes. The access page links to the login and signup flow without exposing private screens to accidental indexing.",
        },
      ],
      relatedPages: ["home", "video-analysis", "training-tracking", "access"],
      finalCtaTitle: "Move from questions to actual use",
      finalCtaDescription:
        "Open CoachAI to see how video, technique, records, and progress work together in one product.",
      footerSummary:
        "Public CoachAI FAQ that explains the product, its crawlable layer, and the separation from the private area.",
    }),
    eu: entry("faq", "eu", {
      path: "/eu/ohiko-galderak",
      shortTitle: "FAQ",
      metaTitle: withSuffix("CoachAI-ri buruzko ohiko galderak"),
      metaDescription:
        "CoachAI-ren ohiko galderak: IA bidezko kirol bideo analisia, ariketen teknika, aurrerapenaren jarraipena, marka pertsonalak eta eremu pribatuaren indexazioa.",
      eyebrow: "Ohiko galderak",
      h1: "CoachAI-ri buruzko ohiko galderak",
      intro:
        "Orri publiko honek CoachAI-k zer egiten duen, zer den indexagarria eta nola dagoen egituratuta azaltzen du.",
      supportingPoints: [
        "Produktuaren balioa argitzen du.",
        "Publikoaren eta pribatuaren arteko banaketa azaltzen du.",
        "Erregistro aurreko zalantza nagusiak erantzuten ditu.",
      ],
      sections: [
        {
          title: "Zer egiten du CoachAIk",
          body:
            "CoachAIk bideo analisia, berrikuspen teknikoa, entrenamendu jarraipena eta marka pertsonalak tresna berean biltzen ditu.",
        },
        {
          title: "Zer da publikoa eta zer da pribatua",
          body:
            "Landing publikoek produktua azaltzen dute eta eremu autentifikatua indizetik eta sitemap-etik kanpo mantentzen da.",
        },
      ],
      heroMedia: imageHero("CoachAI-ren ohiko galderak"),
      faqItems: [
        {
          question: "CoachAI entrenamendurako IA app bat da?",
          answer:
            "Bai. Produktuak IA bidezko kirol bideo analisia, berrikuspen teknikoa, entrenamendu jarraipena eta marka pertsonalen erregistroa uztartzen ditu.",
        },
        {
          question: "Eremu pribatua Google-n agertzen da?",
          answer:
            "Ez. SEO konfigurazioak geruza publikoa soilik indexagarri uzten du, eta login, dashboard, callback eta eremu autentifikatuak kanpo uzten ditu.",
        },
        {
          question: "CoachAIk ariketen teknika berrikusi dezake?",
          answer:
            "Bai. Appa exekuzioa eta eredu teknikoak bideotik berrikusteko diseinatuta dago.",
        },
        {
          question: "Entrenamenduaren aurrerapena jarraitzeko ere balio du?",
          answer:
            "Bai. Produktuak saioak, bideoa, teknika eta markak zentralizatzen ditu bilakaera hobeto ulertzeko.",
        },
        {
          question: "Marka pertsonalak ere erregistratzen ditu?",
          answer: "Bai. Marka onenak errendimenduaren jarraipenaren parte dira.",
        },
        {
          question: "Web publikoan saioa hasi edo kontua sortu daiteke?",
          answer:
            "Bai. Sarbide orriak login eta erregistro fluxura eramaten du, pantaila pribatuak nahigabeko indexaziotik kanpo utzita.",
        },
      ],
      relatedPages: ["home", "video-analysis", "training-tracking", "access"],
      finalCtaTitle: "Pasa zaitez galderetatik erabilera errealera",
      finalCtaDescription:
        "Ireki CoachAI bideoa, teknika, markak eta aurrerapena nola lotzen diren ikusteko.",
      footerSummary:
        "CoachAI-ren FAQ publikoa, produktua, geruza indexagarria eta eremu pribatuaren bereizketa azaltzeko.",
    }),
  },
});

Object.assign(pageMap, {
  access: {
    es: entry("access", "es", {
      path: "/es/acceso",
      shortTitle: "Acceso",
      metaTitle: withSuffix("Acceso, registro y contacto CoachAI"),
      metaDescription:
        "Página pública de acceso de CoachAI para entrar en la app, crear cuenta y dejar preparada la capa de contacto sin exponer el área privada.",
      eyebrow: "Acceso, registro y contacto",
      h1: "Acceso y registro en CoachAI sin exponer la zona privada",
      intro:
        "Esta página concentra el acceso público a CoachAI y deja preparado el punto de contacto, manteniendo la experiencia autenticada fuera del índice.",
      supportingPoints: [
        "Entrada segura a la app privada.",
        "Registro orientado a vídeo, marcas y progreso.",
        "Punto de contacto preparado sin datos falsos.",
      ],
      sections: [
        { title: "Accede a la app privada", body: localeConfig.es.accessLoginHint },
        { title: "Crea tu cuenta", body: localeConfig.es.accessRegisterHint },
        {
          title: "Contacto y soporte",
          body: localeConfig.es.accessContactHint,
          bullets: [localeConfig.es.accessSupportIntro, localeConfig.es.accessSupportFallback],
        },
      ],
      heroMedia: imageHero("Acceso público a CoachAI"),
      faqItems: [
        {
          question: "¿Desde aquí puedo entrar en CoachAI?",
          answer:
            "Sí. Esta página enlaza al acceso principal de la app y sirve como capa pública para login y registro.",
        },
        {
          question: "¿La zona autenticada se indexa?",
          answer:
            "No. La estrategia mantiene la parte privada fuera del sitemap y evita exponer pantallas de usuario a Google.",
        },
      ],
      relatedPages: ["home", "faq", "video-analysis", "training-tracking"],
      finalCtaTitle: "Accede a CoachAI",
      finalCtaDescription:
        "Entra en la app para analizar vídeos, seguir entrenamientos y registrar tus mejores marcas.",
      footerSummary:
        "Página pública de acceso y registro de CoachAI, separada de la zona privada autenticada.",
    }),
    en: entry("access", "en", {
      path: "/en/access",
      shortTitle: "Access",
      metaTitle: withSuffix("CoachAI access, signup, and contact"),
      metaDescription:
        "Public CoachAI access page to open the app, create an account, and keep the contact layer ready without exposing the private workspace.",
      eyebrow: "Access, signup, and contact",
      h1: "CoachAI access and signup without exposing the private workspace",
      intro:
        "This page centralizes public access to CoachAI and keeps the support layer ready while the authenticated workspace remains outside the index.",
      supportingPoints: [
        "Secure entry into the private app.",
        "Signup flow focused on videos, records, and progress.",
        "Contact layer prepared without publishing false details.",
      ],
      sections: [
        { title: "Open the private app", body: localeConfig.en.accessLoginHint },
        { title: "Create your account", body: localeConfig.en.accessRegisterHint },
        {
          title: "Contact and support",
          body: localeConfig.en.accessContactHint,
          bullets: [localeConfig.en.accessSupportIntro, localeConfig.en.accessSupportFallback],
        },
      ],
      heroMedia: imageHero("Public access to CoachAI"),
      faqItems: [
        {
          question: "Can I sign in to CoachAI from here?",
          answer:
            "Yes. This page links to the main app access flow and works as the public entry layer.",
        },
        {
          question: "Is the authenticated area indexed?",
          answer:
            "No. The setup keeps the private workspace outside the sitemap and avoids exposing user screens.",
        },
      ],
      relatedPages: ["home", "faq", "video-analysis", "training-tracking"],
      finalCtaTitle: "Open CoachAI",
      finalCtaDescription:
        "Enter the app to analyze videos, track workouts, and log your personal records.",
      footerSummary:
        "Public CoachAI access and signup page, separated from the authenticated private workspace.",
    }),
    eu: entry("access", "eu", {
      path: "/eu/sarbidea",
      shortTitle: "Sarbidea",
      metaTitle: withSuffix("CoachAI sarbidea, erregistroa eta kontaktua"),
      metaDescription:
        "CoachAI-ren sarbide orri publikoa appa ireki, kontua sortu eta kontaktu geruza prest uzteko, eremu pribatua indexatu gabe.",
      eyebrow: "Sarbidea, erregistroa eta kontaktua",
      h1: "CoachAI-rako sarbidea eta erregistroa eremu pribatua agerian utzi gabe",
      intro:
        "Orri honek CoachAI-rako sarbide publikoa zentralizatzen du eta kontaktu geruza prestatuta uzten du, esperientzia autentifikatua indizetik kanpo mantenduz.",
      supportingPoints: [
        "App pribatura sartzeko bide segurua.",
        "Bideoak, markak eta aurrerapena lantzeko erregistroa.",
        "Datu faltsurik gabe prestatutako kontaktu geruza.",
      ],
      sections: [
        { title: "Ireki app pribatua", body: localeConfig.eu.accessLoginHint },
        { title: "Sortu zure kontua", body: localeConfig.eu.accessRegisterHint },
        {
          title: "Kontaktua eta laguntza",
          body: localeConfig.eu.accessContactHint,
          bullets: [localeConfig.eu.accessSupportIntro, localeConfig.eu.accessSupportFallback],
        },
      ],
      heroMedia: imageHero("CoachAI sarbide publikoa"),
      faqItems: [
        {
          question: "Hemendik sartu naiteke CoachAI-ra?",
          answer:
            "Bai. Orri honek apparen sarbide nagusira eramaten du eta geruza publikoa da.",
        },
        {
          question: "Zona autentifikatua indexatzen da?",
          answer: "Ez. Konfigurazioak eremu pribatua sitemap-etik kanpo uzten du.",
        },
      ],
      relatedPages: ["home", "faq", "video-analysis", "training-tracking"],
      finalCtaTitle: "Ireki CoachAI",
      finalCtaDescription:
        "Sartu appan bideoak aztertzeko, entrenamenduak jarraitzeko eta marka pertsonalak erregistratzeko.",
      footerSummary:
        "CoachAI-ren sarbide eta erregistro orri publikoa, eremu pribatu autentifikatutik bereizia.",
    }),
  },
});

export const publicPageIds = Object.keys(pageMap) as PublicPageId[];

export function getPageContent(pageId: PublicPageId, locale: SeoLocale): PublicPageContent {
  return pageMap[pageId][locale];
}

export function getAlternates(pageId: PublicPageId) {
  return {
    es: pageMap[pageId].es.path,
    en: pageMap[pageId].en.path,
    eu: pageMap[pageId].eu.path,
    "x-default": pageMap[pageId].es.path,
  } as const;
}

export function getAllPages(): PublicPageContent[] {
  return publicPageIds.flatMap((pageId) =>
    (Object.keys(localeConfig) as SeoLocale[]).map((locale) => getPageContent(pageId, locale)),
  );
}

function normalizePublicPath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) || "/" : pathname;
}

export function getPublicPageByPath(pathname: string): PublicPageContent | null {
  const normalizedPath = normalizePublicPath(pathname);

  if (normalizedPath === SPANISH_HOME_ALIAS_PATH) {
    return getPageContent("home", "es");
  }

  return (
    getAllPages().find((page) => normalizePublicPath(page.path) === normalizedPath) || null
  );
}

export function getPublicLanguageByPath(pathname: string): Language | null {
  const page = getPublicPageByPath(pathname);
  return page ? localeConfig[page.locale].appLanguage : null;
}

export function getAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function toSeoLocale(language: Language): SeoLocale {
  if (language === "ing") return "en";
  if (language === "eus") return "eu";
  return "es";
}

export function getLoginHref(_locale: SeoLocale) {
  return "/login";
}

export function getRelatedPages(pageId: PublicPageId, locale: SeoLocale) {
  return getPageContent(pageId, locale).relatedPages.map((relatedId) =>
    getPageContent(relatedId, locale),
  );
}

export function getSupportEmail() {
  const runtimeEnv =
    typeof process !== "undefined" && process.env
      ? process.env
      : ({} as Record<string, string | undefined>);
  return runtimeEnv.VITE_PUBLIC_SUPPORT_EMAIL || runtimeEnv.PUBLIC_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL;
}

export function getVerificationToken() {
  const runtimeEnv =
    typeof process !== "undefined" && process.env
      ? process.env
      : ({} as Record<string, string | undefined>);
  return runtimeEnv.VITE_GOOGLE_SITE_VERIFICATION || runtimeEnv.GOOGLE_SITE_VERIFICATION || "";
}
