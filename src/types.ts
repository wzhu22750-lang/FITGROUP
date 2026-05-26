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
  timestamp: any; // Firestore Timestamp
  category: WorkoutCategory;
  exercises: Exercise[];
  photoUrl?: string;
  note?: string;
  likesCount: number;
  commentsCount: number;
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
}
