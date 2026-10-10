/** Native datetime-local inputs use device-local time, never a sliced UTC ISO string. */
export function toLocalWorkoutTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isLocalWorkoutTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && toLocalWorkoutTime(date) === value;
}

export function resolveWorkoutTimestamp(value: string | null, now = new Date()): string {
  if (value === null) return now.toISOString();
  if (!isLocalWorkoutTime(value)) throw new Error('请选择有效的训练日期和时间。');
  const date = new Date(value);
  if (date.getTime() > now.getTime()) throw new Error('训练时间不能晚于当前时间。');
  return date.toISOString();
}
