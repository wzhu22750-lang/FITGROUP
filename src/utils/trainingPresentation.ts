import type { Exercise, WorkoutLog } from '../types';
import { localWorkoutDateKey } from './workoutTime';

const positive = (value?: number) => Number.isFinite(value) && value! > 0 ? value! : 0;

/** Complete-history totals and streak, using the same local dates as the calendar. */
export function summarizeWorkoutHistory(logs: WorkoutLog[], now = new Date()) {
  const valid = logs.filter(log => {
    const time = new Date(log.timestamp).getTime();
    return Number.isFinite(time) && time <= now.getTime();
  });
  const days = new Set(valid.map(log => localWorkoutDateKey(log.timestamp)));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localWorkoutDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localWorkoutDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { totalWorkouts: new Set(valid.map(log => log.id)).size, streak };
}

/** Keep duration explicitly cardio-only: strength logs do not record elapsed time. */
export function summarizeTraining(exercises: Exercise[] = []) {
  return exercises.reduce((summary, exercise) => {
    summary.actions += 1;
    if (exercise.type === 'strength') {
      summary.sets += positive(exercise.sets);
    } else if (exercise.type === 'cardio') {
      summary.cardioMinutes += positive(exercise.duration);
      summary.distance += positive(exercise.distance);
    }
    return summary;
  }, { actions: 0, sets: 0, cardioMinutes: 0, distance: 0 });
}

/** Seven local calendar days, including today; future and invalid timestamps excluded. */
export function recentTrainingDays(logs: WorkoutLog[], now = new Date()) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - index));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      date: start,
      count: logs.filter(log => {
        const time = new Date(log.timestamp).getTime();
        return time >= start.getTime() && time < end.getTime() && time <= now.getTime();
      }).length,
    };
  });
  return days;
}
