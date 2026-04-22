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
import { StorageService, VideoStorage, PlanStorage, db } from "./svcs/storageService";
import { EXTERNAL_RETURN_EVENT, type ExternalReturnPayload, initializeNativeAppShell, isNativeApp } from "./svcs/nativeAppService";
import { getSubscriptionTier, getUserLimits, waitForSubscriptionActive } from "./svcs/subscriptionService";
import { VideoIntelligenceService } from "./svcs/videoIntelligenceService";
import { GracePeriodBanner } from "./comps/GracePeriodBanner";
import { Menu, PanelLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import { getVideoDurationLabel } from "./utl/videoUtils";

function lazyNamed<T extends React.ComponentType<any>>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string
) {
  return lazy(async () => ({
    default: (await loader())[exportName] as T,
  }));
}

const Onboarding = lazyNamed(() => import("./comps/Onboarding"), "Onboarding");
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
const DEV_BOOTSTRAP_LOGS = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

type DataSyncPhase = "idle" | "loading-local" | "syncing" | "hydrating" | "offline" | "error";

type DataSyncState = {
  phase: DataSyncPhase;
  source: "none" | "memory" | "local" | "server" | "cache";
  message: string;
  requestId: number;
  userId?: string;
  error?: string;
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

  const handle = window.setTimeout(task, timeout);
  return () => window.clearTimeout(handle);
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
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
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
  const [coachGlobalUsage, setCoachGlobalUsage] = useState<{ videosUsed: number, videosLimit: number, pdfsUsed: number, pdfsLimit: number } | null>(null);
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
  const pendingRepairCleanupRef = useRef<(() => void) | null>(null);

  const userLimits = useMemo(() => {
    const tier = currentUser?.profile?.subscriptionTier || 'FREE';
    return getUserLimits(tier);
  }, [currentUser]);

  const activeAnalysisProfile = useMemo(() => {
    if (!currentUser?.profile) return undefined;
    if (!viewedUserId || viewedUserId === currentUser.id) return currentUser.profile;
    return managedAthletes.find((athlete) => athlete.id === viewedUserId)?.profile || currentUser.profile;
  }, [currentUser, managedAthletes, viewedUserId]);

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

      const user = StorageService.getCurrentUser();
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
    if (!currentUser) return;

    const delay = currentScreen === "gallery" || currentScreen === "analyzer" ? 120 : 1800;

    return scheduleIdleTask(() => {
      void import("./hks/usePoseDetection").then((module) => {
        void module.preloadPoseModel();
      });
    }, delay);
  }, [currentScreen, currentUser]);

  useEffect(() => {
    const isPublicHome = !currentUser && showLanding;
    const title = isPublicHome
      ? "App de entrenamiento con IA para analizar vídeos, técnica y progreso | CoachAI"
      : currentUser
        ? "CoachAI | Área privada"
        : "Acceso a CoachAI";
    const description = isPublicHome
      ? "CoachAI es una app de entrenamiento con IA para analizar vídeos, mejorar técnica, registrar marcas personales y seguir progreso deportivo."
      : "Área autenticada de CoachAI. Esta experiencia no debe indexarse.";
    const robotsValue = isPublicHome
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,nofollow,noarchive";

    document.title = title;

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
  }, [currentUser, showLanding]);

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
      
      // If coach, fetch global quota usage
      if (userData.profile?.role === 'coach') {
        refreshCoachGlobalUsage();
      }
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
    if (user.profile?.subscriptionTier !== 'FREE') {
      setGracePeriodInfo(null);
      return;
    }

    const FREE_MAX_VIDEOS = 3;
    const FREE_MAX_PDFS = 3;

    const currentVideoCount = videos.length;
    const currentPdfCount = plans.length;

    const isVideoOver = currentVideoCount > FREE_MAX_VIDEOS;
    const isPdfOver = currentPdfCount > FREE_MAX_PDFS;

    if (isVideoOver || isPdfOver) {
      let deadlineStr = user.profile?.gracePeriodDeadline;

      if (!deadlineStr) {
        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 3);
        deadlineStr = deadlineDate.toISOString();

        const updatedProfile = { ...user.profile!, gracePeriodDeadline: deadlineStr };
        await StorageService.updateUserProfile(user.id, updatedProfile);
        setCurrentUser({ ...user, profile: updatedProfile });
      }

      const deadline = new Date(deadlineStr);
      const now = new Date();
      const diffMs = deadline.getTime() - now.getTime();

      if (diffMs <= 0) {
        try {
          await StorageService.deleteCurrentAccount();
          await handleLogout();
          setFatalError("El periodo de gracia ha terminado. Tu cuenta ha sido eliminada permanentemente por exceder los límites del plan gratuito.");
          return;
        } catch (e) {
          setGracePeriodInfo({ deadline, isExpired: true, remainingText: "Eliminando cuenta..." });
        }
      } else {
        let remainingText = "";
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
          remainingText = `${days} días y ${hours} horas restantes`;
        } else {
          remainingText = `${hours}h ${minutes}m restantes`;
        }

        setGracePeriodInfo({ deadline, isExpired: false, remainingText });
      }
    } else {
      if (user.profile?.gracePeriodDeadline) {
        const updatedProfile = { ...user.profile!, gracePeriodDeadline: undefined };
        await StorageService.updateUserProfile(user.id, updatedProfile);
        setCurrentUser({ ...user, profile: updatedProfile });
      }
      setGracePeriodInfo(null);
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

      // --- PLAN DETERMINATION LOGIC ---
      if (user.username.toLowerCase() === 'fernandezeuken@gmail.com') {
        tier = 'PREMIUM';
      }
      // Test accounts always use the hardcoded logic regardless of cloud mode
      else if (user.id.startsWith('test-')) {
        tier = await getSubscriptionTier(user.id, user.email || user.username);
      }
      // Real accounts use cloud subscription check
      else if (StorageService.isCloudMode()) {
        if (isPaymentSuccess) {
          tier = await waitForSubscriptionActive(user.id, user.email || user.username);
          if (tier !== 'FREE') {
            setPaymentMessage({ type: 'success', text: `¡Pago confirmado!` });
          }
        } else {
          tier = await getSubscriptionTier(user.id, user.email || user.username);
        }
      }

      const userWithTier: User = {
        ...user,
        profile: user.profile ? { ...user.profile, subscriptionTier: tier } : undefined
      };

      setCurrentUser(userWithTier);
      setIsProcessingPayment(false);

      if (userWithTier.profile?.role === "admin") {
        setCurrentScreen("admin_panel");
        return;
      }

      if (!userWithTier.profile) {
        setCurrentScreen("onboarding");
        return;
      }

      setViewedUserId(userWithTier.id);

      // Fetch fresh managedAthletes from Firestore for coaches (not from stale profile)
      if (userWithTier.profile.role === "coach") {
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
          if (userWithTier.profile.managedAthletes) {
            const athletes = await StorageService.getManagedAthletes(userWithTier.profile.managedAthletes);
            setManagedAthletes(athletes);
          } else {
            setManagedAthletes([]);
          }
        }
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

  const refreshCoachGlobalUsage = async () => {
    try {
      const usage = await StorageService.getCoachQuotaUsage();
      if (usage) setCoachGlobalUsage(usage);
    } catch (e) {
      console.warn("Failed to fetch coach global usage", e);
    }
  };

  const handleLogout = async () => {
    try {
      pendingRepairCleanupRef.current?.();
      bootstrapLoadRef.current = {
        requestId: bootstrapLoadRef.current.requestId + 1,
        userId: null,
        promise: null,
      };
      await StorageService.logout();
      setCurrentUser(null);
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
    setVideos(
      (data.videos || []).map((video) => ({
        ...video,
        url: "",
        isLocal: false,
        ownerId: video.ownerId || targetId,
      }))
    );
    setPlans(
      (data.plans || []).map((plan) => ({
        ...plan,
        url: "",
        file: undefined,
        isLocal: false,
        ownerId: plan.ownerId || targetId,
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

  const hydrateVideosForBootstrap = async (targetId: string, requestId: number, loadedVideos: VideoFile[]) => {
    const finish = startBootstrapTrace("hydrate-videos", {
      targetId,
      requestId,
      count: loadedVideos.length,
    });

    const batchSize = 3;
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
              ownerId: video.ownerId || targetId,
              status: video.status || "ready",
            };
          }

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
                ownerId: video.ownerId || targetId,
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
                ownerId: video.ownerId || targetId,
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
            ownerId: video.ownerId || targetId,
            status: video.status || "error",
            errorCode: video.errorCode || "storage/object-not-found",
            errorMessage: video.errorMessage || "No se ha podido localizar el video en Firebase Storage.",
          };
        })
      );

      hydrated.push(...batchResults);
      if (bootstrapLoadRef.current.requestId === requestId && bootstrapLoadRef.current.userId === targetId) {
        setVideos([...hydrated]);
      }
    }

    finish({ repaired: repairedVideos.length });
    return { hydrated, repairedVideos };
  };

  const hydratePlansForBootstrap = async (targetId: string, requestId: number, loadedPlans: PlanFile[]) => {
    const finish = startBootstrapTrace("hydrate-plans", {
      targetId,
      requestId,
      count: loadedPlans.length,
    });

    const hydrated = await Promise.all(
      loadedPlans.map(async (plan) => {
        const blob = await PlanStorage.getPlan(plan.id);
        if (blob) {
          return {
            ...plan,
            url: URL.createObjectURL(blob),
            file: blob as any,
            isLocal: true,
            contentType: plan.contentType || blob.type || undefined,
            size: plan.size || blob.size,
            ownerId: plan.ownerId || targetId,
            status: plan.status || "ready",
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
              ownerId: plan.ownerId || targetId,
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
              ownerId: plan.ownerId || targetId,
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
          ownerId: plan.ownerId || targetId,
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

  const handleUploadVideo = async (file: File, thumbnail: string) => {
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

    const monthlyAnalysisLimit = userLimits.maxAnalysisPerMonth;
    const storedVideoLimit = isCoach && coachGlobalUsage
      ? coachGlobalUsage.videosLimit
      : userLimits.maxStoredVideos;

    // Check monthly analysis limit
    if (effectiveUsage.analysisCount >= monthlyAnalysisLimit) {
      alert(language === 'ing'
        ? 'You have reached your monthly analysis limit. Upgrade your plan or wait for the reset.'
        : language === 'eus'
          ? 'Hileko analisi muga gainditu duzu. Zure plana hobetu edo berrezarpena itxaron.'
          : 'Has alcanzado el límite mensual de análisis. Mejora tu plan o espera al reseteo.');
      return;
    }

    // Check TOTAL video storage limit - must delete old videos before uploading new ones
    if (videos.length >= storedVideoLimit) {
      alert(language === 'ing'
        ? `You have ${storedVideoLimit} videos stored (maximum allowed). Delete some videos before uploading new ones.`
        : language === 'eus'
          ? `${storedVideoLimit} bideo gordeta dituzu (gehienezko baimena). Ezabatu bideo batzuk berriak igo aurretik.`
          : `Tienes ${storedVideoLimit} vídeos guardados (máximo permitido). Elimina algunos vídeos antes de subir nuevos.`);
      return;
    }

    const newId = Date.now().toString();
    const storagePath = StorageService.buildVideoStoragePath(viewedUserId, newId, file.name);
    const durationLabel = await getVideoDurationLabel(file);
    const localDisplayUrl = URL.createObjectURL(file);
    const createdAt = new Date().toISOString();
    const browserCanPlaySelectedType = StorageService.canPlayVideoContentType(file.type);
    const initialPlaybackStatus = durationLabel
      ? 'playable'
      : browserCanPlaySelectedType === false
        ? 'unplayable'
        : 'unknown';
    const initialPlaybackError = initialPlaybackStatus === 'unplayable'
      ? 'El archivo se ha subido, pero este navegador no puede reproducir este formato.'
      : undefined;

    const videoForState: VideoFile = {
      id: newId,
      url: localDisplayUrl,
      thumbnail,
      name: file.name,
      date: new Date().toLocaleDateString() + ", " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: durationLabel || "00:00",
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

    let cloudUrl = "";
    let uploadResult: Awaited<ReturnType<typeof StorageService.uploadVideoFile>> = null;
    try {
      // OPTIMIZATION 1: Parallelize local save and cloud upload (independent operations)
      if (StorageService.isCloudMode() && viewedUserId !== 'MASTER_GOD_EUKEN') {
        [, uploadResult] = await Promise.all([
          VideoStorage.saveVideo(newId, file),
          StorageService.uploadVideoFile(viewedUserId, file, storagePath)
        ]);
        cloudUrl = uploadResult?.downloadURL || "";
      } else {
        await VideoStorage.saveVideo(newId, file);
      }

      if (StorageService.isCloudMode() && !uploadResult?.downloadURL) {
        throw new Error("Cloud upload failed");
      }

      const videoForDb: VideoFile = {
        ...videoForState,
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
      };

      // V3 Authoritative Video Storage (Backend verifies global coach quota)
      const success = await StorageService.addVideoSafe(viewedUserId, videoForDb);

      if (!success) {
        throw new Error("Límite de vídeos del plan excedido.");
      }
      
      // Refresh global quota after successful upload
      if (isCoach) refreshCoachGlobalUsage();

      // Only increment AI analysis counter if video wasn't deleted during upload
      if (uploadingVideosRef.current.has(newId)) {
        const payerId = isCoach ? currentUser.id : viewedUserId;
        await StorageService.incrementUsage(payerId, 'analysis');

        if (isCoach) {
          setMyUsage(prev => prev ? { ...prev, analysisCount: prev.analysisCount + 1 } : prev);
        } else {
          setUsage(prev => prev ? { ...prev, analysisCount: prev.analysisCount + 1 } : prev);
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
      uploadingVideosRef.current.delete(newId);
      if (cloudUrl) {
        await StorageService.deleteFileFromCloud(cloudUrl);
      }
      await VideoStorage.deleteVideo(newId).catch(() => {});
      revokeObjectUrlMaybe(localDisplayUrl);
      setVideos((prev) => prev.filter((v) => v.id !== newId));
      alert("No se pudo guardar el vídeo de forma persistente. Inténtalo de nuevo.");
    }
  };

  const handleDeleteVideo = async (id: string) => {
    if (!currentUser || !viewedUserId) return;
    const video = videos.find((v) => v.id === id);

    // If video is still uploading, remove from tracking to prevent counter increment
    // The upload will complete but won't count towards usage
    if (uploadingVideosRef.current.has(id)) {
      uploadingVideosRef.current.delete(id);
    }

    const videoCloudUrl = video?.downloadURL || video?.remoteUrl;
    if (videoCloudUrl) {
      await StorageService.deleteFileFromCloud(videoCloudUrl);
    } else if (video?.storagePath) {
      await StorageService.deleteFileByPath(video.storagePath);
    }
    await VideoStorage.deleteVideo(id);
    revokeObjectUrlMaybe(video?.url);
    const updatedVideos = videos.filter((v) => v.id !== id);
    setVideos(updatedVideos);
    await StorageService.deleteVideoSafe(viewedUserId, id);
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

    const planLimit = userLimits.maxPdfUploads;
    if ((effectiveUsage.plansCount || 0) >= planLimit) return;

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

      const success = await StorageService.addPdfSafe(viewedUserId, pdfForDb);
      if (!success) {
        throw new Error("Límite de PDFs del plan excedido.");
      }
      
      if (isCoach) refreshCoachGlobalUsage();

      // Increment logic for AI/App usage analytics
      const payerId = isCoach ? currentUser.id : viewedUserId;
      await StorageService.incrementUsage(payerId, 'plan');

      if (isCoach) {
        setMyUsage(prev => prev ? { ...prev, plansCount: (prev.plansCount || 0) + 1 } : prev);
      } else {
        setUsage(prev => prev ? { ...prev, plansCount: (prev.plansCount || 0) + 1 } : prev);
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
        await StorageService.deleteFileFromCloud(cloudUrl);
      }
      await PlanStorage.deletePlan(id).catch(() => {});
      revokeObjectUrlMaybe(planForState.url);
      setPlans((prev) => prev.filter(p => p.id !== id));
      alert("Error al subir el archivo. Inténtalo de nuevo.");
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!viewedUserId) return;
    const plan = plans.find(p => p.id === id);
    const planCloudUrl = plan?.downloadURL || plan?.remoteUrl;
    if (planCloudUrl) {
      await StorageService.deleteFileFromCloud(planCloudUrl);
    } else if (plan?.storagePath) {
      await StorageService.deleteFileByPath(plan.storagePath);
    }
    await PlanStorage.deletePlan(id);
    revokeObjectUrlMaybe(plan?.url);
    const updated = plans.filter(p => p.id !== id);
    setPlans(updated);
    await StorageService.deletePlanSafe(viewedUserId, id);
  };

  const handleIncrementChat = async () => {
    if (currentUser && viewedUserId) {
      // Coach chat quota applies to Coach. Athlete quota to Athlete.
      const isCoach = currentUser.profile?.role === 'coach';
      const payerId = isCoach ? currentUser.id : viewedUserId;

      await StorageService.incrementUsage(payerId, 'chat');

      // Optimistic local state update (no re-fetch needed)
      if (isCoach) {
        setMyUsage(prev => prev ? { ...prev, chatCount: (prev.chatCount || 0) + 1 } : prev);
      } else {
        setUsage(prev => prev ? { ...prev, chatCount: (prev.chatCount || 0) + 1 } : prev);
      }
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
        <Onboarding user={currentUser} onComplete={(u) => handleLogin(u)} language={language} />
      </Suspense>
    );
  }

  // Logic for display-only stats (Global if Coach active)
  const isCoachView = currentUser?.profile?.role === 'coach';
  const finalUserLimits = { ...userLimits };
  if (isCoachView && coachGlobalUsage) {
    // Override with backend-authoritative global limits
    finalUserLimits.maxStoredVideos = coachGlobalUsage.videosLimit;
    finalUserLimits.maxPdfUploads = coachGlobalUsage.pdfsLimit;
  }

  // Gallery video count override for coach
  const galleryVideoCount = (isCoachView && coachGlobalUsage) ? coachGlobalUsage.videosUsed : videos.length;
  // PlanGallery count override
  const galleryPlanCount = (isCoachView && coachGlobalUsage) ? coachGlobalUsage.pdfsUsed : plans.length;

  const displayedUsage = isCoach ? myUsage : usage;
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

  const showDataSyncIndicator = (
    dataSyncState.phase === "loading-local"
    || dataSyncState.phase === "syncing"
    || dataSyncState.phase === "hydrating"
  );

  return (
    <div className="native-app-shell flex min-h-screen h-[100dvh] w-full bg-black text-white overflow-hidden transition-colors duration-300">
      {paymentMessage && (
        <div className={`fixed safe-top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-top-4 duration-500 ${paymentMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {paymentMessage.type === 'success' ? <CheckCircle size={24} /> : <XCircle size={24} />}
          <p className="font-bold text-sm md:text-base">{paymentMessage.text}</p>
          <button onClick={() => setPaymentMessage(null)} className="ml-2 hover:bg-white/20 p-1 rounded"><XCircle size={16} /></button>
        </div>
      )}

      {gracePeriodInfo && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-red-900/50 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle size={40} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">LÍMITE EXCEDIDO</h2>
              <p className="text-neutral-300 mb-6">Has cancelado tu suscripción pero tienes más elementos de los permitidos. Regulariza tu cuenta antes de que expire el tiempo.</p>
              {!gracePeriodInfo.isExpired && (
                <div className="flex items-center gap-2 text-orange-400 bg-orange-900/20 px-4 py-2 rounded-lg mb-6 border border-orange-500/20">
                  <Clock size={18} /><span className="font-mono font-bold">{gracePeriodInfo.remainingText}</span>
                </div>
              )}
              <div className="flex flex-col gap-3 w-full">
                <button onClick={() => navigateTo('pricing')} className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors">Mejorar Plan</button>
                <div className="flex gap-3">
                  <button onClick={() => { navigateTo('gallery'); setGracePeriodInfo(null); }} className="flex-1 py-3 bg-red-900/30 text-red-400 font-bold rounded-xl hover:bg-red-900/50 border border-red-800 transition-colors">Borrar Vídeos</button>
                  <button onClick={() => { navigateTo('planning'); setGracePeriodInfo(null); }} className="flex-1 py-3 bg-red-900/30 text-red-400 font-bold rounded-xl hover:bg-red-900/50 border border-red-800 transition-colors">Borrar PDFs</button>
                </div>
              </div>
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
              <span>Sincronizando...</span>
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
            {currentScreen === "gallery" && <Gallery videos={videos} overrideCount={isCoachView ? galleryVideoCount : undefined} onSelectVideo={(v) => { setSelectedVideo(v); setCurrentScreen("analyzer"); }} onUpload={handleUploadVideo} onDelete={handleDeleteVideo} language={language} usage={displayedUsage} limits={finalUserLimits} onNavigate={navigateTo} />}
            {currentScreen === "analyzer" && selectedVideo && <VideoAnalyzer video={selectedVideo} targetUserId={viewedUserId!} onBack={() => navigateTo("gallery")} usage={displayedUsage} limits={finalUserLimits} onIncrementUsage={handleIncrementChat} language={language} onNavigate={navigateTo} userProfile={activeAnalysisProfile} />}
            {currentScreen === "planning" && <PlanGallery plans={plans} overrideCount={isCoachView ? galleryPlanCount : undefined} onSelectPlan={(p) => { setSelectedPlan(p); setCurrentScreen("planViewer"); }} onUpload={handleUploadPlan} onDelete={handleDeletePlan} language={language} usage={displayedUsage} limits={finalUserLimits} onNavigate={navigateTo} />}
            {currentScreen === "planViewer" && selectedPlan && <PdfViewer plan={selectedPlan} onBack={() => navigateTo("planning")} />}
            {currentScreen === "strength" && <StrengthTracker records={strengthRecords} onAddRecord={handleAddStrength} onDeleteRecord={handleDeleteStrength} exercises={customExercises} onUpdateExercises={(e) => { setCustomExercises(e); void StorageService.updateCustomExercises(viewedUserId!, e); }} language={language} />}
            {currentScreen === "competition" && <JavelinTracker profile={currentUser.profile!} records={competitionRecords} onAddRecord={handleAddCompetition} onDeleteRecord={handleDeleteCompetition} language={language} />}
            {currentScreen === "training" && <TrainingTracker profile={currentUser.profile!} records={trainingRecords} onAddRecord={handleAddTraining} onDeleteRecord={handleDeleteTraining} language={language} />}
            {currentScreen === "matches" && <MatchTracker profile={currentUser.profile!} records={matchRecords} onAddRecord={handleAddMatch} onDeleteRecord={handleDeleteMatch} language={language} />}
            {currentScreen === "calculator" && <PlateCalculator language={language} />}
            {currentScreen === "supplements" && <SupplementsTracker supplements={supplements} onUpdate={handleUpdateSupplements} language={language} />}
            {currentScreen === "coach" && <CoachChat language={language} usage={displayedUsage} limits={finalUserLimits} onMessageSent={handleIncrementChat} />}
            {currentScreen === "team_management" && <CoachTeamManagement currentUser={currentUser} onSelectAthlete={handleSwitchAthlete} activeAthleteId={viewedUserId} language={language} onAthleteRemoved={(athleteId) => setManagedAthletes(prev => prev.filter(a => a.id !== athleteId))} />}
            {currentScreen === "pricing" && <PricingSection currentUser={currentUser} language={language} />}
            {currentScreen === "profile" && <Profile currentUser={currentUser} onUpdateUser={setCurrentUser} onLogout={handleLogout} language={language} onRefreshData={() => { if (viewedUserId) void loadDataForUser(viewedUserId, { force: true, reason: "profile-refresh" }); }} />}
            {currentScreen === "app_downloads" && <AppDownloads language={language} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
