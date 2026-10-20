import React, { Suspense, lazy, useEffect, useMemo, useState, useRef } from "react";
import { LandingPage } from "./comps/LandingPage";
import { Login } from "./comps/Login";
import { getPageContent, getPublicLanguageByPath, getPublicPageByPath, toSeoLocale } from "./seo/site";
import {
  Screen,
  VideoFile,
  StrengthRecord,
  ThrowRecord,
  MatchRecord,
  PlanFile,
  User,
  ExerciseDef,
  Language,
  SubscriptionTier,
  UserUsage,
  UserLimits,
  SupplementItem,
  UserData
} from "./types";
import { StorageService, VideoStorage, PlanStorage, FilmstripStorage, db } from "./svcs/storageService";
import { EXTERNAL_RETURN_EVENT, type ExternalReturnPayload, initializeNativeAppShell, isNativeApp } from "./svcs/nativeAppService";
import {
  createMarketingTrialCheckout,
  dismissMarketingTrialOffer,
  getMarketingTrialOffer,
  getSubscriptionTier,
  readCachedSubscriptionTier,
  getUserLimits,
  waitForSubscriptionActive,
  type MarketingTrialOfferState,
} from "./svcs/subscriptionService";
import { VideoIntelligenceService } from "./svcs/videoIntelligenceService";
import { GracePeriodBanner } from "./comps/GracePeriodBanner";
import { Menu, PanelLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import { generateVideoThumbnail, getVideoDurationLabel } from "./utl/videoUtils";

function lazyNamed<T extends React.ComponentType<any>>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string
) {
  return lazy(async () => ({
    default: (await loader())[exportName] as T,
  }));
}

const Onboarding = lazyNamed(() => import("./comps/Onboarding"), "Onboarding");
const MarketingTrialOffer = lazyNamed(() => import("./comps/MarketingTrialOffer"), "MarketingTrialOffer");
const Sidebar = lazyNamed(() => import("./comps/Sidebar"), "Sidebar");
const Dashboard = lazyNamed(() => import("./comps/Dashboard"), "Dashboard");
const Gallery = lazyNamed(() => import("./comps/Gallery"), "Gallery");
const VideoAnalyzer = lazyNamed(() => import("./comps/VideoAnalyzer"), "VideoAnalyzer");
const StrengthTracker = lazyNamed(() => import("./comps/StrengthTracker"), "StrengthTracker");
const JavelinTracker = lazyNamed(() => import("./comps/JavelinTracker"), "JavelinTracker");
const TrainingTracker = lazyNamed(() => import("./comps/TrainingTracker"), "TrainingTracker");
const MatchTracker = lazyNamed(() => import("./comps/MatchTracker"), "MatchTracker");
const PlanGallery = lazyNamed(() => import("./comps/PlanGallery"), "PlanGallery");
const PdfViewer = lazyNamed(() => import("./comps/PdfViewer"), "PdfViewer");
const CoachChat = lazyNamed(() => import("./comps/CoachChat"), "CoachChat");
const PlateCalculator = lazyNamed(() => import("./comps/PlateCalculator"), "PlateCalculator");
const SupplementsTracker = lazyNamed(() => import("./comps/SupplementsTracker"), "SupplementsTracker");
const AdminPanel = lazyNamed(() => import("./comps/AdminPanel"), "AdminPanel");
const CoachTeamManagement = lazyNamed(() => import("./comps/CoachTeamManagement"), "CoachTeamManagement");
const Notifications = lazyNamed(() => import("./comps/Notifications"), "Notifications");
const PricingSection = lazyNamed(() => import("./comps/PricingSection"), "PricingSection");
const Profile = lazyNamed(() => import("./comps/Profile"), "Profile");
const AppDownloads = lazyNamed(() => import("./comps/AppDownloads"), "AppDownloads");

const DESKTOP_SIDEBAR_HINT_KEY = "coachai_desktop_sidebar_hint_seen_v1";

const SIDEBAR_HINT_LABELS: Record<Language, string> = {
  es: "Ocultar/mostrar menú",
  ing: "Hide/show menu",
  eus: "Menua ezkutatu/erakutsi",
};

const PUBLIC_QUERY_LANGUAGE_MAP: Record<string, Language> = {
  es: "es",
  en: "ing",
  eu: "eus",
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const TIER_ORDER: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO_ATHLETE: 1,
  PRO_COACH: 2,
  PREMIUM_ATHLETE: 2,
  PREMIUM: 3,
};

function revokeObjectUrlMaybe(url?: string) {
  if (!url) return;
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // no-op
    }
  }
}

function hasRealVideoDuration(duration?: string) {
  if (!duration) return false;
  return duration !== "00:00" && duration !== "0:00";
}

const PAYMENT_CANCELLED_MESSAGE = "El pago ha sido cancelado.";
const PAYMENT_PENDING_MESSAGE =
  "Pago recibido. Stripe todavía no ha confirmado la suscripción: se activará sola en unos minutos. Si no aparece, cierra sesión y vuelve a entrar.";
const DEV_BOOTSTRAP_LOGS = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
const DATA_SYNC_INDICATOR_TIMEOUT_MS = 10000;

type DataSyncPhase = "idle" | "loading-local" | "syncing" | "hydrating" | "offline" | "error";

const isBusyDataSyncPhase = (phase: DataSyncPhase) => (
  phase === "loading-local" || phase === "syncing" || phase === "hydrating"
);

type DataSyncState = {
  phase: DataSyncPhase;
  source: "none" | "memory" | "local" | "server" | "cache";
  message: string;
  requestId: number;
  userId?: string;
  error?: string;
};

type CloudQuotaUsage = {
  videosUsed: number;
  videosLimit: number;
  videosStoredLimit?: number;
  pdfsUsed: number;
  pdfsLimit: number;
  pdfsStoredLimit?: number;
  chatsUsed: number;
  chatsLimit: number | 'unlimited';
  period: string;
  periodStartMs?: number;
  periodEndMs?: number;
  tier: string;
};

type QuotaLimitKind = 'video' | 'pdf';

type QuotaLimitModalState = {
  kind: QuotaLimitKind;
  title: string;
  message: string;
};

function logBootstrapDebug(event: string, payload?: Record<string, unknown>) {
  if (!DEV_BOOTSTRAP_LOGS) return;
  console.debug(`[AppBootstrap] ${event}`, payload || {});
}

function startBootstrapTrace(event: string, payload?: Record<string, unknown>) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  logBootstrapDebug(`${event}:start`, payload);

  return (extra?: Record<string, unknown>) => {
    const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.round((finishedAt - startedAt) * 100) / 100;
    logBootstrapDebug(`${event}:done`, { durationMs, ...payload, ...extra });
    return durationMs;
  };
}

function scheduleIdleTask(task: () => void, timeout = 400): () => void {
  if (typeof window === "undefined") {
    task();
    return () => undefined;
  }

  if ("requestIdleCallback" in window) {
    const handle = (window as any).requestIdleCallback(task, { timeout });
    return () => {
      if ("cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(handle);
      }
    };
  }

  const handle = globalThis.setTimeout(task, timeout);
  return () => globalThis.clearTimeout(handle);
}

function ScreenLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={
        fullScreen
          ? "native-app-shell min-h-screen h-[100dvh] w-full flex flex-col items-center justify-center bg-neutral-950 text-white gap-4"
          : "flex h-full min-h-[320px] w-full items-center justify-center bg-black text-white"
      }
    >
      <div className="flex items-center gap-3 rounded-full border border-neutral-800 bg-neutral-950 px-5 py-3 shadow-xl">
        <Loader2 size={18} className="animate-spin text-orange-500" />
        <span className="text-sm font-semibold">Cargando CoachAI...</span>
      </div>
    </div>
  );
}

function upsertHeadTag(selector: string, create: () => HTMLMetaElement | HTMLLinkElement) {
  if (typeof document === "undefined") return null;
  const existing = document.head.querySelector(selector);
  if (existing) return existing as HTMLMetaElement | HTMLLinkElement;
  const next = create();
  document.head.appendChild(next);
  return next;
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) || "/" : pathname;
}

function isLoginPath(pathname: string) {
  return normalizePathname(pathname) === "/login";
}

function shouldRenderLandingFromLocation(locationLike: Pick<Location, "pathname" | "hash">) {
  return !isLoginPath(locationLike.pathname) && !locationLike.hash.includes("login");
}

