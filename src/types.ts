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

export interface TeamDashboardData {
  team: Team;
  members: TeamMember[];
  todayCheckinCount: number;
  totalMembers: number;
  attendanceRate: number; // Percentage (e.g. 75)
}

export type Sex = 'male' | 'female';

export interface StrengthBodyContext {
  sex: Sex;
  bodyweightKg: number;
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



