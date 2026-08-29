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