export default function App() {
  const nativeMobileApp = isNativeApp();
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [nativeAuthEntryRequested, setNativeAuthEntryRequested] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(StorageService.getCurrentUser());
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "es";
    return getPublicLanguageByPath(window.location.pathname) || "es";
  });
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [managedAthletes, setManagedAthletes] = useState<User[]>([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [showDesktopSidebarHint, setShowDesktopSidebarHint] = useState(false);
  const [showLanding, setShowLanding] = useState(() =>
    typeof window === "undefined" ? true : shouldRenderLandingFromLocation(window.location),
  );
  const [publicPath, setPublicPath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const currentPublicPage = useMemo(
    () => getPublicPageByPath(publicPath) || getPageContent("home", toSeoLocale(language)),
    [language, publicPath],
  );

  useEffect(() => {
    const syncPublicRouteState = () => {
      setPublicPath(window.location.pathname);
      setShowLanding(shouldRenderLandingFromLocation(window.location));
    };

    window.addEventListener('hashchange', syncPublicRouteState);
    window.addEventListener('popstate', syncPublicRouteState);
    return () => {
      window.removeEventListener('hashchange', syncPublicRouteState);
      window.removeEventListener('popstate', syncPublicRouteState);
    };
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [marketingTrialOffer, setMarketingTrialOffer] = useState<MarketingTrialOfferState | null>(null);
  const [gracePeriodInfo, setGracePeriodInfo] = useState<{ deadline: Date, isExpired: boolean, remainingText: string } | null>(null);

  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null);
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanFile | null>(null);
  const [strengthRecords, setStrengthRecords] = useState<StrengthRecord[]>([]);
  const [competitionRecords, setCompetitionRecords] = useState<ThrowRecord[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<ThrowRecord[]>([]);
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>([]);
  const [customExercises, setCustomExercises] = useState<ExerciseDef[]>([]);
  const [coachGlobalUsage, setCoachGlobalUsage] = useState<CloudQuotaUsage | null>(null);
  const [quotaLimitModal, setQuotaLimitModal] = useState<QuotaLimitModalState | null>(null);
  const [supplements, setSupplements] = useState<SupplementItem[]>([]);

  // Track videos that are currently uploading - used to prevent counter increment if deleted during upload
  const uploadingVideosRef = useRef<Set<string>>(new Set());

  // `usage` tracks the stats of the person being VIEWED (e.g., an athlete's stats)
  const [usage, setUsage] = useState<UserUsage | null>(null);

  // `myUsage` tracks the stats of the LOGGED IN user (e.g., the Coach's own quota)
  const [myUsage, setMyUsage] = useState<UserUsage | null>(null);
  const [dataSyncState, setDataSyncState] = useState<DataSyncState>({
    phase: "idle",
    source: "none",
    message: "",
    requestId: 0,
  });
  const bootstrapLoadRef = useRef<{ requestId: number; userId: string | null; promise: Promise<void> | null }>({
    requestId: 0,
    userId: null,
    promise: null,
  });
  const dataSyncStartedAtRef = useRef<{ requestId: number; startedAt: number } | null>(null);
  const pendingRepairCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isBusyDataSyncPhase(dataSyncState.phase)) {
      dataSyncStartedAtRef.current = null;
      return;
    }

    if (dataSyncStartedAtRef.current?.requestId !== dataSyncState.requestId) {
      dataSyncStartedAtRef.current = {
        requestId: dataSyncState.requestId,
        startedAt: Date.now(),
      };
    }

    const startedAt = dataSyncStartedAtRef.current.startedAt;
    const remainingMs = Math.max(0, DATA_SYNC_INDICATOR_TIMEOUT_MS - (Date.now() - startedAt));
    const requestId = dataSyncState.requestId;
    const timeoutId = window.setTimeout(() => {
      setDataSyncState((current) => {
        if (current.requestId !== requestId || !isBusyDataSyncPhase(current.phase)) return current;

        if (DEV_BOOTSTRAP_LOGS) {
          console.warn("[AppBootstrap] sync-indicator-timeout", {
            requestId,
            phase: current.phase,
            elapsedMs: Date.now() - startedAt,
          });
        }

        return {
          ...current,
          phase: isOnline ? "idle" : "offline",
          message: isOnline ? "" : "Sin conexión. Mostrando datos guardados.",
        };
      });
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [dataSyncState.phase, dataSyncState.requestId, isOnline]);

  const userLimits = useMemo(() => {
    const tier = currentUser?.profile?.subscriptionTier || 'FREE';
    return getUserLimits(tier);
  }, [currentUser]);

  // Only the user id, role and tier decide whether to fetch the offer, so it
  // is not refetched on every navigation. The offer is only rendered inside
  // the app shell (never on login/onboarding), and users without a profile
  // (onboarding) are skipped here.
  useEffect(() => {
    const profile = currentUser?.profile;
    const canCheckOffer = Boolean(
      currentUser
      && profile
      && profile.role !== 'admin'
      && (profile.subscriptionTier || 'FREE') === 'FREE'
      && StorageService.isCloudMode()
    );

    if (!canCheckOffer) {
      if (profile?.subscriptionTier && profile.subscriptionTier !== 'FREE') {
        setMarketingTrialOffer(null);
      }
      return;
    }

    let cancelled = false;
    void getMarketingTrialOffer()
      .then((offer) => {
        if (!cancelled) setMarketingTrialOffer(offer.show ? offer : null);
      })
      .catch((error) => {
        console.warn('Could not load the marketing trial offer', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.id,
    currentUser?.profile?.role,
    currentUser?.profile?.subscriptionTier,
  ]);

  const activeAnalysisProfile = useMemo(() => {
    if (!currentUser?.profile) return undefined;
    if (!viewedUserId || viewedUserId === currentUser.id) return currentUser.profile;
    return managedAthletes.find((athlete) => athlete.id === viewedUserId)?.profile || currentUser.profile;
  }, [currentUser, managedAthletes, viewedUserId]);
  const targetUserLimits = useMemo(
    () => getUserLimits(activeAnalysisProfile?.subscriptionTier || 'FREE'),
    [activeAnalysisProfile?.subscriptionTier],
  );

  const handleExternalReturn = (payload: ExternalReturnPayload) => {
    const user = StorageService.getCurrentUser();

    if (payload.action === "payment") {
      if (payload.status === "cancel") {
        setIsProcessingPayment(false);
        setPaymentMessage({ type: "error", text: PAYMENT_CANCELLED_MESSAGE });
        if (user) {
          void handleLogin(user);
        }
        return;
      }

      if (user) {
        void handleLogin(user, true);
        return;
      }

      setIsProcessingPayment(false);
      setPaymentMessage({ type: "success", text: "Pago confirmado. Inicia sesión para refrescar la suscripción." });
      return;
    }

    setPaymentMessage({ type: "success", text: "Volviendo a la app. Actualizando tu suscripción..." });
    if (user) {
      void handleLogin(user).then(() => setCurrentScreen("pricing"));
    }
  };

  useEffect(() => {
    const onExternalReturn = (event: Event) => {
      const customEvent = event as CustomEvent<ExternalReturnPayload>;
      if (!customEvent.detail) return;
      handleExternalReturn(customEvent.detail);
    };

    window.addEventListener(EXTERNAL_RETURN_EVENT, onExternalReturn as EventListener);
    return () => window.removeEventListener(EXTERNAL_RETURN_EVENT, onExternalReturn as EventListener);
  }, []);

  useEffect(() => initializeNativeAppShell(), []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapApp = async () => {
      try {
      // Initialize Theme
      const savedTheme = localStorage.getItem("coachai_theme");
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }

      const urlParams = new URLSearchParams(window.location.search);
      const queryLang = PUBLIC_QUERY_LANGUAGE_MAP[urlParams.get("lang") || ""];
      const routeLang = getPublicLanguageByPath(window.location.pathname);
      const savedLang = localStorage.getItem("coachai_lang");

      if (queryLang) {
        setLanguage(queryLang);
        localStorage.setItem("coachai_lang", queryLang);
      } else if (routeLang) {
        setLanguage(routeLang);
        localStorage.setItem("coachai_lang", routeLang);
      } else if (savedLang && ['es', 'ing', 'eus'].includes(savedLang)) {
        setLanguage(savedLang as Language);
      }

      const paymentStatus = urlParams.get('payment');

      if (paymentStatus === 'cancel') {
        setPaymentMessage({ type: 'error', text: PAYMENT_CANCELLED_MESSAGE });
      }

      const hasLegacyLoginHash = window.location.hash.includes("login");
      const loginTargetPath = "/login";

      if (hasLegacyLoginHash && !isLoginPath(window.location.pathname)) {
        window.history.replaceState({}, "", loginTargetPath);
        setPublicPath(loginTargetPath);
        setShowLanding(false);
      } else if (queryLang || paymentStatus) {
        window.history.replaceState({}, "", window.location.pathname);
        setPublicPath(window.location.pathname);
        setShowLanding(shouldRenderLandingFromLocation(window.location));
      }

      const user = await StorageService.restoreCurrentUser();
      if (user) {
        await handleLogin(user, paymentStatus === 'success');
      } else {
        if (nativeMobileApp) {
          setNativeAuthEntryRequested(false);
        } else {
          setCurrentScreen("login");
        }
      }
      } catch (e) {
        if (!cancelled) {
          setFatalError(toErrorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    };

    void bootstrapApp();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem("coachai_lang", lang);
    } catch { }
  };

  const handlePublicNavigation = (targetHref: string) => {
    if (typeof window === "undefined") return;

    const nextUrl = new URL(targetHref, window.location.origin);
    const nextPath = nextUrl.pathname;
    const nextHash = nextUrl.hash || "";
    const nextSearch = nextUrl.search || "";

    window.history.pushState({}, "", `${nextPath}${nextSearch}${nextHash}`);
    setPublicPath(nextPath);

    const nextLanguage = getPublicLanguageByPath(nextPath);
    if (nextLanguage) {
      handleLanguageChange(nextLanguage);
    }

    const shouldShowPublicLanding = !isLoginPath(nextPath) && !nextHash.includes("login");
    setShowLanding(shouldShowPublicLanding);

    if (!shouldShowPublicLanding) {
      if (nativeMobileApp) {
        setNativeAuthEntryRequested(true);
      }
      setCurrentScreen("login");
    }
  };

  useEffect(() => {
    const localizedPrivateMetadata = {
      es: {
        loginTitle: "Acceso a CoachAI",
        privateTitle: "CoachAI | Área privada",
        description: "Área autenticada de CoachAI. Esta experiencia no debe indexarse.",
        htmlLang: "es",
      },
      ing: {
        loginTitle: "CoachAI Sign In",
        privateTitle: "CoachAI | Private Area",
        description: "CoachAI authenticated area. This experience must not be indexed.",
        htmlLang: "en",
      },
      eus: {
        loginTitle: "CoachAI Sarbidea",
        privateTitle: "CoachAI | Eremu pribatua",
        description: "CoachAIren eremu autentifikatua. Esperientzia hau ez da indexatu behar.",
        htmlLang: "eu",
      },
    } as const;
    const privateMetadata = localizedPrivateMetadata[language] || localizedPrivateMetadata.es;
    const isPublicHome = !currentUser && showLanding;
    const title = isPublicHome
      ? "App de entrenamiento con IA para analizar vídeos, técnica y progreso | CoachAI"
      : currentUser
        ? privateMetadata.privateTitle
        : privateMetadata.loginTitle;
    const description = isPublicHome
      ? "CoachAI es una app de entrenamiento con IA para analizar vídeos, mejorar técnica, registrar marcas personales y seguir progreso deportivo."
      : privateMetadata.description;
    const robotsValue = isPublicHome
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,nofollow,noarchive";

    document.title = title;
    document.documentElement.lang = privateMetadata.htmlLang;

    const descriptionTag = upsertHeadTag('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "description";
      return meta;
    }) as HTMLMetaElement | null;

    if (descriptionTag) {
      descriptionTag.content = description;
    }

    const robotsTag = upsertHeadTag('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.name = "robots";
      return meta;
    }) as HTMLMetaElement | null;

    if (robotsTag) {
      robotsTag.content = robotsValue;
    }

    const canonicalTag = upsertHeadTag('link[rel="canonical"]', () => {
      const link = document.createElement("link");
      link.rel = "canonical";
      return link;
    }) as HTMLLinkElement | null;

    if (canonicalTag) {
      canonicalTag.href = window.location.origin + window.location.pathname;
    }
  }, [currentUser, language, showLanding]);

  useEffect(() => {
    if (currentUser || !showLanding) return;

    document.title = currentPublicPage.metaTitle;

    const descriptionTag = upsertHeadTag('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "description";
      return meta;
    }) as HTMLMetaElement | null;

    if (descriptionTag) {
      descriptionTag.content = currentPublicPage.metaDescription;
    }

    const robotsTag = upsertHeadTag('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.name = "robots";
      return meta;
    }) as HTMLMetaElement | null;

    if (robotsTag) {
      robotsTag.content = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
    }

    const canonicalTag = upsertHeadTag('link[rel="canonical"]', () => {
      const link = document.createElement("link");
      link.rel = "canonical";
      return link;
    }) as HTMLLinkElement | null;

    if (canonicalTag) {
      canonicalTag.href = window.location.origin + currentPublicPage.path;
    }
  }, [currentPublicPage, currentUser, showLanding]);

  useEffect(() => {
    if (!viewedUserId) return;
    void loadDataForUser(viewedUserId, { reason: "viewed-user-change" });
  }, [viewedUserId]);

  useEffect(() => {
    return () => {
      pendingRepairCleanupRef.current?.();
    };
  }, []);

  // Load MY usage whenever I log in or update
  useEffect(() => {
    if (currentUser) {
      void loadMyUsage(currentUser);
    }
  }, [currentUser?.id, currentUser?.profile?.role]);

  useEffect(() => {
    if (!selectedVideo) return;
    const updatedVideo = videos.find((video) => video.id === selectedVideo.id);
    if (!updatedVideo) {
      setSelectedVideo(null);
      return;
    }
    if (updatedVideo !== selectedVideo) {
      setSelectedVideo(updatedVideo);
    }
  }, [videos, selectedVideo]);

  useEffect(() => {
    if (!selectedPlan) return;
    const updatedPlan = plans.find((plan) => plan.id === selectedPlan.id);
    if (!updatedPlan) {
      setSelectedPlan(null);
      return;
    }
    if (updatedPlan !== selectedPlan) {
      setSelectedPlan(updatedPlan);
    }
  }, [plans, selectedPlan]);

  const canShowDesktopMenuHint = Boolean(currentUser) && !['analyzer', 'planViewer', 'onboarding'].includes(currentScreen);

  useEffect(() => {
    if (!canShowDesktopMenuHint) {
      setShowDesktopSidebarHint(false);
      return;
    }

    if (typeof window === "undefined" || window.innerWidth < 768) return;

    let hintAlreadySeen = false;
    try {
      hintAlreadySeen = localStorage.getItem(DESKTOP_SIDEBAR_HINT_KEY) === "1";
    } catch {
      hintAlreadySeen = false;
    }

    if (hintAlreadySeen) return;

    setShowDesktopSidebarHint(true);
    try {
      localStorage.setItem(DESKTOP_SIDEBAR_HINT_KEY, "1");
    } catch {
      // Ignore storage write failures and keep current UX.
    }

    const timeoutId = window.setTimeout(() => {
      setShowDesktopSidebarHint(false);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [canShowDesktopMenuHint, currentUser?.id]);

  const loadMyUsage = async (userData: User) => {
    try {
      const data = await StorageService.getUserData(userData.id);
      setMyUsage(data.usage);
      refreshCoachGlobalUsage();
    } catch (e) {
      console.error("Failed to load own usage", e);
    }
  };

  useEffect(() => {
    if (currentUser && usage && viewedUserId === currentUser.id) {
      checkGracePeriod(currentUser);
    }
  }, [currentUser, usage, viewedUserId, videos.length, plans.length]);

  const checkGracePeriod = async (user: User) => {
    if (!StorageService.isCloudMode()) {
      setGracePeriodInfo(null);
      return;
    }

    try {
      const snap = await db.collection('account_enforcement').doc(user.id).get();
      const data = snap.exists ? snap.data() : null;
      if (!data || data.status !== 'OVER_LIMIT_GRACE_PERIOD' || !data.gracePeriodEndsAt) {
        setGracePeriodInfo(null);
        return;
      }

      const deadline = typeof data.gracePeriodEndsAt.toDate === 'function'
        ? data.gracePeriodEndsAt.toDate()
        : new Date(data.gracePeriodEndsAt);
      const diffMs = deadline.getTime() - Date.now();

      const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const hours = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      const minutes = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
      const remainingText = diffMs <= 0
        ? "Pendiente de ajuste automático"
        : days > 0
          ? `${days} días y ${hours} horas restantes`
          : `${hours}h ${minutes}m restantes`;

      setGracePeriodInfo({ deadline, isExpired: diffMs <= 0, remainingText });
    } catch (error) {
      console.warn("Could not read grace period state", error);
    }
  };

  const handleLogin = async (user: User, isPaymentSuccess = false) => {
    try {
      setFatalError(null);

      if (isPaymentSuccess) {
        setIsProcessingPayment(true);
        window.history.replaceState({}, '', window.location.pathname);
      }

      let tier: SubscriptionTier = "FREE";
      let refreshTierInBackground = false;

      // --- PLAN DETERMINATION LOGIC ---
      // The authoritative tier comes from the getSubscriptionState callable,
      // which also owns the premium allow-list. Only the owner's own address is
      // mirrored in the bundle (see subscriptionService); the rest of the list
      // stays on the server so members' addresses are never shipped to clients.
      const userRole = user.profile?.role || 'athlete';

      // Test accounts always use the hardcoded logic regardless of cloud mode
      if (user.id.startsWith('test-')) {
        tier = await getSubscriptionTier(user.id, user.email || user.username, userRole);
      }
      // Real accounts use cloud subscription check
      else if (StorageService.isCloudMode()) {
        if (isPaymentSuccess) {
          tier = await waitForSubscriptionActive(user.id, user.email || user.username, userRole);
          if (tier !== 'FREE') {
            setPaymentMessage({ type: 'success', text: `¡Pago confirmado!` });
          } else {
            // The webhook has not written the subscription yet. Tell the user
            // instead of leaving them on FREE with no explanation; the next
            // login re-reads the subscription and applies the paid tier.
            setPaymentMessage({ type: 'info', text: PAYMENT_PENDING_MESSAGE });
          }
        } else {
          // Render with the last confirmed tier and refresh it in the
          // background: waiting here put a callable cold start in front of
          // every app open.
          const cachedTier = readCachedSubscriptionTier(user.id);
          if (cachedTier) {
            tier = cachedTier;
            refreshTierInBackground = true;
          } else {
            tier = await getSubscriptionTier(user.id, user.email || user.username, userRole);
          }
        }
      }

      const userWithTier: User = {
        ...user,
        profile: user.profile ? { ...user.profile, subscriptionTier: tier } : undefined
      };

      setCurrentUser(userWithTier);
      setIsProcessingPayment(false);

      if (refreshTierInBackground) {
        void getSubscriptionTier(user.id, user.email || user.username, userRole).then((freshTier) => {
          if (freshTier === tier) return;
          setCurrentUser((prev) => (
            prev && prev.id === user.id && prev.profile
              ? { ...prev, profile: { ...prev.profile, subscriptionTier: freshTier } }
              : prev
          ));
        });
      }

      if (userWithTier.profile?.role === "admin") {
        setMarketingTrialOffer(null);
        setCurrentScreen("admin_panel");
        return;
      }

      if (!userWithTier.profile) {
        setMarketingTrialOffer(null);
        setCurrentScreen("onboarding");
        return;
      }

      setViewedUserId(userWithTier.id);

      // Fetch fresh managedAthletes from Firestore for coaches (not from stale
      // profile). The roster only feeds the athlete switcher, so it loads
      // after the dashboard instead of in front of it.
      if (userWithTier.profile.role === "coach") {
        const coachProfile = userWithTier.profile;
        void (async () => {
          try {
            const freshCoachDoc = await db.collection("users").doc(userWithTier.id).get();
            const freshProfile = freshCoachDoc.exists ? (freshCoachDoc.data() as any)?.profile : null;
            if (freshProfile?.managedAthletes && freshProfile.managedAthletes.length > 0) {
              const athletes = await StorageService.getManagedAthletes(freshProfile.managedAthletes);
              setManagedAthletes(athletes);
            } else {
              setManagedAthletes([]);
            }
          } catch (e) {
            console.warn("Could not fetch fresh coach data, using local profile", e);
            if (coachProfile.managedAthletes) {
              const athletes = await StorageService.getManagedAthletes(coachProfile.managedAthletes).catch(() => []);
              setManagedAthletes(athletes);
            } else {
              setManagedAthletes([]);
            }
          }
        })();
      } else {
        setManagedAthletes([]);
      }

      setCurrentScreen("dashboard");

    } catch (e) {
      console.error("Login failed:", e);
      setFatalError(toErrorMessage(e));
      setCurrentUser(null);
      setViewedUserId(null);
      setCurrentScreen("login");
      setIsProcessingPayment(false);
    }
  };

  const coachUsageRetryTimeoutRef = useRef<number | null>(null);
  const handleOnboardingComplete = async (user: User) => {
    await handleLogin(user, false);

    if (!StorageService.isCloudMode() || Number(user.profile?.age) < 18) return;
    const role = user.profile?.role === 'coach' ? 'coach' : 'athlete';
    setMarketingTrialOffer({
      show: true,
      eligible: true,
      role,
      planName: role === 'coach' ? 'Coach Pro' : 'Athlete Pro',
      monthlyAmountCents: role === 'coach' ? 4_999 : 1_999,
      monthlyPriceLabel: role === 'coach' ? '49,99 €' : '19,99 €',
      freeMonths: 1,
    });
  };

  const handleMarketingTrialAccept = async () => {
    if (!currentUser) return;
    try {
      await createMarketingTrialCheckout(currentUser.id, 'existing_user_offer', language);
    } catch (error) {
      setPaymentMessage({ type: 'error', text: toErrorMessage(error) });
    }
  };

  const handleMarketingTrialDismiss = async () => {
    try {
      await dismissMarketingTrialOffer('existing_user_offer');
      setMarketingTrialOffer(null);
    } catch (error) {
      setPaymentMessage({ type: 'error', text: toErrorMessage(error) });
    }
  };

  const refreshCoachGlobalUsage = async (attempt = 0) => {
    const scheduleRetry = () => {
      if (StorageService.isOnline() && attempt < 3) {
        coachUsageRetryTimeoutRef.current = window.setTimeout(() => {
          void refreshCoachGlobalUsage(attempt + 1);
        }, 750 * (attempt + 1));
      }
    };
    try {
      const usage = await StorageService.getCoachQuotaUsage();
      if (usage) {
        setCoachGlobalUsage(usage);
        return;
      }
      scheduleRetry();
    } catch (e) {
      console.warn("Failed to fetch coach global usage", e);
      scheduleRetry();
    }
  };

  const handleLogout = async () => {
    try {
      if (coachUsageRetryTimeoutRef.current !== null) {
        window.clearTimeout(coachUsageRetryTimeoutRef.current);
        coachUsageRetryTimeoutRef.current = null;
      }
      pendingRepairCleanupRef.current?.();
      bootstrapLoadRef.current = {
        requestId: bootstrapLoadRef.current.requestId + 1,
        userId: null,
        promise: null,
      };
      await StorageService.logout();
      setCurrentUser(null);
      setMarketingTrialOffer(null);
      setViewedUserId(null);
      setManagedAthletes([]);
      setCurrentScreen("login");
      setDataSyncState({ phase: "idle", source: "none", message: "", requestId: 0 });
      setVideos((prev) => {
        prev.forEach((v) => revokeObjectUrlMaybe(v.url));
        return [];
      });
      setPlans((prev) => {
        prev.forEach((p) => revokeObjectUrlMaybe(p.url));
        return [];
      });
    } catch (e) { }
  };

  const applyCoreUserData = (targetId: string, data: UserData) => {
    setUsage(data.usage);
    setStrengthRecords(data.strengthRecords || []);
    setCompetitionRecords(data.competitionRecords || []);
    setTrainingRecords(data.trainingRecords || []);
    setMatchRecords(data.matchRecords || []);
    setCustomExercises(data.customExercises || []);
    setSupplements(data.supplements || []);
    // Saved assets are playable straight from their persisted URLs; hydration
    // later swaps in local blobs and repairs anything missing.
    setVideos(
      (data.videos || []).map((video) => toPersistedPlaybackVideo(video, targetId) || {
        ...video,
        url: "",
        isLocal: false,
        ownerId: targetId,
      })
    );
    setPlans(
      (data.plans || []).map((plan) => ({
        ...plan,
        url: plan.status !== "error" && !plan.errorCode ? plan.downloadURL || plan.remoteUrl || "" : "",
        file: undefined,
        isLocal: false,
        ownerId: targetId,
      }))
    );
  };

  const scheduleMetadataRepair = (targetId: string, requestId: number, repairedVideos: VideoFile[], repairedPlans: PlanFile[]) => {
    if ((!repairedVideos.length && !repairedPlans.length) || !StorageService.isOnline()) return;

    pendingRepairCleanupRef.current?.();
    pendingRepairCleanupRef.current = scheduleIdleTask(() => {
      if (bootstrapLoadRef.current.requestId !== requestId || bootstrapLoadRef.current.userId !== targetId) {
        return;
      }

      void (async () => {
        const finish = startBootstrapTrace("persist-bootstrap-repairs", {
          targetId,
          requestId,
          repairedVideos: repairedVideos.length,
          repairedPlans: repairedPlans.length,
        });

        try {
          if (repairedVideos.length > 0) {
            await StorageService.updateVideos(targetId, repairedVideos, { reason: "bootstrap-repair" });
          }
          if (repairedPlans.length > 0) {
            await StorageService.updatePlans(targetId, repairedPlans, { reason: "bootstrap-repair" });
          }
          finish({ result: "synced" });
        } catch (error) {
          finish({ result: "failed", error: toErrorMessage(error) });
        }
      })();
    }, 600);
  };

  // --- Local video cache (IndexedDB) ---
  // Hydration plays a video from its local blob when one exists (uploads made
  // on this device). Cloud videos are no longer downloaded whole in the
  // background: on a phone that 60+ MB fetch competed with the player for the
  // connection while the user was scrubbing.
  useEffect(() => {
    // Ask the browser not to evict the cached videos from IndexedDB under storage pressure.
    try {
      void navigator.storage?.persist?.();
    } catch {
      // no-op
    }
  }, []);

  // A persisted download URL is served as-is: re-resolving it costs two Storage
  // round trips per video, and the analyzer already recovers a stale URL when
  // playback fails.
  const toPersistedPlaybackVideo = (video: VideoFile, targetId: string): VideoFile | null => {
    const persistedPlaybackUrl = video.downloadURL || video.remoteUrl;
    if (
      !persistedPlaybackUrl ||
      video.status === "error" ||
      video.playbackStatus === "unplayable" ||
      video.errorCode
    ) {
      return null;
    }
    return {
      ...video,
      url: persistedPlaybackUrl,
      isLocal: false,
      ownerId: targetId,
      status: "ready",
    };
  };

  const hydrateVideosForBootstrap = async (targetId: string, requestId: number, loadedVideos: VideoFile[]) => {
    const finish = startBootstrapTrace("hydrate-videos", {
      targetId,
      requestId,
      count: loadedVideos.length,
    });

    const batchSize = 12;
    const hydrated: VideoFile[] = [];
    const repairedVideos: VideoFile[] = [];

    for (let i = 0; i < loadedVideos.length; i += batchSize) {
      const batch = loadedVideos.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (video) => {
          const needsDuration = !hasRealVideoDuration(video.duration);
          const blob = await VideoStorage.getVideo(video.id);

          if (blob) {
            const duration = needsDuration ? await getVideoDurationLabel(blob) : video.duration;
            return {
              ...video,
              url: URL.createObjectURL(blob),
              isLocal: true,
              duration: duration || video.duration,
              contentType: video.contentType || blob.type || undefined,
              size: video.size || blob.size,
              ownerId: targetId,
              status: video.status || "ready",
            };
          }

          const persistedVideo = toPersistedPlaybackVideo(video, targetId);
          if (persistedVideo) return persistedVideo;

          if (StorageService.isCloudMode()) {
            const found = await StorageService.findVideoDownloadUrl(targetId, video);

            if (found?.url) {
              const persistedUrl = video.downloadURL || video.remoteUrl;
              const duration = needsDuration ? await getVideoDurationLabel(found.url) : video.duration;
              const canPlayResolvedType = StorageService.canPlayVideoContentType(found.contentType);
              const playbackStatus = duration
                ? "playable"
                : canPlayResolvedType === false
                  ? "unplayable"
                  : (video.playbackStatus || "unknown");
              const playbackErrorMessage = playbackStatus === "unplayable"
                ? "El video esta subido correctamente, pero este navegador no puede reproducir su formato."
                : undefined;
              const resolvedVideo: VideoFile = {
                ...video,
                remoteUrl: found.url,
                downloadURL: found.url,
                storagePath: found.path || video.storagePath,
                url: playbackStatus === "unplayable" ? "" : found.url,
                isLocal: false,
                duration: duration || video.duration,
                contentType: found.contentType || video.contentType,
                size: found.size ?? video.size,
                createdAt: found.createdAt || video.createdAt,
                ownerId: targetId,
                status: "ready",
                errorCode: playbackStatus === "unplayable" ? "video/unplayable" : undefined,
                errorMessage: playbackErrorMessage,
                playbackStatus,
              };

              const needsRepair =
                found.url !== persistedUrl ||
                found.path !== video.storagePath ||
                found.contentType !== video.contentType ||
                found.size !== video.size ||
                found.createdAt !== video.createdAt ||
                video.status !== "ready" ||
                Boolean(video.errorCode) ||
                Boolean(video.errorMessage);

              if (needsRepair) {
                repairedVideos.push({ ...resolvedVideo, url: "" });
              }

              return resolvedVideo;
            }

            if (found?.errorCode || found?.errorMessage) {
              const errorVideo: VideoFile = {
                ...video,
                downloadURL: undefined,
                remoteUrl: undefined,
                url: "",
                isLocal: false,
                ownerId: targetId,
                status: "error",
                errorCode: found.errorCode || "storage/object-not-found",
                errorMessage: found.errorMessage || "No se ha podido localizar el video en Firebase Storage.",
              };
              repairedVideos.push(errorVideo);
              return errorVideo;
            }
          }

          return {
            ...video,
            url: "",
            isLocal: false,
            ownerId: targetId,
            status: video.status || "error",
            errorCode: video.errorCode || "storage/object-not-found",
            errorMessage: video.errorMessage || "No se ha podido localizar el video en Firebase Storage.",
          };
        })
      );

      hydrated.push(...batchResults);
      if (bootstrapLoadRef.current.requestId === requestId && bootstrapLoadRef.current.userId === targetId) {
        // Keep the not-yet-hydrated tail listed so the gallery never shrinks
        // (and the open video is never dropped) while batches complete.
        const pending = loadedVideos
          .slice(i + batchSize)
          .map((video) => toPersistedPlaybackVideo(video, targetId) || { ...video, url: "", isLocal: false, ownerId: targetId });
        setVideos([...hydrated, ...pending]);
      }
    }

    finish({ repaired: repairedVideos.length });
    return { hydrated, repairedVideos };
  };

  const hydratePlansForBootstrap = async (
    targetId: string,
    requestId: number,
    loadedPlans: PlanFile[],
  ): Promise<{ hydrated: PlanFile[]; repairedPlans: PlanFile[] }> => {
    const finish = startBootstrapTrace("hydrate-plans", {
      targetId,
      requestId,
      count: loadedPlans.length,
    });

    const hydrated = await Promise.all(
      loadedPlans.map(async (plan): Promise<PlanFile> => {
        const blob = await PlanStorage.getPlan(plan.id);
        if (blob) {
          return {
            ...plan,
            url: URL.createObjectURL(blob),
            file: blob as any,
            isLocal: true,
            contentType: plan.contentType || blob.type || undefined,
            size: plan.size || blob.size,
            ownerId: targetId,
            status: plan.status || "ready",
          };
        }

        const persistedPlanUrl = plan.downloadURL || plan.remoteUrl;
        if (persistedPlanUrl && plan.status !== "error" && !plan.errorCode) {
          return {
            ...plan,
            url: persistedPlanUrl,
            isLocal: false,
            ownerId: targetId,
            status: "ready",
          };
        }

        if (StorageService.isCloudMode()) {
          const found = await StorageService.findPlanDownloadUrl(targetId, plan);
          if (found?.url) {
            return {
              ...plan,
              remoteUrl: found.url,
              downloadURL: found.url,
              storagePath: found.path || plan.storagePath,
              url: found.url,
              isLocal: false,
              contentType: found.contentType || plan.contentType,
              size: found.size ?? plan.size,
              createdAt: found.createdAt || plan.createdAt,
              ownerId: targetId,
              status: "ready",
              errorCode: undefined,
              errorMessage: undefined,
            };
          }

          if (found?.errorCode || found?.errorMessage) {
            return {
              ...plan,
              url: "",
              remoteUrl: undefined,
              downloadURL: undefined,
              isLocal: false,
              ownerId: targetId,
              status: "error",
              errorCode: found.errorCode || "storage/object-not-found",
              errorMessage: found.errorMessage || "No se ha podido localizar el documento en Firebase Storage.",
            };
          }
        }

        return {
          ...plan,
          url: "",
          isLocal: false,
          ownerId: targetId,
          status: plan.status || "error",
          errorCode: plan.errorCode || "storage/object-not-found",
          errorMessage: plan.errorMessage || "No se ha podido localizar el documento en Firebase Storage.",
        };
      })
    );

    const repairedPlans = hydrated
      .filter((plan, index) => {
        const original = loadedPlans[index];
        return (
          plan.downloadURL !== original.downloadURL ||
          plan.remoteUrl !== original.remoteUrl ||
          plan.storagePath !== original.storagePath ||
          plan.contentType !== original.contentType ||
          plan.size !== original.size ||
          plan.createdAt !== original.createdAt ||
          plan.status !== original.status ||
          plan.errorCode !== original.errorCode ||
          plan.errorMessage !== original.errorMessage
        );
      })
      .map((plan) => ({ ...plan, url: "", file: undefined }));

    if (bootstrapLoadRef.current.requestId === requestId && bootstrapLoadRef.current.userId === targetId) {
      setPlans(hydrated);
    }

    finish({ repaired: repairedPlans.length });
    return { hydrated, repairedPlans };
  };

  const loadDataForUser = async (targetId: string, options?: { force?: boolean; reason?: string }) => {
    if (!options?.force &&
      bootstrapLoadRef.current.userId === targetId &&
      bootstrapLoadRef.current.promise
    ) {
      logBootstrapDebug("deduped-load", { targetId, reason: options?.reason || "default" });
      return bootstrapLoadRef.current.promise;
    }

    const requestId = bootstrapLoadRef.current.requestId + 1;
    const finish = startBootstrapTrace("loadDataForUser", {
      targetId,
      requestId,
      reason: options?.reason || "default",
    });

    const task = (async () => {
      try {
        setFatalError(null);
        pendingRepairCleanupRef.current?.();
        bootstrapLoadRef.current = { requestId, userId: targetId, promise: bootstrapLoadRef.current.promise };

        setVideos((prev) => {
          prev.forEach((video) => revokeObjectUrlMaybe(video.url));
          return [];
        });
        setPlans((prev) => {
          prev.forEach((plan) => revokeObjectUrlMaybe(plan.url));
          return [];
        });

        const localData = StorageService.getLocalUserData(targetId);
        applyCoreUserData(targetId, localData);
        setDataSyncState({
          phase: StorageService.isOnline() ? "syncing" : "offline",
          source: "local",
          message: StorageService.isOnline()
            ? "Mostrando datos guardados mientras sincronizamos..."
            : "Sin conexión. Mostrando datos guardados.",
          requestId,
          userId: targetId,
        });

        const data = await StorageService.getUserData(targetId);
        if (bootstrapLoadRef.current.requestId !== requestId || bootstrapLoadRef.current.userId !== targetId) {
          finish({ result: "stale" });
          return;
        }

        const loadInfo = StorageService.getLastUserDataLoadInfo(targetId);
        applyCoreUserData(targetId, data);
        setDataSyncState({
          phase: StorageService.isOnline() ? "hydrating" : "offline",
          source: loadInfo?.source || "local",
          message: !StorageService.isOnline()
            ? "Sin conexión. Mostrando datos guardados."
            : loadInfo?.source === "cache" || loadInfo?.source === "local"
              ? "Mostrando caché local. Reintentaremos sincronizar en segundo plano."
              : "Sincronizando vídeos y documentos...",
          requestId,
          userId: targetId,
        });

        void (async () => {
          const mediaFinish = startBootstrapTrace("hydrate-media", {
            targetId,
            requestId,
            videos: data.videos.length,
            plans: data.plans.length,
          });

          try {
            const [videoResult, planResult] = await Promise.all([
              hydrateVideosForBootstrap(targetId, requestId, data.videos || []),
              hydratePlansForBootstrap(targetId, requestId, data.plans || []),
            ]);

            if (bootstrapLoadRef.current.requestId !== requestId || bootstrapLoadRef.current.userId !== targetId) {
              mediaFinish({ result: "stale" });
              return;
            }

            scheduleMetadataRepair(targetId, requestId, videoResult.repairedVideos, planResult.repairedPlans);
            setDataSyncState({
              phase: StorageService.isOnline() ? "idle" : "offline",
              source: loadInfo?.source || "local",
              message: StorageService.isOnline() ? "" : "Sin conexión. Mostrando datos guardados.",
              requestId,
              userId: targetId,
            });
            mediaFinish({
              result: "ready",
              repairedVideos: videoResult.repairedVideos.length,
              repairedPlans: planResult.repairedPlans.length,
            });
          } catch (error) {
            if (bootstrapLoadRef.current.requestId !== requestId || bootstrapLoadRef.current.userId !== targetId) {
              mediaFinish({ result: "stale-error", error: toErrorMessage(error) });
              return;
            }

            setDataSyncState({
              phase: StorageService.isOnline() ? "error" : "offline",
              source: loadInfo?.source || "local",
              message: StorageService.isOnline()
                ? "Se han cargado los datos base, pero la hidratación de medios ha fallado."
                : "Sin conexión. Mostrando datos guardados.",
              requestId,
              userId: targetId,
              error: toErrorMessage(error),
            });
            mediaFinish({ result: "failed", error: toErrorMessage(error) });
          }
        })();

        finish({
          result: "core-ready",
          source: loadInfo?.source || "local",
          stale: loadInfo?.stale ?? true,
          durationMs: loadInfo?.durationMs,
        });
      } catch (error) {
        if (bootstrapLoadRef.current.requestId !== requestId || bootstrapLoadRef.current.userId !== targetId) {
          finish({ result: "stale-error", error: toErrorMessage(error) });
          return;
        }

        const fallbackData = StorageService.getLocalUserData(targetId);
        applyCoreUserData(targetId, fallbackData);
        setDataSyncState({
          phase: StorageService.isOnline() ? "error" : "offline",
          source: "local",
          message: StorageService.isOnline()
            ? "No se ha podido sincronizar con Firebase. Mostrando datos guardados."
            : "Sin conexión. Mostrando datos guardados.",
          requestId,
          userId: targetId,
          error: toErrorMessage(error),
        });
        finish({ result: "failed", error: toErrorMessage(error) });
      } finally {
        if (bootstrapLoadRef.current.requestId === requestId && bootstrapLoadRef.current.userId === targetId) {
          bootstrapLoadRef.current.promise = null;
        }
      }
    })();

    bootstrapLoadRef.current = {
      requestId,
      userId: targetId,
      promise: task,
    };

    return task;
  };

  const navigateTo = (screen: Screen) => {
    setCurrentScreen(screen);
    if (screen !== "analyzer") setSelectedVideo(null);
    if (screen !== "planViewer") setSelectedPlan(null);
    setIsMobileMenuOpen(false);
  };

  const openQuotaLimitModal = (kind: QuotaLimitKind, limit: number, overrideMessage?: string) => {
    const isVideo = kind === 'video';
    const title = language === 'ing'
      ? 'Subscription limit reached'
      : language === 'eus'
        ? 'Harpidetza muga gaindituta'
        : 'Límite de suscripción alcanzado';
    const message = overrideMessage || (language === 'ing'
      ? `You have reached the ${isVideo ? 'video' : 'PDF'} upload limit for your current billing cycle (${limit}).`
      : language === 'eus'
        ? `Uneko zikloko ${isVideo ? 'bideo' : 'PDF'} igoera-mugara iritsi zara (${limit}).`
        : `Has alcanzado el límite de subidas de ${isVideo ? 'vídeos' : 'PDFs'} de tu ciclo actual (${limit}).`);

    setQuotaLimitModal({ kind, title, message });
  };

  const isSubscriptionQuotaError = (error: unknown) => {
    const code = typeof (error as any)?.code === 'string' ? String((error as any).code) : '';
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
    return code.includes('resource-exhausted')
      || message.includes('límite mensual')
      || message.includes('monthly')
      || message.includes('hileko');
  };

  const handleAddStrength = async (record: Omit<StrengthRecord, "id">) => {
    if (!viewedUserId) return;
    const updated = [...strengthRecords, { ...record, id: Date.now().toString() }];
    setStrengthRecords(updated);
    await StorageService.updateStrengthRecords(viewedUserId, updated);
  };

  const handleDeleteStrength = async (id: string) => {
    if (!viewedUserId) return;
    const updated = strengthRecords.filter((r) => r.id !== id);
    setStrengthRecords(updated);
    await StorageService.updateStrengthRecords(viewedUserId, updated);
  };

  const handleAddCompetition = async (record: Omit<ThrowRecord, "id">) => {
    if (!viewedUserId) return;
    const updated = [...competitionRecords, { ...record, id: Date.now().toString() }];
    setCompetitionRecords(updated);
    await StorageService.updateCompetitionRecords(viewedUserId, updated);
  };

  const handleDeleteCompetition = async (id: string) => {
    if (!viewedUserId) return;
    const updated = competitionRecords.filter((r) => r.id !== id);
    setCompetitionRecords(updated);
    await StorageService.updateCompetitionRecords(viewedUserId, updated);
  };

  const handleAddTraining = async (record: Omit<ThrowRecord, "id">) => {
    if (!viewedUserId) return;
    const updated = [...trainingRecords, { ...record, id: Date.now().toString() }];
    setTrainingRecords(updated);
    await StorageService.updateTrainingRecords(viewedUserId, updated);
  };

  const handleDeleteTraining = async (id: string) => {
    if (!viewedUserId) return;
    const updated = trainingRecords.filter((r) => r.id !== id);
    setTrainingRecords(updated);
    await StorageService.updateTrainingRecords(viewedUserId, updated);
  };

  const handleAddMatch = async (record: Omit<MatchRecord, "id">) => {
    if (!viewedUserId) return;
    const updated = [...matchRecords, { ...record, id: Date.now().toString() }];
    setMatchRecords(updated);
    await StorageService.updateMatchRecords(viewedUserId, updated);
  };

  const handleDeleteMatch = async (id: string) => {
    if (!viewedUserId) return;
    const updated = matchRecords.filter((r) => r.id !== id);
    setMatchRecords(updated);
    await StorageService.updateMatchRecords(viewedUserId, updated);
  };

  const handleUploadVideo = async (file: File, thumbnail?: string) => {
    if (!currentUser || !viewedUserId) return;
    if (!StorageService.isOnline()) {
      alert("No hay conexión. El vídeo no se puede subir hasta que vuelva Internet.");
      return;
    }

    const validationError = StorageService.validateVideoFile(file);
    if (validationError) {
      alert(validationError);
      return;
    }

    // Determine whose usage to check and increment
    const isCoach = currentUser.profile?.role === 'coach';
    const effectiveUsage = isCoach ? myUsage : usage;

    if (!effectiveUsage) return;

    // Prefer the server's plan limits (getCoachQuotaUsage) when known; the
    // profile tier can lag behind the subscription the backend enforces.
    const monthlyVideoLimit = coachGlobalUsage?.videosLimit ?? userLimits.maxVideoUploadsPerMonth;
    const monthlyVideoCount = coachGlobalUsage?.videosUsed ?? (StorageService.isCloudMode() ? 0 : effectiveUsage.analysisCount ?? 0);

    // Check the billing-cycle upload limit. The backend remains authoritative.
    if ((!StorageService.isCloudMode() || coachGlobalUsage) && monthlyVideoCount >= monthlyVideoLimit) {
      openQuotaLimitModal('video', monthlyVideoLimit);
      return;
    }
    // The stored limit is the gallery owner's; the quota callable reports the
    // signed-in user's, so it only applies to their own gallery.
    const storedVideoLimit = (viewedUserId === currentUser.id ? coachGlobalUsage?.videosStoredLimit : undefined)
      ?? targetUserLimits.maxStoredVideos;
    if (videos.length >= storedVideoLimit) {
      openQuotaLimitModal(
        'video',
        storedVideoLimit,
        `La galería ya tiene ${videos.length} vídeos y este plan permite guardar ${storedVideoLimit}. Elimina uno antes de subir otro.`,
      );
      return;
    }

    const newId = Date.now().toString();
    const storagePath = StorageService.buildVideoStoragePath(viewedUserId, newId, file.name);
    const localDisplayUrl = URL.createObjectURL(file);
    const createdAt = new Date().toISOString();
    const browserCanPlaySelectedType = StorageService.canPlayVideoContentType(file.type);
    const initialPlaybackStatus = browserCanPlaySelectedType === false
        ? 'unplayable'
        : 'unknown';
    const initialPlaybackError = initialPlaybackStatus === 'unplayable'
      ? 'El archivo se ha subido, pero este navegador no puede reproducir este formato.'
      : undefined;

    const videoForState: VideoFile = {
      id: newId,
      url: localDisplayUrl,
      thumbnail: thumbnail || "",
      name: file.name,
      date: new Date().toLocaleDateString() + ", " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: "00:00",
      isLocal: true,
      isUploading: true,
      storagePath,
      contentType: file.type || undefined,
      size: file.size,
      createdAt,
      ownerId: viewedUserId,
      status: 'uploading',
      playbackStatus: initialPlaybackStatus,
      errorCode: initialPlaybackStatus === 'unplayable' ? 'video/unplayable' : undefined,
      errorMessage: initialPlaybackError,
    };

    // Track this video as uploading
    uploadingVideosRef.current.add(newId);
    setVideos((prev) => [videoForState, ...prev]);
    setSelectedVideo(videoForState);
    setCurrentScreen("analyzer");

    const localSavePromise = VideoStorage.saveVideo(newId, file).catch((localSaveError) => {
      console.warn("[Video upload] Local video cache save failed", localSaveError);
    });

    const metadataPromise = Promise.all([
        getVideoDurationLabel(file),
        thumbnail ? Promise.resolve(thumbnail) : generateVideoThumbnail(file),
      ]).then(([durationLabel, generatedThumbnail]) => {

      setVideos((prev) => prev.map((v) => v.id !== newId ? v : {
        ...v,
        duration: durationLabel || v.duration,
        thumbnail: generatedThumbnail || v.thumbnail,
        playbackStatus: durationLabel ? 'playable' : v.playbackStatus,
      }));

      return { durationLabel, generatedThumbnail };
    }).catch((metadataError) => {
      console.warn("[Video upload] Local metadata generation failed", metadataError);
      return {
        durationLabel: undefined,
        generatedThumbnail: thumbnail || '',
      };
    });

    let cloudUrl = "";
    let uploadResult: Awaited<ReturnType<typeof StorageService.uploadVideoFile>> = null;
    try {
      if (StorageService.isCloudMode() && viewedUserId !== 'MASTER_GOD_EUKEN') {
        uploadResult = await StorageService.uploadVideoFile(viewedUserId, file, storagePath);
        cloudUrl = uploadResult?.downloadURL || "";
      } else {
        await localSavePromise;
      }

      if (StorageService.isCloudMode() && !uploadResult?.downloadURL) {
        throw new Error("Cloud upload failed");
      }

      if (!uploadingVideosRef.current.has(newId)) {
        if (cloudUrl) {
          await StorageService.deleteFileFromCloud(cloudUrl, 'videos', viewedUserId);
        }
        return;
      }

      // Metadata work runs in parallel with the upload, but it must be included
      // in the persisted record. Previously the gallery thumbnail was only put
      // in React state and the database kept the original empty value.
      const { durationLabel, generatedThumbnail } = await metadataPromise;

      const videoForDb: VideoFile = {
        ...videoForState,
        thumbnail: generatedThumbnail || videoForState.thumbnail,
        duration: durationLabel || videoForState.duration,
        isLocal: !cloudUrl,
        isUploading: false,
        url: "",
        remoteUrl: uploadResult?.downloadURL || undefined,
        downloadURL: uploadResult?.downloadURL || undefined,
        storagePath: uploadResult?.storagePath || storagePath,
        contentType: uploadResult?.contentType || file.type || undefined,
        size: uploadResult?.size || file.size,
        createdAt: uploadResult?.createdAt || createdAt,
        ownerId: uploadResult?.ownerId || viewedUserId,
        status: 'ready',
        playbackStatus: durationLabel ? 'playable' : videoForState.playbackStatus,
      };

      // V3 Authoritative Video Storage (Backend verifies global coach quota)
      const registration = await StorageService.addVideoSafe(viewedUserId, videoForDb);

      if (!registration.success) {
        throw new Error("Límite de vídeos del plan excedido.");
      }
      
      setCoachGlobalUsage(prev => prev ? {
        ...prev,
        videosUsed: typeof registration.count === 'number' ? registration.count : prev.videosUsed + 1,
        videosLimit: typeof registration.limit === 'number' ? registration.limit : prev.videosLimit,
        period: registration.period || prev.period,
        tier: registration.tier || prev.tier,
      } : prev);
      refreshCoachGlobalUsage();

      // Only increment AI analysis counter if video wasn't deleted during upload
      if (uploadingVideosRef.current.has(newId)) {
        const payerId = isCoach ? currentUser.id : viewedUserId;
        try {
          await StorageService.incrementUsage(payerId, 'analysis');

          if (isCoach) {
            setMyUsage(prev => prev ? { ...prev, analysisCount: prev.analysisCount + 1 } : prev);
          } else {
            setUsage(prev => prev ? { ...prev, analysisCount: prev.analysisCount + 1 } : prev);
          }
        } catch (usageError) {
          console.warn("[Video upload] Legacy usage counter update failed", usageError);
        }
      }

      // Remove from tracking
      uploadingVideosRef.current.delete(newId);

      setVideos((prev) => prev.map((v) => v.id !== newId ? v : {
        ...v,
        isUploading: false,
        processingStatus: 'queued',
        remoteUrl: uploadResult?.downloadURL || undefined,
        downloadURL: uploadResult?.downloadURL || undefined,
        isLocal: !cloudUrl,
        storagePath: uploadResult?.storagePath || storagePath,
        contentType: uploadResult?.contentType || file.type || undefined,
        size: uploadResult?.size || file.size,
        createdAt: uploadResult?.createdAt || createdAt,
        ownerId: uploadResult?.ownerId || viewedUserId,
        status: 'ready',
        url: localDisplayUrl
      }));

      void VideoIntelligenceService.prepareVideoContext({
        userId: viewedUserId,
        videoId: newId,
        videoName: file.name,
        source: file,
        remoteUrl: uploadResult?.downloadURL || undefined,
        storagePath: uploadResult?.storagePath || storagePath,
        language,
        userProfile: activeAnalysisProfile,
        isUploading: false,
      }).catch((processingError) => {
        console.error("[Video upload] Background context processing failed", processingError);
      });
    } catch (e) {
      console.error("[Video upload] Failed", e);
      uploadingVideosRef.current.delete(newId);
      const uploadMessage = StorageService.getUploadErrorMessage(e, 'videos', language);
      if (isSubscriptionQuotaError(e)) {
        if (cloudUrl) {
          await StorageService.deleteFileFromCloud(cloudUrl, 'videos', viewedUserId);
        }
        await VideoStorage.deleteVideo(newId).catch(() => {});
        revokeObjectUrlMaybe(localDisplayUrl);
        setVideos((prev) => prev.filter((v) => v.id !== newId));
        setSelectedVideo((prev) => prev?.id === newId ? null : prev);
        setCurrentScreen("gallery");
        openQuotaLimitModal('video', monthlyVideoLimit, uploadMessage);
      } else {
        setVideos((prev) => prev.map((v) => v.id !== newId ? v : {
          ...v,
          isUploading: false,
          isLocal: true,
          status: 'error',
          errorCode: typeof (e as any)?.code === 'string' ? String((e as any).code) : 'storage/upload-failed',
          errorMessage: uploadMessage,
          url: localDisplayUrl,
        }));
      }
    }
  };

  const handleDeleteVideo = async (id: string) => {
    if (!currentUser || !viewedUserId) return;
    const ownerId = viewedUserId;
    const video = videos.find((v) => v.id === id);

    // If video is still uploading, remove from tracking to prevent counter increment
    // The upload will complete but won't count towards usage
    const wasUploading = uploadingVideosRef.current.has(id);
    if (wasUploading) {
      uploadingVideosRef.current.delete(id);
    }

    // Delete the server record first: if it fails the video stays in the
    // gallery (and its file is kept) instead of disappearing until reload.
    try {
      await StorageService.deleteVideoSafe(ownerId, id);
    } catch (error) {
      console.error("[Video delete] Failed", error);
      if (wasUploading) uploadingVideosRef.current.add(id);
      alert(language === 'ing'
        ? "The video could not be deleted. Please try again."
        : language === 'eus'
          ? "Ezin izan da bideoa ezabatu. Saiatu berriro."
          : "No se pudo eliminar el vídeo. Inténtalo de nuevo.");
      return;
    }

    try {
      const videoCloudUrl = video?.downloadURL || video?.remoteUrl;
      if (videoCloudUrl) {
        await StorageService.deleteFileFromCloud(videoCloudUrl, 'videos', ownerId);
      } else if (video?.storagePath) {
        await StorageService.deleteFileByPath(video.storagePath, 'videos', ownerId);
      }
      await VideoStorage.deleteVideo(id);
      await FilmstripStorage.deleteFilmstrip(id);
    } catch (cleanupError) {
      console.warn("[Video delete] File cleanup failed", cleanupError);
    }
    revokeObjectUrlMaybe(video?.url);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const handleUploadPlan = async (file: File) => {
    if (!viewedUserId || !usage || !currentUser) return;
    if (!StorageService.isOnline()) {
      alert("No hay conexión. El PDF no se puede subir hasta que vuelva Internet.");
      return;
    }

    // Determine whose usage
    const isCoach = currentUser.profile?.role === 'coach';
    const effectiveUsage = isCoach ? myUsage : usage;
    if (!effectiveUsage) return;

    // Prefer the server's plan limits when known (see handleUploadVideo).
    const planLimit = coachGlobalUsage?.pdfsLimit ?? userLimits.maxPdfUploadsPerMonth;
    const planCount = coachGlobalUsage?.pdfsUsed ?? (StorageService.isCloudMode() ? 0 : effectiveUsage.plansCount || 0);
    if ((!StorageService.isCloudMode() || coachGlobalUsage) && planCount >= planLimit) {
      openQuotaLimitModal('pdf', planLimit);
      return;
    }
    const storedPdfLimit = (viewedUserId === currentUser.id ? coachGlobalUsage?.pdfsStoredLimit : undefined)
      ?? targetUserLimits.maxStoredPdfs;
    if (plans.length >= storedPdfLimit) {
      openQuotaLimitModal(
        'pdf',
        storedPdfLimit,
        `La galería ya tiene ${plans.length} PDF y este plan permite guardar ${storedPdfLimit}. Elimina uno antes de subir otro.`,
      );
      return;
    }

    const id = Date.now().toString();
    const storagePath = StorageService.buildPlanStoragePath(viewedUserId, id, file.name);
    const createdAt = new Date().toISOString();

    // Optimistic update
    const planForState: PlanFile = {
      id,
      name: file.name, // Keep original name for display
      date: new Date().toLocaleDateString(),
      isLocal: true,
      file: file,
      url: URL.createObjectURL(file), // Create local URL for immediate viewing
      storagePath,
      contentType: file.type || undefined,
      size: file.size,
      createdAt,
      ownerId: viewedUserId,
      status: 'uploading',
    };

    setPlans((prev) => [...prev, planForState]);

    let cloudUrl = "";
    let uploadResult: Awaited<ReturnType<typeof StorageService.uploadUserAsset>> = null;
    try {
      await PlanStorage.savePlan(id, file);

      // --- CLOUD UPLOAD LOGIC ---
      if (StorageService.isCloudMode() && viewedUserId !== 'MASTER_GOD_EUKEN') {
        uploadResult = await StorageService.uploadUserAsset(viewedUserId, file, 'plans', storagePath);
        cloudUrl = uploadResult?.downloadURL || "";
      }

      // If cloud upload failed in cloud mode, avoid saving a broken entry
      if (StorageService.isCloudMode() && !cloudUrl) {
        throw new Error("Cloud upload failed");
      }

      // V3: Authoritative PDF Storage (Backend verifies global coach quota)
      const pdfForDb: PlanFile = {
        ...planForState,
        isLocal: !cloudUrl,
        remoteUrl: uploadResult?.downloadURL || undefined,
        downloadURL: uploadResult?.downloadURL || undefined,
        storagePath: uploadResult?.storagePath || storagePath,
        contentType: uploadResult?.contentType || file.type || undefined,
        size: uploadResult?.size || file.size,
        createdAt: uploadResult?.createdAt || createdAt,
        ownerId: uploadResult?.ownerId || viewedUserId,
        status: 'ready',
        file: undefined,
        url: ""
      };

      const registration = await StorageService.addPdfSafe(viewedUserId, pdfForDb);
      if (!registration.success) {
        throw new Error("Límite de PDFs del plan excedido.");
      }
      
      setCoachGlobalUsage(prev => prev ? {
        ...prev,
        pdfsUsed: typeof registration.count === 'number' ? registration.count : prev.pdfsUsed + 1,
        pdfsLimit: typeof registration.limit === 'number' ? registration.limit : prev.pdfsLimit,
        period: registration.period || prev.period,
        tier: registration.tier || prev.tier,
      } : prev);
      refreshCoachGlobalUsage();

      // Increment logic for AI/App usage analytics
      const payerId = isCoach ? currentUser.id : viewedUserId;
      try {
        await StorageService.incrementUsage(payerId, 'plan');

        if (isCoach) {
          setMyUsage(prev => prev ? { ...prev, plansCount: (prev.plansCount || 0) + 1 } : prev);
        } else {
          setUsage(prev => prev ? { ...prev, plansCount: (prev.plansCount || 0) + 1 } : prev);
        }
      } catch (usageError) {
        console.warn("[PDF upload] Legacy usage counter update failed", usageError);
      }

      // Update local state to show it's no longer just local
      setPlans((prev) => prev.map(p => p.id === id ? {
        ...p,
        remoteUrl: uploadResult?.downloadURL || undefined,
        downloadURL: uploadResult?.downloadURL || undefined,
        isLocal: false,
        storagePath: uploadResult?.storagePath || storagePath,
        contentType: uploadResult?.contentType || file.type || undefined,
        size: uploadResult?.size || file.size,
        createdAt: uploadResult?.createdAt || createdAt,
        ownerId: uploadResult?.ownerId || viewedUserId,
        status: 'ready',
      } : p));

    } catch (e) {
      console.error("Error uploading plan", e);
      // Rollback state
      if (cloudUrl) {
        await StorageService.deleteFileFromCloud(cloudUrl, 'plans', viewedUserId);
      }
      await PlanStorage.deletePlan(id).catch(() => {});
      revokeObjectUrlMaybe(planForState.url);
      setPlans((prev) => prev.filter(p => p.id !== id));
      const uploadMessage = StorageService.getUploadErrorMessage(e, 'plans', language);
      if (isSubscriptionQuotaError(e)) {
        openQuotaLimitModal('pdf', planLimit, uploadMessage);
      } else {
        alert(uploadMessage);
      }
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!viewedUserId) return;
    const ownerId = viewedUserId;
    const plan = plans.find(p => p.id === id);

    // Delete the server record first: if it fails the PDF stays in the list
    // (and its file is kept) instead of disappearing until reload.
    try {
      await StorageService.deletePlanSafe(ownerId, id);
    } catch (error) {
      console.error("[Plan delete] Failed", error);
      alert(language === 'ing'
        ? "The PDF could not be deleted. Please try again."
        : language === 'eus'
          ? "Ezin izan da PDFa ezabatu. Saiatu berriro."
          : "No se pudo eliminar el PDF. Inténtalo de nuevo.");
      return;
    }

    try {
      const planCloudUrl = plan?.downloadURL || plan?.remoteUrl;
      if (planCloudUrl) {
        await StorageService.deleteFileFromCloud(planCloudUrl, 'plans', ownerId);
      } else if (plan?.storagePath) {
        await StorageService.deleteFileByPath(plan.storagePath, 'plans', ownerId);
      }
      await PlanStorage.deletePlan(id);
    } catch (cleanupError) {
      console.warn("[Plan delete] File cleanup failed", cleanupError);
    }
    revokeObjectUrlMaybe(plan?.url);
    setPlans((prev) => prev.filter(p => p.id !== id));
  };

  const handleIncrementChat = async () => {
    if (currentUser && viewedUserId) {
      // Coach chat quota applies to Coach. Athlete quota to Athlete.
      const isCoach = currentUser.profile?.role === 'coach';
      const payerId = isCoach ? currentUser.id : viewedUserId;

      try {
        await StorageService.incrementUsage(payerId, 'chat');
      } catch (usageError) {
        console.warn("[AI chat] Legacy usage counter update failed", usageError);
      }

      // Optimistic local state update (no re-fetch needed)
      if (isCoach) {
        setMyUsage(prev => prev ? { ...prev, chatCount: (prev.chatCount || 0) + 1 } : prev);
      } else {
        setUsage(prev => prev ? { ...prev, chatCount: (prev.chatCount || 0) + 1 } : prev);
      }

      setCoachGlobalUsage(prev => prev ? { ...prev, chatsUsed: (prev.chatsUsed || 0) + 1 } : prev);
    }
  }

  const handleUpdateSupplements = async (newItems: SupplementItem[]) => {
    if (!viewedUserId) return;
    setSupplements(newItems);
    await StorageService.updateSupplements(viewedUserId, newItems);
  };

  const handleSwitchAthlete = (id: string) => {
    setViewedUserId(id);
    setSelectedVideo(null);
    setSelectedPlan(null);
    setCurrentScreen("dashboard");
  };

  const isSidebarVisible = isDesktopSidebarOpen && !['analyzer', 'planViewer'].includes(currentScreen);
  const showMobileMenuButton = !['analyzer', 'planViewer', 'onboarding'].includes(currentScreen);
  const isCoach = currentUser?.profile?.role === 'coach';
  const sidebarHintLabel = SIDEBAR_HINT_LABELS[language] || SIDEBAR_HINT_LABELS.es;

  useEffect(() => {
    if (!currentUser || !showMobileMenuButton) return;
    if (typeof window === "undefined" || window.innerWidth < 768) return;

    let hintAlreadySeen = false;
    try {
      hintAlreadySeen = localStorage.getItem(DESKTOP_SIDEBAR_HINT_KEY) === "1";
    } catch {
      hintAlreadySeen = false;
    }

    if (hintAlreadySeen) return;

    setShowDesktopSidebarHint(true);
    try {
      localStorage.setItem(DESKTOP_SIDEBAR_HINT_KEY, "1");
    } catch {
      // Ignore storage write failures and keep current UX.
    }

    const timeoutId = window.setTimeout(() => {
      setShowDesktopSidebarHint(false);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [currentUser?.id, showMobileMenuButton]);

  if (fatalError) return (
    <div className="native-app-shell min-h-screen h-[100dvh] w-full flex items-center justify-center p-6 bg-neutral-950 text-white">
      <div className="max-w-xl w-full bg-neutral-900 border border-neutral-800 p-8 rounded-3xl text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle size={40} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">Cuenta Eliminada</h1>
        <p className="text-neutral-400 mb-8">{fatalError}</p>
        <button
          onClick={() => { setFatalError(null); setCurrentScreen('login'); }}
          className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
        >
          Volver al Inicio
        </button>
      </div>
    </div>
  );

  if (isProcessingPayment) {
    return (
      <div className="native-app-shell min-h-screen h-[100dvh] w-full flex flex-col items-center justify-center bg-neutral-950 text-white gap-4">
        <Loader2 size={48} className="animate-spin text-orange-500" />
        <h2 className="text-xl font-bold">Verificando tu pago...</h2>
        <p className="text-sm text-neutral-400">Esperando la confirmación de Stripe. Puede tardar hasta un minuto.</p>
      </div>
    );
  }

  if (isRestoringSession) {
    return <ScreenLoader fullScreen />;
  }

  if (!currentUser && nativeMobileApp && !nativeAuthEntryRequested) {
    return (
      <LandingPage
        onContinue={() => setNativeAuthEntryRequested(true)}
        language={language}
        onLanguageChange={handleLanguageChange}
        nativeMode
        page={currentPublicPage}
      />
    );
  }

  if (!currentUser && !nativeMobileApp && showLanding) {
    return (
      <LandingPage
        onContinue={() => handlePublicNavigation("/login")}
        language={language}
        onLanguageChange={handleLanguageChange}
        nativeMode={nativeMobileApp}
        onPublicNavigate={nativeMobileApp ? handlePublicNavigation : undefined}
        page={currentPublicPage}
      />
    );
  }
  if (!currentUser) return <Login onLogin={(u) => handleLogin(u)} language={language} onLanguageChange={handleLanguageChange} />;
  if (currentScreen === "admin_panel") {
    return (
      <Suspense fallback={<ScreenLoader fullScreen />}>
        <AdminPanel onLogout={handleLogout} />
      </Suspense>
    );
  }
  // Pass language to Onboarding
  if (currentScreen === "onboarding") {
    return (
      <Suspense fallback={<ScreenLoader fullScreen />}>
        <Onboarding user={currentUser} onComplete={handleOnboardingComplete} language={language} />
      </Suspense>
    );
  }

  // Logic for display-only stats (Global if Coach active).
  // The signed-in payer's plan policy drives the visible limits. Features
  // follow whichever tier is higher between it and the quota callable's tier,
  // so a lagging response never strips capabilities the account has. Cloud
  // usage provides authoritative counters, and the backend still makes the
  // final accept/reject decision for every upload or AI request.
  const serverTier = coachGlobalUsage?.tier as SubscriptionTier | undefined;
  const effectiveTier: SubscriptionTier =
    serverTier && (TIER_ORDER[serverTier] ?? 0) > (TIER_ORDER[userLimits.tier] ?? 0)
      ? serverTier
      : userLimits.tier;
  const finalUserLimits = { ...getUserLimits(effectiveTier) };
  finalUserLimits.maxStoredVideos = targetUserLimits.maxStoredVideos;
  finalUserLimits.maxStoredPdfs = targetUserLimits.maxStoredPdfs;

  const isCloudQuotaPending = StorageService.isCloudMode() && Boolean(currentUser) && !coachGlobalUsage;
  const galleryVideoCount = coachGlobalUsage?.videosUsed;
  const galleryPlanCount = coachGlobalUsage?.pdfsUsed;

  const baseDisplayedUsage = isCoach ? myUsage : usage;
  const displayedUsage = baseDisplayedUsage && coachGlobalUsage
    ? {
        ...baseDisplayedUsage,
        chatCount: coachGlobalUsage.chatsUsed,
        analysisCount: coachGlobalUsage.videosUsed,
        plansCount: coachGlobalUsage.pdfsUsed,
      }
    : baseDisplayedUsage;
  const effectiveDataSyncState = dataSyncState.phase === "idle" && !isOnline
    ? {
        ...dataSyncState,
        phase: "offline" as const,
        source: dataSyncState.source === "none" ? "local" as const : dataSyncState.source,
        message: "Sin conexión. Mostrando datos guardados.",
      }
    : dataSyncState;

  const dataSyncUi = (() => {
    switch (effectiveDataSyncState.phase) {
      case "loading-local":
      case "syncing":
      case "hydrating":
        return {
          icon: Loader2,
          iconClassName: "animate-spin",
          className: "border-sky-500/20 bg-sky-950/70 text-sky-100",
          label: effectiveDataSyncState.message || "Sincronizando datos...",
          retryable: false,
        };
      case "offline":
        return {
          icon: Clock,
          iconClassName: "",
          className: "border-amber-500/20 bg-amber-950/70 text-amber-100",
          label: effectiveDataSyncState.message || "Sin conexión. Modo local.",
          retryable: Boolean(viewedUserId),
        };
      case "error":
        return {
          icon: AlertTriangle,
          iconClassName: "",
          className: "border-red-500/20 bg-red-950/70 text-red-100",
          label: effectiveDataSyncState.message || "Error al sincronizar datos.",
          retryable: Boolean(viewedUserId),
        };
      default:
        return null;
    }
  })();

  const showDataSyncIndicator = isBusyDataSyncPhase(dataSyncState.phase);
  const dataSyncIndicatorLabel = dataSyncState.phase === "hydrating"
    ? "Preparando vídeos..."
    : "Sincronizando cuenta...";

  return (
    <div className="native-app-shell flex min-h-screen h-[100dvh] w-full bg-black text-white overflow-hidden transition-colors duration-300">
      {paymentMessage && (
        <div className={`fixed safe-top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-top-4 duration-500 ${paymentMessage.type === 'success' ? 'bg-green-600 text-white' : paymentMessage.type === 'info' ? 'bg-amber-500 text-black' : 'bg-red-600 text-white'}`}>
          {paymentMessage.type === 'success' ? <CheckCircle size={24} /> : paymentMessage.type === 'info' ? <Clock size={24} /> : <XCircle size={24} />}
          <p className="font-bold text-sm md:text-base">{paymentMessage.text}</p>
          <button onClick={() => setPaymentMessage(null)} className="ml-2 hover:bg-white/20 p-1 rounded"><XCircle size={16} /></button>
        </div>
      )}

      {marketingTrialOffer?.show && currentUser && (
        <Suspense fallback={null}>
          <MarketingTrialOffer
            language={language}
            role={marketingTrialOffer.role || (currentUser.profile?.role === 'coach' ? 'coach' : 'athlete')}
            monthlyPriceLabel={marketingTrialOffer.monthlyPriceLabel || (currentUser.profile?.role === 'coach' ? '49,99 €' : '19,99 €')}
            onAccept={handleMarketingTrialAccept}
            onDismiss={handleMarketingTrialDismiss}
          />
        </Suspense>
      )}

      {gracePeriodInfo && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-red-900/50 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle size={40} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">LÍMITE EXCEDIDO</h2>
              <p className="text-neutral-300 mb-6">Tu suscripción actual permite menos archivos. Tienes 3 días para elegir qué conservar y reducir cada galería a su límite. Si una categoría sigue excedida al terminar el plazo, se eliminarán todos sus vídeos o todos sus PDF.</p>
              {!gracePeriodInfo.isExpired && (
                <div className="flex items-center gap-2 text-orange-400 bg-orange-900/20 px-4 py-2 rounded-lg mb-6 border border-orange-500/20">
                  <Clock size={18} /><span className="font-mono font-bold">{gracePeriodInfo.remainingText}</span>
                </div>
              )}
              <div className="flex flex-col gap-3 w-full">
                <button onClick={() => navigateTo('pricing')} className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors">Mejorar Plan</button>
                <div className="flex gap-3">
                  <button onClick={() => { navigateTo('gallery'); setGracePeriodInfo(null); }} className="flex-1 py-3 bg-red-900/30 text-red-400 font-bold rounded-xl hover:bg-red-900/50 border border-red-800 transition-colors">Revisar Vídeos</button>
                  <button onClick={() => { navigateTo('planning'); setGracePeriodInfo(null); }} className="flex-1 py-3 bg-red-900/30 text-red-400 font-bold rounded-xl hover:bg-red-900/50 border border-red-800 transition-colors">Revisar PDFs</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {quotaLimitModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{quotaLimitModal.title}</h3>
              <p className="text-neutral-400 text-sm mb-6">{quotaLimitModal.message}</p>
              <button
                onClick={() => { setQuotaLimitModal(null); navigateTo('pricing'); }}
                className="w-full py-3 px-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
              >
                {language === 'ing' ? 'View subscriptions' : language === 'eus' ? 'Ikusi harpidetzak' : 'Ver suscripciones'}
              </button>
              <button
                onClick={() => setQuotaLimitModal(null)}
                className="mt-3 text-sm text-neutral-500 hover:text-white transition-colors"
              >
                {language === 'ing' ? 'Close' : language === 'eus' ? 'Itxi' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-[85%] max-w-[300px] h-full shadow-2xl animate-in slide-in-from-left duration-200 z-10">
            <Suspense fallback={null}>
              <Sidebar currentScreen={currentScreen} onNavigate={navigateTo} onLogout={handleLogout} currentUser={currentUser} managedAthletes={managedAthletes} viewedUserId={viewedUserId} onSwitchAthlete={handleSwitchAthlete} language={language} onLanguageChange={handleLanguageChange} onClose={() => setIsMobileMenuOpen(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={`hidden md:block transition-all duration-500 ease-in-out border-r border-neutral-200 dark:border-neutral-900 shadow-2xl z-30 ${isSidebarVisible ? 'w-80' : 'w-0 overflow-hidden opacity-0'}`}>
        <Suspense fallback={null}>
          <Sidebar currentScreen={currentScreen} onNavigate={navigateTo} onLogout={handleLogout} currentUser={currentUser} managedAthletes={managedAthletes} viewedUserId={viewedUserId} onSwitchAthlete={handleSwitchAthlete} language={language} onLanguageChange={handleLanguageChange} />
        </Suspense>
      </div>

      {showDesktopSidebarHint && (
        <div className="hidden md:block fixed inset-0 z-[35] bg-black/55 backdrop-blur-[1px] pointer-events-none transition-opacity duration-300" />
      )}

      <main className="flex-1 h-full min-h-0 overflow-hidden relative flex flex-col">
        {!isOnline && (
          <div className="sticky top-0 z-[60] bg-amber-500 text-black px-4 py-2 text-center text-sm font-bold shadow-lg">
            Sin conexión. Puedes ver lo ya guardado en este dispositivo, pero las subidas y la sincronización con la nube están pausadas.
          </div>
        )}

        {showMobileMenuButton && (
          <div className="hidden md:block absolute top-0 left-0 z-40">
            <div className="group relative flex items-center p-4">
              <button
                onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)}
                className={`relative z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full backdrop-blur-md transition-all duration-300 ${
                  showDesktopSidebarHint
                    ? 'opacity-100 text-white border border-white shadow-[0_0_0_1px_rgba(255,255,255,0.45)]'
                    : 'opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
                title={sidebarHintLabel}
              >
                <PanelLeft size={20} />
              </button>

              <div
                className={`absolute left-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/85 px-3 py-1.5 text-xs font-semibold text-white shadow-xl transition-all duration-300 ${
                  showDesktopSidebarHint
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-2 opacity-0 pointer-events-none'
                }`}
              >
                {sidebarHintLabel}
              </div>
            </div>
          </div>
        )}

        <div className="absolute safe-top-4 safe-right-4 z-40 flex items-center gap-3">
          {showDataSyncIndicator && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-950/70 px-3 py-2 text-xs font-medium text-sky-100 shadow-lg backdrop-blur-md">
              <Loader2 size={14} className="animate-spin" />
              <span>{dataSyncIndicatorLabel}</span>
            </div>
          )}
          <Suspense fallback={null}>
            <Notifications currentUser={currentUser} onRefreshUser={() => void handleLogin(currentUser)} />
          </Suspense>
        </div>

        {/* Global Grace Period Banner - Highest Priority Warning */}
        <GracePeriodBanner />

        {showMobileMenuButton && (
          <div className="md:hidden fixed safe-bottom-6 safe-left-6 z-40">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-3.5 bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full shadow-xl">
              <Menu size={24} />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <Suspense fallback={<ScreenLoader />}>
            {currentScreen === "dashboard" && <Dashboard userProfile={currentUser.profile} videos={videos} strengthRecords={strengthRecords} throwRecords={competitionRecords} trainingRecords={trainingRecords} onNavigate={navigateTo} language={language} />}
            {currentScreen === "gallery" && <Gallery videos={videos} overrideCount={galleryVideoCount} quotaPending={isCloudQuotaPending} onSelectVideo={(v: VideoFile) => { setSelectedVideo(v); setCurrentScreen("analyzer"); }} onUpload={handleUploadVideo} onDelete={handleDeleteVideo} language={language} usage={displayedUsage} limits={finalUserLimits} onNavigate={navigateTo} />}
            {currentScreen === "analyzer" && selectedVideo && <VideoAnalyzer video={selectedVideo} targetUserId={viewedUserId!} onBack={() => navigateTo("gallery")} usage={displayedUsage} limits={finalUserLimits} onIncrementUsage={handleIncrementChat} language={language} onNavigate={navigateTo} userProfile={activeAnalysisProfile} />}
            {currentScreen === "planning" && <PlanGallery plans={plans} overrideCount={galleryPlanCount} quotaPending={isCloudQuotaPending} onSelectPlan={(p: PlanFile) => { setSelectedPlan(p); setCurrentScreen("planViewer"); }} onUpload={handleUploadPlan} onDelete={handleDeletePlan} language={language} usage={displayedUsage} limits={finalUserLimits} onNavigate={navigateTo} />}
            {currentScreen === "planViewer" && selectedPlan && <PdfViewer plan={selectedPlan} onBack={() => navigateTo("planning")} />}
            {currentScreen === "strength" && <StrengthTracker records={strengthRecords} onAddRecord={handleAddStrength} onDeleteRecord={handleDeleteStrength} exercises={customExercises} onUpdateExercises={(e: ExerciseDef[]) => { setCustomExercises(e); void StorageService.updateCustomExercises(viewedUserId!, e); }} language={language} />}
            {currentScreen === "competition" && <JavelinTracker profile={currentUser.profile!} records={competitionRecords} onAddRecord={handleAddCompetition} onDeleteRecord={handleDeleteCompetition} language={language} />}
            {currentScreen === "training" && <TrainingTracker profile={currentUser.profile!} records={trainingRecords} onAddRecord={handleAddTraining} onDeleteRecord={handleDeleteTraining} language={language} />}
            {currentScreen === "matches" && <MatchTracker profile={currentUser.profile!} records={matchRecords} onAddRecord={handleAddMatch} onDeleteRecord={handleDeleteMatch} language={language} />}
            {currentScreen === "calculator" && <PlateCalculator language={language} />}
            {currentScreen === "supplements" && <SupplementsTracker supplements={supplements} onUpdate={handleUpdateSupplements} language={language} />}
            {currentScreen === "coach" && <CoachChat language={language} usage={displayedUsage} limits={finalUserLimits} onMessageSent={handleIncrementChat} />}
            {currentScreen === "team_management" && <CoachTeamManagement currentUser={currentUser} onSelectAthlete={handleSwitchAthlete} activeAthleteId={viewedUserId} language={language} onAthleteRemoved={(athleteId: string) => setManagedAthletes(prev => prev.filter(a => a.id !== athleteId))} />}
            {currentScreen === "pricing" && <PricingSection currentUser={currentUser} language={language} />}
            {currentScreen === "profile" && <Profile currentUser={currentUser} onUpdateUser={setCurrentUser} onLogout={handleLogout} language={language} onRefreshData={() => { if (viewedUserId) void loadDataForUser(viewedUserId, { force: true, reason: "profile-refresh" }); }} />}
            {currentScreen === "app_downloads" && <AppDownloads language={language} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
