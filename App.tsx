import React, { useEffect, useMemo, useState, useRef } from "react";
import { LandingPage } from "./comps/LandingPage";
import { Login } from "./comps/Login";
import { Onboarding } from "./comps/Onboarding";
import { Sidebar } from "./comps/Sidebar";
import { Dashboard } from "./comps/Dashboard";
import { Gallery } from "./comps/Gallery";
import { VideoAnalyzer } from "./comps/VideoAnalyzer";
import { StrengthTracker } from "./comps/StrengthTracker";
import { JavelinTracker } from "./comps/JavelinTracker";
import { TrainingTracker } from "./comps/TrainingTracker";
import { MatchTracker } from "./comps/MatchTracker";
import { PlanGallery } from "./comps/PlanGallery";
import { PdfViewer } from "./comps/PdfViewer";
import { CoachChat } from "./comps/CoachChat";
import { PlateCalculator } from "./comps/PlateCalculator";
import { SupplementsTracker } from "./comps/SupplementsTracker";
import { AdminPanel } from "./comps/AdminPanel";
import { CoachTeamManagement } from "./comps/CoachTeamManagement";
import { Notifications } from "./comps/Notifications";
import { PricingSection } from "./comps/PricingSection";
import { Profile } from "./comps/Profile";
import { AppDownloads } from "./comps/AppDownloads";
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
  SupplementItem
} from "./types";
import { StorageService, VideoStorage, PlanStorage, db } from "./svcs/storageService";
import { getSubscriptionTier, getUserLimits, waitForSubscriptionActive } from "./svcs/subscriptionService";
import { VideoIntelligenceService } from "./svcs/videoIntelligenceService";
import { GracePeriodBanner } from "./comps/GracePeriodBanner";
import { Menu, PanelLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

// Preload pose detection model as early as possible for instant activation
import { preloadPoseModel } from "./hks/usePoseDetection";
preloadPoseModel();

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

export default function App() {
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [language, setLanguage] = useState<Language>("es");
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [managedAthletes, setManagedAthletes] = useState<User[]>([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [showLanding, setShowLanding] = useState(!window.location.hash.includes('login'));

  useEffect(() => {
    const handleHashChange = () => {
      setShowLanding(!window.location.hash.includes('login'));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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

  const userLimits = useMemo(() => {
    const tier = currentUser?.profile?.subscriptionTier || 'FREE';
    return getUserLimits(tier);
  }, [currentUser]);

  const activeAnalysisProfile = useMemo(() => {
    if (!currentUser?.profile) return undefined;
    if (!viewedUserId || viewedUserId === currentUser.id) return currentUser.profile;
    return managedAthletes.find((athlete) => athlete.id === viewedUserId)?.profile || currentUser.profile;
  }, [currentUser, managedAthletes, viewedUserId]);

  useEffect(() => {
    try {
      // Initialize Theme
      const savedTheme = localStorage.getItem("coachai_theme");
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }

      // Initialize Language
      const savedLang = localStorage.getItem("coachai_lang");
      if (savedLang && ['es', 'ing', 'eus'].includes(savedLang)) {
        setLanguage(savedLang as Language);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get('payment');

      if (paymentStatus === 'cancel') {
        setPaymentMessage({ type: 'error', text: 'El pago ha sido cancelado.' });
        window.history.replaceState({}, '', window.location.pathname);
      }

      const user = StorageService.getCurrentUser();
      if (user) {
        void handleLogin(user, paymentStatus === 'success');
      } else {
        setCurrentScreen("login");
      }
    } catch (e) {
      setFatalError(toErrorMessage(e));
    }
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem("coachai_lang", lang);
    } catch { }
  };

  useEffect(() => {
    if (!viewedUserId) return;
    void loadDataForUser(viewedUserId);
  }, [viewedUserId]);

  // Load MY usage whenever I log in or update
  useEffect(() => {
    if (currentUser) {
      void loadMyUsage(currentUser);
    }
  }, [currentUser]);

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
      await StorageService.logout();
      setCurrentUser(null);
      setViewedUserId(null);
      setManagedAthletes([]);
      setCurrentScreen("login");
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

  const loadDataForUser = async (targetId: string) => {
    try {
      setFatalError(null);
      setVideos((prev) => {
        prev.forEach((v) => revokeObjectUrlMaybe(v.url));
        return prev;
      });
      setPlans((prev) => {
        prev.forEach((p) => revokeObjectUrlMaybe(p.url));
        return prev;
      });

      const data = await StorageService.getUserData(targetId);

      // Set usage immediately (critical for UI)
      setUsage(data.usage);

      // Set secondary data (non-blocking, immediate)
      setStrengthRecords(data.strengthRecords || []);
      setCompetitionRecords(data.competitionRecords || []);
      setTrainingRecords(data.trainingRecords || []);
      setMatchRecords(data.matchRecords || []);
      setCustomExercises(data.customExercises || []);
      setSupplements(data.supplements || []);

      // ===== OPTIMIZED VIDEO LOADING: Progressive batches =====
      const loadedVideos = data.videos || [];
      if (loadedVideos.length > 0) {
        const batchSize = 3;
        const hydrated: VideoFile[] = [];

        for (let i = 0; i < loadedVideos.length; i += batchSize) {
          const batch = loadedVideos.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (v) => {
              const blob = await VideoStorage.getVideo(v.id);
              if (blob) {
                return { ...v, url: URL.createObjectURL(blob), isLocal: true };
              }
              if (v.remoteUrl) {
                return { ...v, url: v.remoteUrl, isLocal: false };
              }
              return { ...v, url: "", isLocal: false };
            })
          );
          hydrated.push(...batchResults);

          // Progressive update: show videos as they load
          setVideos([...hydrated]);
        }
      } else {
        setVideos([]);
      }

      // ===== DEFERRED PLAN LOADING: Lower priority =====
      const loadedPlans = data.plans || [];
      if (loadedPlans.length > 0) {
        // Use requestIdleCallback for non-critical plan hydration
        const hydratePlans = async () => {
          let plansUpdated = false;
          const hydrated = await Promise.all(
            loadedPlans.map(async (p) => {
              const blob = await PlanStorage.getPlan(p.id);
              if (blob) {
                return { ...p, url: URL.createObjectURL(blob), file: blob as any, isLocal: true };
              }

              if (StorageService.isCloudMode() && !blob) {
                const found = await StorageService.findPlanDownloadUrl(targetId, p);
                if (found?.url) {
                  if (found.url !== p.remoteUrl) plansUpdated = true;
                  return { ...p, remoteUrl: found.url, storagePath: found.path || p.storagePath, url: found.url, isLocal: false };
                }
              }

              if (p.remoteUrl) {
                return { ...p, url: p.remoteUrl, isLocal: false };
              }

              return p;
            })
          );

          if (plansUpdated) {
            const sanitized = hydrated.map(plan => ({ ...plan, url: "", file: undefined }));
            await StorageService.updatePlans(targetId, sanitized);
          }

          setPlans(hydrated);
        };

        // Use requestIdleCallback if available, otherwise setTimeout
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => hydratePlans());
        } else {
          setTimeout(hydratePlans, 50);
        }
      } else {
        setPlans([]);
      }
    } catch (e) {
      setFatalError(toErrorMessage(e));
    }
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
    const localDisplayUrl = URL.createObjectURL(file);

    const videoForState: VideoFile = {
      id: newId, url: localDisplayUrl, thumbnail, name: file.name,
      date: new Date().toLocaleDateString() + ", " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: "00:00", isLocal: true, isUploading: true
    };

    // Track this video as uploading
    uploadingVideosRef.current.add(newId);
    setVideos((prev) => [videoForState, ...prev]);

    try {
      // OPTIMIZATION 1: Parallelize local save and cloud upload (independent operations)
      let cloudUrl = "";
      if (StorageService.isCloudMode() && viewedUserId !== 'MASTER_GOD_EUKEN') {
        [, cloudUrl] = await Promise.all([
          VideoStorage.saveVideo(newId, file),
          StorageService.uploadFile(viewedUserId, file).then(url => url || "")
        ]);
      } else {
        await VideoStorage.saveVideo(newId, file);
      }

      const videoForDb: VideoFile = { ...videoForState, isLocal: !cloudUrl, isUploading: false, url: "" };
      if (cloudUrl) videoForDb.remoteUrl = cloudUrl;

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
        remoteUrl: cloudUrl || undefined,
        isLocal: true,
        url: localDisplayUrl
      }));

      void VideoIntelligenceService.prepareVideoContext({
        userId: viewedUserId,
        videoId: newId,
        videoName: file.name,
        source: file,
        remoteUrl: cloudUrl || undefined,
        language,
        userProfile: activeAnalysisProfile,
      }).catch((processingError) => {
        console.error("[Video upload] Background context processing failed", processingError);
      });
    } catch (e) {
      uploadingVideosRef.current.delete(newId);
      setVideos((prev) => prev.map((v) => (v.id === newId ? { ...v, isUploading: false } : v)));
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

    if (video?.remoteUrl) await StorageService.deleteFileFromCloud(video.remoteUrl);
    await VideoStorage.deleteVideo(id);
    revokeObjectUrlMaybe(video?.url);
    const updatedVideos = videos.filter((v) => v.id !== id);
    setVideos(updatedVideos);
    await StorageService.deleteVideoSafe(viewedUserId, id);
  };

  const handleUploadPlan = async (file: File) => {
    if (!viewedUserId || !usage || !currentUser) return;

    // Determine whose usage
    const isCoach = currentUser.profile?.role === 'coach';
    const effectiveUsage = isCoach ? myUsage : usage;
    if (!effectiveUsage) return;

    const planLimit = userLimits.maxPdfUploads;
    if ((effectiveUsage.plansCount || 0) >= planLimit) return;

    const id = Date.now().toString();
    // Sanitize filename to avoid URL issues
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `plans / ${viewedUserId}/${id}_${sanitizedName}`;

    // Optimistic update
    const planForState: PlanFile = {
      id,
      name: file.name, // Keep original name for display
      date: new Date().toLocaleDateString(),
      isLocal: true,
      file: file,
      url: URL.createObjectURL(file), // Create local URL for immediate viewing
      storagePath
    };

    setPlans((prev) => [...prev, planForState]);

    try {
      await PlanStorage.savePlan(id, file);

      // --- CLOUD UPLOAD LOGIC ---
      let cloudUrl = "";
      if (StorageService.isCloudMode() && viewedUserId !== 'MASTER_GOD_EUKEN') {
        // Use 'plans' folder or generic upload
        cloudUrl = (await StorageService.uploadFile(viewedUserId, file, 'plans', storagePath)) || "";
      }

      // If cloud upload failed in cloud mode, avoid saving a broken entry
      if (StorageService.isCloudMode() && !cloudUrl) {
        throw new Error("Cloud upload failed");
      }

      // V3: Authoritative PDF Storage (Backend verifies global coach quota)
      const pdfForDb: PlanFile = {
        ...planForState,
        isLocal: !cloudUrl,
        remoteUrl: cloudUrl || undefined,
        storagePath,
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
      setPlans((prev) => prev.map(p => p.id === id ? { ...p, remoteUrl: cloudUrl || undefined, isLocal: false } : p));

    } catch (e) {
      console.error("Error uploading plan", e);
      // Rollback state
      setPlans((prev) => prev.filter(p => p.id !== id));
      alert("Error al subir el archivo. Inténtalo de nuevo.");
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!viewedUserId) return;
    const updated = plans.filter(p => p.id !== id);
    setPlans(updated);
    await StorageService.updatePlans(viewedUserId, updated.map(p => ({ ...p, url: "", file: undefined })));
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

  if (fatalError) return (
    <div className="h-screen w-full flex items-center justify-center p-6 bg-neutral-950 text-white">
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
      <div className="h-screen w-full flex flex-col items-center justify-center bg-neutral-950 text-white gap-4">
        <Loader2 size={48} className="animate-spin text-orange-500" />
        <h2 className="text-xl font-bold">Verificando tu pago...</h2>
      </div>
    );
  }

  if (!currentUser && showLanding) return <LandingPage onContinue={() => window.location.hash = 'login'} language={language} onLanguageChange={handleLanguageChange} />;
  if (!currentUser) return <Login onLogin={(u) => handleLogin(u)} language={language} onLanguageChange={handleLanguageChange} />;
  if (currentScreen === "admin_panel") return <AdminPanel onLogout={handleLogout} />;
  // Pass language to Onboarding
  if (currentScreen === "onboarding") return <Onboarding user={currentUser} onComplete={(u) => handleLogin(u)} language={language} />;

  const isSidebarVisible = isDesktopSidebarOpen && !['analyzer', 'planViewer'].includes(currentScreen);
  const showMobileMenuButton = !['analyzer', 'planViewer', 'onboarding'].includes(currentScreen);
  const isCoach = currentUser.profile?.role === 'coach';

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

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden transition-colors duration-300">
      {paymentMessage && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-top-4 duration-500 ${paymentMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
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
            <Sidebar currentScreen={currentScreen} onNavigate={navigateTo} onLogout={handleLogout} currentUser={currentUser} managedAthletes={managedAthletes} viewedUserId={viewedUserId} onSwitchAthlete={handleSwitchAthlete} language={language} onLanguageChange={handleLanguageChange} onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={`hidden md:block transition-all duration-500 ease-in-out border-r border-neutral-200 dark:border-neutral-900 shadow-2xl z-30 ${isSidebarVisible ? 'w-80' : 'w-0 overflow-hidden opacity-0'}`}>
        <Sidebar currentScreen={currentScreen} onNavigate={navigateTo} onLogout={handleLogout} currentUser={currentUser} managedAthletes={managedAthletes} viewedUserId={viewedUserId} onSwitchAthlete={handleSwitchAthlete} language={language} onLanguageChange={handleLanguageChange} />
      </div>

      <main className="flex-1 h-full overflow-hidden relative flex flex-col">
        {showMobileMenuButton && (
          <div className="hidden md:flex absolute top-0 left-0 z-40 w-24 h-24 items-center justify-center group pointer-events-auto">
            <button onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)} className="p-2 text-neutral-400 hover:text-white bg-black/50 hover:bg-black/80 rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100 backdrop-blur-md border border-neutral-800 absolute top-4 left-4" title="Toggle Sidebar">
              <PanelLeft size={20} />
            </button>
          </div>
        )}

        <div className="absolute top-4 right-4 z-40 flex items-center gap-3"><Notifications currentUser={currentUser} onRefreshUser={() => void handleLogin(currentUser)} /></div>

        {/* Global Grace Period Banner - Highest Priority Warning */}
        <GracePeriodBanner />

        {showMobileMenuButton && (
          <div className="md:hidden fixed bottom-6 left-6 z-40">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-3.5 bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full shadow-xl">
              <Menu size={24} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
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
          {currentScreen === "profile" && <Profile currentUser={currentUser} onUpdateUser={setCurrentUser} onLogout={handleLogout} language={language} onRefreshData={() => loadDataForUser(viewedUserId!)} />}
          {currentScreen === "app_downloads" && <AppDownloads language={language} />}
        </div>
      </main>
    </div>
  );
}
