import React, { useEffect, useMemo, useState, useRef } from "react";
import { LandingPage } from "./components/LandingPage";
import { Login } from "./components/Login";
import { Onboarding } from "./components/Onboarding";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Gallery } from "./components/Gallery";
import { VideoAnalyzer } from "./components/VideoAnalyzer";
import { StrengthTracker } from "./components/StrengthTracker";
import { JavelinTracker } from "./components/JavelinTracker";
import { TrainingTracker } from "./components/TrainingTracker";
import { MatchTracker } from "./components/MatchTracker";
import { PlanGallery } from "./components/PlanGallery";
import { PdfViewer } from "./components/PdfViewer";
import { CoachChat } from "./components/CoachChat";
import { PlateCalculator } from "./components/PlateCalculator";
import { SupplementsTracker } from "./components/SupplementsTracker";
import { AdminPanel } from "./components/AdminPanel";
import { CoachTeamManagement } from "./components/CoachTeamManagement";
import { Notifications } from "./components/Notifications";
import { PricingSection } from "./components/PricingSection";
import { Profile } from "./components/Profile";
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
import { StorageService, VideoStorage, PlanStorage, db } from "./services/storageService";
import { getSubscriptionTier, getUserLimits, waitForSubscriptionActive } from "./services/subscriptionService";
import { Menu, PanelLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

// Preload pose detection model as early as possible for instant activation
import { preloadPoseModel } from "./hooks/usePoseDetection";
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
      void loadMyUsage(currentUser.id);
    }
  }, [currentUser]);

  const loadMyUsage = async (myId: string) => {
    try {
      const data = await StorageService.getUserData(myId);
      setMyUsage(data.usage);
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

      setStrengthRecords(data.strengthRecords || []);
      setCompetitionRecords(data.competitionRecords || []);
      setTrainingRecords(data.trainingRecords || []);
      setMatchRecords(data.matchRecords || []);
      setCustomExercises(data.customExercises || []);
      setSupplements(data.supplements || []);
      setUsage(data.usage);

      const loadedVideos = data.videos || [];
      if (loadedVideos.length > 0) {
        const hydrated = await Promise.all(
          loadedVideos.map(async (v) => {
            const blob = await VideoStorage.getVideo(v.id);
            if (blob) {
              return { ...v, url: URL.createObjectURL(blob), isLocal: true };
            }
            if (v.remoteUrl) {
              return { ...v, url: v.remoteUrl, isLocal: false };
            }
            // Fallback: If no blob and no remote URL, keep existing but ensure no broken blob URL remains
            return { ...v, url: "", isLocal: false };
          })
        );
        setVideos(hydrated);
      } else {
        setVideos([]);
      }

      const loadedPlans = data.plans || [];
      if (loadedPlans.length > 0) {
        let plansUpdated = false;
        const hydrated = await Promise.all(
          loadedPlans.map(async (p) => {
            const blob = await PlanStorage.getPlan(p.id);
            if (blob) {
              return { ...p, url: URL.createObjectURL(blob), file: blob as any, isLocal: true };
            }

            if (StorageService.isCloudMode() && !blob) {
              // Try to find a valid URL in the cloud if we don't have the file locally
              const found = await StorageService.findPlanDownloadUrl(targetId, p);
              if (found?.url) {
                // If we found a new URL or it's different/better, update
                if (found.url !== p.remoteUrl) plansUpdated = true;
                return { ...p, remoteUrl: found.url, storagePath: found.path || p.storagePath, url: found.url, isLocal: false };
              }
            }

            // If we have a stored remoteUrl but verification failed (or we didn't check), fallback to it
            if (p.remoteUrl) {
              return { ...p, url: p.remoteUrl, isLocal: false };
            }

            return p;
          })
        );

        if (plansUpdated) {
          // Persist recovered URLs so the entry stops being broken for other sessions
          const sanitized = hydrated.map(plan => ({ ...plan, url: "", file: undefined }));
          await StorageService.updatePlans(targetId, sanitized);
        }

        setPlans(hydrated);
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

    const limit = userLimits.maxAnalysisPerMonth;
    if (effectiveUsage.analysisCount >= limit) return;

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

      // OPTIMIZATION 2: Use current state instead of fetching from DB (eliminates 1 query)
      const newDbList = [videoForDb, ...videos.map(v => ({ ...v, url: "" }))];

      await StorageService.updateVideos(viewedUserId, newDbList);

      // Only increment counter if video wasn't deleted during upload
      if (uploadingVideosRef.current.has(newId)) {
        // Increment logic: Coach pays for coach's uploads, Athlete pays for athlete's uploads
        const payerId = isCoach ? currentUser.id : viewedUserId;
        await StorageService.incrementUsage(payerId, 'analysis');

        // OPTIMIZATION 3: Update usage state locally instead of re-fetching (eliminates 1 query)
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
        remoteUrl: cloudUrl || undefined,
        isLocal: true,
        url: localDisplayUrl
      }));
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
    await StorageService.updateVideos(viewedUserId, updatedVideos.map(v => ({ ...v, url: "" })));
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
        // Silently keep local if it's just a cloud failure? Or revert? 
        // User requested to fix the error where it "fails silently". 
        // Let's at least keep it locally if possible, BUT if I revert, I must notify.
        // Better to revert to avoid ghost files that only the coach sees.
        throw new Error("Cloud upload failed");
      }

      // Increment logic
      const payerId = isCoach ? currentUser.id : viewedUserId;
      await StorageService.incrementUsage(payerId, 'plan');

      if (isCoach) {
        const freshCoachData = await StorageService.getUserData(currentUser.id);
        setMyUsage(freshCoachData.usage);
      } else {
        const freshAthleteData = await StorageService.getUserData(viewedUserId);
        setUsage(freshAthleteData.usage);
      }

      // Update state and DB with final data
      const planForDb: PlanFile = {
        ...planForState,
        isLocal: !cloudUrl,
        remoteUrl: cloudUrl || undefined,
        storagePath,
        // We do NOT save the file object or blob url to DB/LocalStorage string
        file: undefined,
        url: ""
      };

      const currentData = await StorageService.getUserData(viewedUserId);
      const newPlanList = [...currentData.plans, planForDb];

      await StorageService.updatePlans(viewedUserId, newPlanList);

      // Update local state to have the remoteUrl but keep the local file/url for this session
      setPlans((prev) => prev.map(p => p.id === id ? { ...p, remoteUrl: cloudUrl || undefined } : p));

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

      if (isCoach) {
        const fresh = await StorageService.getUserData(currentUser.id);
        setMyUsage(fresh.usage);
      } else {
        const fresh = await StorageService.getUserData(viewedUserId);
        setUsage(fresh.usage);
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
  const showMobileMenuButton = !['analyzer', 'planViewer'].includes(currentScreen);
  const isCoach = currentUser.profile?.role === 'coach';

  // Determine usage passed to components:
  // If I am a coach, the components should check MY limits (myUsage), not the athlete's.
  // If I am an athlete, use normal 'usage' (viewed user).
  const displayedUsage = isCoach ? myUsage : usage;

  return (
    <div className="flex h-[100dvh] w-full bg-neutral-950 text-white overflow-hidden relative">
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

      <div className={`hidden md:block h-full transition-all duration-300 ease-in-out border-r border-neutral-800 ${isSidebarVisible ? "w-64" : "w-0 overflow-hidden border-none"}`}>
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

        {showMobileMenuButton && (
          <div className="md:hidden fixed bottom-6 left-6 z-40">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-3.5 bg-neutral-900/80 backdrop-blur border border-neutral-700 rounded-full shadow-xl">
              <Menu size={24} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
          {currentScreen === "dashboard" && <Dashboard userProfile={currentUser.profile} videos={videos} strengthRecords={strengthRecords} throwRecords={competitionRecords} trainingRecords={trainingRecords} onNavigate={navigateTo} language={language} />}
          {currentScreen === "gallery" && <Gallery videos={videos} onSelectVideo={(v) => { setSelectedVideo(v); setCurrentScreen("analyzer"); }} onUpload={handleUploadVideo} onDelete={handleDeleteVideo} language={language} usage={displayedUsage} limits={userLimits} onNavigate={navigateTo} />}
          {/* Pass language to VideoAnalyzer */}
          {currentScreen === "analyzer" && selectedVideo && <VideoAnalyzer video={selectedVideo} onBack={() => navigateTo("gallery")} usage={displayedUsage} limits={userLimits} onIncrementUsage={handleIncrementChat} language={language} onNavigate={navigateTo} userProfile={currentUser.profile} />}
          {currentScreen === "planning" && <PlanGallery plans={plans} onSelectPlan={(p) => { setSelectedPlan(p); setCurrentScreen("planViewer"); }} onUpload={handleUploadPlan} onDelete={handleDeletePlan} language={language} usage={displayedUsage} limits={userLimits} onNavigate={navigateTo} />}
          {currentScreen === "planViewer" && selectedPlan && <PdfViewer plan={selectedPlan} onBack={() => navigateTo("planning")} />}
          {currentScreen === "strength" && <StrengthTracker records={strengthRecords} onAddRecord={handleAddStrength} onDeleteRecord={handleDeleteStrength} exercises={customExercises} onUpdateExercises={(e) => { setCustomExercises(e); void StorageService.updateCustomExercises(viewedUserId!, e); }} language={language} />}
          {currentScreen === "competition" && <JavelinTracker profile={currentUser.profile!} records={competitionRecords} onAddRecord={handleAddCompetition} onDeleteRecord={handleDeleteCompetition} language={language} />}
          {currentScreen === "training" && <TrainingTracker profile={currentUser.profile!} records={trainingRecords} onAddRecord={handleAddTraining} onDeleteRecord={handleDeleteTraining} language={language} />}
          {currentScreen === "matches" && <MatchTracker profile={currentUser.profile!} records={matchRecords} onAddRecord={handleAddMatch} onDeleteRecord={handleDeleteMatch} language={language} />}
          {currentScreen === "calculator" && <PlateCalculator language={language} />}
          {currentScreen === "supplements" && <SupplementsTracker supplements={supplements} onUpdate={handleUpdateSupplements} language={language} />}
          {currentScreen === "coach" && <CoachChat language={language} usage={displayedUsage} limits={userLimits} onMessageSent={handleIncrementChat} />}
          {currentScreen === "team_management" && <CoachTeamManagement currentUser={currentUser} onSelectAthlete={handleSwitchAthlete} activeAthleteId={viewedUserId} language={language} onAthleteRemoved={(athleteId) => setManagedAthletes(prev => prev.filter(a => a.id !== athleteId))} />}
          {currentScreen === "pricing" && <PricingSection currentUser={currentUser} language={language} />}
          {currentScreen === "profile" && <Profile currentUser={currentUser} onUpdateUser={setCurrentUser} onLogout={handleLogout} language={language} onRefreshData={() => loadDataForUser(viewedUserId!)} />}
        </div>
      </main>
    </div>
  );
}
