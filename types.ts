
export type Language = 'es' | 'ing' | 'eus';

export type SubscriptionTier = 'FREE' | 'PRO_ATHLETE' | 'PRO_COACH' | 'PREMIUM';

export interface UserLimits {
  tier: SubscriptionTier;
  maxAnalysisPerMonth: number;
  maxPdfUploads: number;
  maxVideoDurationSeconds: number;
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

export interface VideoFile {
  id: string;
  url: string;
  thumbnail?: string;
  name: string;
  date: string;
  duration?: string;
  isLocal?: boolean;
  isUploading?: boolean;
  remoteUrl?: string;
  analysis?: VideoAnalysisResult;
}

export interface PlanFile {
  id: string;
  name: string;
  date: string;
  url?: string;
  file?: File | Blob;
  isLocal?: boolean;
  remoteUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
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
  athleteEmail: string;
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

export type Screen = 'login' | 'onboarding' | 'dashboard' | 'gallery' | 'analyzer' | 'strength' | 'competition' | 'training' | 'matches' | 'planning' | 'planViewer' | 'coach' | 'calculator' | 'supplements' | 'admin_panel' | 'team_management' | 'pricing' | 'profile';
