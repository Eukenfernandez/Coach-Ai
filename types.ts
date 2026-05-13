
export type Language = 'es' | 'ing' | 'eus';

export type SubscriptionTier = 'FREE' | 'PRO_ATHLETE' | 'PRO_COACH' | 'PREMIUM';

export type AssetStatus = 'uploading' | 'ready' | 'error';

export type AssetPlaybackStatus = 'unknown' | 'playable' | 'unplayable';

export interface StoredAssetMetadata {
  storagePath?: string;
  remoteUrl?: string;
  downloadURL?: string;
  contentType?: string;
  size?: number;
  createdAt?: string;
  ownerId?: string;
  status?: AssetStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface UserLimits {
  tier: SubscriptionTier;
  maxAnalysisPerMonth: number;
  maxPdfUploads: number;
  maxVideoDurationSeconds: number;
  maxStoredVideos: number; // New: Limit of videos in gallery
  maxChatMessagesPerMonth: number | 'unlimited';
  maxManagedAthletes: number | 'unlimited';
  canCompareVideos: boolean; // New: Limit comparison
  canUseDeepAnalysis: boolean; // New: For Premium Gemini 3 Pro
}

export interface VideoAnalysisResult {
  feedback: string;
  score: number;
  timestamp: number;
  drawingPoints?: any[];
}

export interface VideoFile extends StoredAssetMetadata {
  id: string;
  url: string;
  thumbnail?: string;
  name: string;
  date: string;
  duration?: string;
  isLocal?: boolean;
  isUploading?: boolean;
  playbackStatus?: AssetPlaybackStatus;
  analysis?: VideoAnalysisResult;
  processingStatus?: VideoContextStatus;
  contextVersion?: string;
  lastContextUpdatedAt?: string;
}

export interface PlanFile extends StoredAssetMetadata {
  id: string;
  name: string;
  date: string;
  url?: string;
  file?: File | Blob;
  isLocal?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  contextTrace?: VideoResponseTrace;
  contextSummary?: string;
  activeTimestampSeconds?: number | null;
  mode?: VideoQuestionMode;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type VideoContextStatus =
  | 'not_started'
  | 'queued'
  | 'sampling'
  | 'summarizing'
  | 'partial'
  | 'ready'
  | 'failed';

export type VideoQuestionMode = 'frame' | 'range' | 'summary';

export type VideoContextSource =
  | 'global_summary'
  | 'active_segment'
  | 'adjacent_segments'
  | 'semantic_segments'
  | 'key_moments'
  | 'current_frame'
  | 'window_frames'
  | 'chat_history'
  | 'biomechanics_rules'
  | 'pose_snapshot'
  | 'fallback_only';

export interface VideoTechnicalMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  estimatedFps?: number | null;
  frameCountEstimate?: number | null;
  aspectRatio?: number | null;
  orientation: 'landscape' | 'portrait' | 'square';
  mimeType?: string;
  sizeBytes?: number;
}

export interface VideoFrameArtifact {
  timestampSeconds: number;
  label: string;
  base64Jpeg: string;
  width: number;
  height: number;
}

export interface VideoSegmentPlan {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  representativeTimeSeconds: number;
  label: string;
}

export interface VideoPoseSnapshot {
  source: 'mediapipe';
  joints: Record<string, { x: number; y: number; visibility?: number }>;
}

export interface VideoSegmentContext {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  representativeTimeSeconds: number;
  phaseLabel: string;
  summary: string;
  visibleObservations: string[];
  technicalFocus: string[];
  probableErrors: string[];
  coachingCues: string[];
  confidence: ConfidenceLevel;
  embedding?: number[];
}

export interface VideoKeyMoment {
  id: string;
  timestampSeconds: number;
  label: string;
  note: string;
  phaseLabel?: string;
  confidence: ConfidenceLevel;
}

export interface VideoContextDoc {
  videoId: string;
  userId: string;
  status: VideoContextStatus;
  processingVersion: string;
  processingStage?: string;
  lastError?: string | null;
  metadata?: VideoTechnicalMetadata;
  sport?: string;
  discipline?: string;
  globalSummary?: string;
  globalTechnicalAssessment?: string;
  timelineSummary?: string[];
  keyMoments?: VideoKeyMoment[];
  segmentCount?: number;
  sampledFrameTimestamps?: number[];
  recommendedQuestions?: string[];
  updatedAt?: string;
  createdAt?: string;
}

export interface VideoResponseTrace {
  processingStatus: VideoContextStatus;
  activeTimestampSeconds?: number | null;
  windowRangeSeconds?: { start: number; end: number } | null;
  windowFrameTimestamps?: number[];
  activeSegmentId?: string | null;
  adjacentSegmentIds?: string[];
  semanticSegmentIds?: string[];
  keyMomentIds?: string[];
  contextSources: VideoContextSource[];
  contextSummaryLabel: string;
}

export interface StructuredVideoAnswer {
  momentOfGesture: string;
  phase: string;
  visibleObservations: string[];
  technicalEvaluation: string[];
  probableErrorsOrRisks: string[];
  recommendations: string[];
  confidence: ConfidenceLevel;
  visualLimitations: string[];
  probableInferences?: string[];
}

export interface VideoChatResponse {
  sessionId: string;
  answer: string;
  structured: StructuredVideoAnswer;
  trace: VideoResponseTrace;
}

export interface StrengthRecord {
  id: string;
  date: string;
  exercise: string;
  weight: number;
}

export interface ThrowRecord {
  id: string;
  date: string;
  location: string;
  distance: number;
}

// Match record for team sports (soccer, basketball, etc.)
export interface MatchRecord {
  id: string;
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: 'win' | 'draw' | 'loss';
  competition?: string;
  notes?: string;
}

// Sport category constants
export const TEAM_SPORTS = ['soccer', 'basketball', 'rugby_football', 'baseball'];
export const NON_COMPETITIVE_SPORTS = ['gym'];
// Sports where gym/weight training is relevant (includes gym itself + combat sports + athletics for strength training)
export const GYM_RELATED_SPORTS = ['gym', 'combat', 'athletics', 'rugby_football'];

// === SPORT METRIC CONFIGURATION ===
// Disciplines where the metric is TIME (lower is better)
export const TIME_BASED_DISCIPLINES = [
  // Sprint distances
  '60m', '100m', '200m', '400m',
  // Middle distance
  '800m', '1500m', '3000m', '5000m', '10000m',
  // Long distance running
  'Media Maratón', 'Maratón', 'Ultramaratón', 'Cross Country', 'Trail Running', 'Running',
  // Hurdles
  '60m Vallas', '100m Vallas', '110m Vallas', '400m Vallas', '3000m Obst.',
  // Other timed events
  'Marcha', 'Relevos',
  // Swimming
  'Natación', 'Aguas Abiertas',
  // Cycling
  'Ruta', 'MTB XC', 'MTB Downhill', 'Pista', 'BMX', 'Triatlón', 'Duatlón', 'Gravel',
  // Rowing/Kayak
  'Remo', 'Piragüismo'
];

// Disciplines where the metric is DISTANCE/HEIGHT (higher is better)
export const DISTANCE_BASED_DISCIPLINES = [
  // Jumps
  'Salto Longitud', 'Triple Salto', 'Salto Altura', 'Pértiga',
  // Throws
  'Lanz. Peso', 'Lanz. Disco', 'Lanz. Jabalina', 'Lanz. Martillo',
  // Combined events (treated as points, but stored same way)
  'Decatlón', 'Heptatlón',
  // Golf (lower is better but uses strokes)
  'Golf'
];

// Helper function to check if a discipline uses time-based metrics
export const isTimeBased = (discipline: string): boolean => {
  return TIME_BASED_DISCIPLINES.some(d =>
    discipline.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(discipline.toLowerCase())
  );
};

// Helper function to check if a discipline uses distance-based metrics  
export const isDistanceBased = (discipline: string): boolean => {
  return DISTANCE_BASED_DISCIPLINES.some(d =>
    discipline.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(discipline.toLowerCase())
  );
};

// Get the appropriate unit for a discipline
export const getMetricUnit = (discipline: string): string => {
  if (isTimeBased(discipline)) return 's';
  if (isDistanceBased(discipline)) return 'm';
  return ''; // No unit for team sports, etc.
};

// Get whether "best" means minimum (time) or maximum (distance)
export const isBestMinimum = (discipline: string): boolean => {
  return isTimeBased(discipline);
};

export type SportType = string;

export interface UserProfile {
  firstName: string;
  lastName: string;
  age: number;
  height?: number; // cm
  weight?: number; // kg
  gender?: 'male' | 'female' | 'other';
  role: 'athlete' | 'coach' | 'admin';
  sport: SportType;
  discipline: string;
  takesSupplements?: boolean;
  managedAthletes?: string[];
  coaches?: string[];
  subscriptionTier?: SubscriptionTier;
  gracePeriodDeadline?: string;
  currentPlanId?: string; // New: Cached canonical truth mechanism
  maxStoredVideosLimit?: number; // Cached capacity
}

export type EnforcementStatus = 'COMPLIANT' | 'OVER_LIMIT_GRACE_PERIOD' | 'PENDING_ASSET_DELETION' | 'ASSET_DELETION_IN_PROGRESS' | 'PENDING_ACCOUNT_DELETION' | 'DELETION_IN_PROGRESS' | 'DELETED';

export interface AccountEnforcement {
  userId: string;
  status: EnforcementStatus;
  allowedVideoLimit: number;
  currentVideoCount: number;
  allowedPdfLimit?: number;
  currentPdfCount?: number;
  overVideoLimit?: boolean;
  overPdfLimit?: boolean;
  gracePeriodEndsAt: any; // Can be string in local, Timestamp in firebase
  lastEvaluatedAt: any; 
  reason?: string;
}

export interface InAppNotification {
  id?: string;
  userId: string;
  title: string;
  body: string;
  severity: 'warning' | 'critical' | 'info';
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface UserUsage {
  analysisCount: number;
  chatCount: number;
  plansCount: number;
  lastAnalysisReset: string; // ISO Date
  lastChatReset: string; // ISO Date
}

export interface User {
  id: string;
  username: string;
  email?: string;
  stripeId?: string;
  password?: string;
  createdAt: string;
  profile?: UserProfile;
}

export interface CoachRequest {
  id: string;
  coachId: string;
  coachName: string;
  athleteId: string; // Cannonical relationship mapping
  athleteEmail: string;
  athleteName?: string;
  athleteDiscipline?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ExerciseDef {
  name: string;
  unit: string;
}

export interface SupplementItem {
  id: string;
  name: string;
  dosage: string;
  taken: boolean;
}

export interface GalleryProps {
  language: Language;
  usage: UserUsage | null;
  limits: UserLimits;
  onResetUsage?: () => void;
  overrideCount?: number;
}

export interface PlanGalleryProps {
  plans: PlanFile[];
  onSelectPlan: (plan: PlanFile) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  onNavigate: (screen: Screen) => void;
  language: Language;
  usage: UserUsage | null;
  limits: UserLimits;
  overrideCount?: number;
}

export interface UserData {
  videos: VideoFile[];
  plans: PlanFile[];
  strengthRecords: StrengthRecord[];
  competitionRecords: ThrowRecord[];
  trainingRecords: ThrowRecord[];
  matchRecords?: MatchRecord[];
  customExercises?: ExerciseDef[];
  supplements?: SupplementItem[];
  usage: UserUsage;
}

export type Screen = 'login' | 'onboarding' | 'dashboard' | 'gallery' | 'analyzer' | 'strength' | 'competition' | 'training' | 'matches' | 'planning' | 'planViewer' | 'coach' | 'calculator' | 'supplements' | 'admin_panel' | 'team_management' | 'pricing' | 'profile' | 'app_downloads';
