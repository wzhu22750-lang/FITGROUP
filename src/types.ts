export enum WorkoutCategory {
  Shoulders = "Shoulders",
  Chest = "Chest",
  Back = "Back",
  Legs = "Legs",
  Cardio = "Cardio",
  Others = "Others"
}

export interface Exercise {
  id: string;
  name: string;
  weight?: number; // kg
  sets?: number;
  reps?: number;
  duration?: number; // minutes
  distance?: number; // km
  calories?: number;
  /** Whether calories were user-entered or generated from MET; omitted means legacy data. */
  caloriesSource?: 'reported' | 'estimated';
  type: 'strength' | 'cardio';
}

export type WorkoutVisibility = 'public' | 'friends' | 'private';

export interface WorkoutLog {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  timestamp: string;
  category: WorkoutCategory | string;
  categories?: WorkoutCategory[];
  exercises: Exercise[];
  photoUrl?: string;
  note?: string;
  likesCount: number;
  commentsCount: number;
  /** Current user's like state when loaded in a feed; omitted when not requested. */
  isLiked?: boolean;
  visibility?: WorkoutVisibility;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  maxMembers: number;
  createdAt: string;
  memberCount?: number;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  profile?: {
    displayName: string;
    photoURL: string;
    streak: number;
    totalWorkouts: number;
    lastWorkoutDate?: string;
  };
  hasCheckedInToday?: boolean;
  todayWorkoutCount?: number;
}

export interface WeeklyChallengeMemberProgress {
  userId: string;
  displayName: string;
  photoURL?: string;
  activeDaysCount: number; // Distinct training calendar days this week
  targetDays: number; // e.g. 3 days per week
  isTargetMet: boolean;
  activeDates: string[]; // e.g. ['2026-10-12', '2026-10-14']
}

export interface WeeklyTeamChallenge {
  weekKey: string; // e.g. '2026-W41'
  weekStartDate: string; // ISO date of Monday 00:00:00
  weekEndDate: string; // ISO date of Sunday 23:59:59
  memberTargetDays: number; // e.g. 3 days
  teamTargetActiveDays: number; // memberCount * memberTargetDays
  currentTeamActiveDays: number; // Sum of distinct active days across all members
  completionRate: number; // Percentage (0-100)
  membersProgress: WeeklyChallengeMemberProgress[];
  mvpMember?: WeeklyChallengeMemberProgress;
  activeMembersCount: number;
}

export interface TeamDashboardData {
  team: Team;
  members: TeamMember[];
  todayCheckinCount: number;
  totalMembers: number;
  attendanceRate: number; // Percentage (e.g. 75)
  weeklyChallenge?: WeeklyTeamChallenge;
}

export type Sex = 'male' | 'female';

export interface StrengthBodyContext {
  sex: Sex;
  bodyweightKg: number;
}

export interface CardioMetrics {
  validSessions: number;
  activeDays: number;
  activeWeeks: number;
  effectiveMinutes: number;
  weightedMinutes: number;
  weeklyEffectiveMinutes: number;
  weeklyWeightedMinutes: number;
  weeklySessions: number;
  averageMet: number;
  reportedCalories: number;
  estimatedCalories: number;
  calories: number;
  calorieTarget: number;
  calorieCompletionRate: number;
  bestActivityName?: string;
}

export interface CardioScoreBreakdown extends CardioMetrics {
  score: number;
  frequencyScore: number;
  durationScore: number;
  intensityScore: number;
  volumeScore: number;
  consistencyScore: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  phone: string;
  streak: number;
  lastWorkoutDate?: string;
  totalWorkouts: number;
  prs: Record<string, number>; // exerciseName: weight
  sex?: Sex | null;
  bodyweightKg?: number | null;
  heightCm?: number | null;
  bodyMetricsUpdatedAt?: string | null;
}

export type NotificationType = 'like' | 'comment';

export interface AppNotification {
  id: string;
  userId: string;
  actorId: string;
  actorName: string;
  actorPhoto?: string;
  type: NotificationType;
  logId: string;
  content?: string;
  logCategory?: string;
  isRead: boolean;
  createdAt: string;
}

export type FeedbackType = 'bug' | 'feature' | 'exercise' | 'other';
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved';

export interface UserFeedback {
  id: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  type: FeedbackType;
  content: string;
  contact?: string;
  status: FeedbackStatus;
  createdAt: string;
}
