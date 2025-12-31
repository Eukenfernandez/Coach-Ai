
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
  storagePath?: string;
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
