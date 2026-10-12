import type { StrengthBodyContext, WorkoutLog } from '../types';
import { calculateFullWorkoutAnalytics } from './workoutAnalytics';
import { resolveLoggedStrengthPerformance, resolveBodyContext } from './strengthAssessment';

export interface StatisticsSnapshot {
  logs: WorkoutLog[];
  recentLogs: WorkoutLog[];
  history: WorkoutLog[];
  historyReady: boolean;
  historyRefreshing?: boolean;
  totalWorkouts?: number;
  updatedAt: number;
}
export interface StatisticsChange {
  eventType?: string;
  old?: Record<string, unknown>;
  new?: Record<string, unknown>;
}
interface Dependencies {
  fetch: (uid: string, options: { since?: string; before?: string; until: string; signal: AbortSignal; timeoutMs: number }) => Promise<WorkoutLog[]>;
  listen: (uid: string, change: (event: StatisticsChange) => void, reconnect: () => void) => () => void;
  now?: () => number;
  ttlMs?: number;
  historyTtlMs?: number;
}
interface Entry {
  since: string;
  snapshot?: StatisticsSnapshot;
  byId?: Map<string, WorkoutLog>;
  historyAt: number;
  dirtyHistory: boolean;
  listeners: Set<{ data: (value: StatisticsSnapshot) => void; error?: (error: Error) => void }>;
  disposeRealtime?: () => void;
  controller?: AbortController;
  flight?: Promise<void>;
  version: number;
  timer?: ReturnType<typeof setTimeout>;
}
const exerciseContent = (exercises: unknown) => JSON.stringify(exercises, ['id', 'name', 'type', 'weight', 'sets', 'reps', 'duration', 'distance', 'calories', 'caloriesSource']);
const contentEqual = (a: WorkoutLog[], b: WorkoutLog[]) => a.length === b.length && a.every((log, index) => {
  const other = b[index];
  return log.id === other.id && log.timestamp === other.timestamp && log.category === other.category && exerciseContent(log.exercises) === exerciseContent(other.exercises);
});

/** User-scoped memory cache. Never persist private training data to shared storage. */
export function createStatisticsDataStore(deps: Dependencies) {
  const entries = new Map<string, Entry>();
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlMs ?? 30_000;
  const historyTtl = deps.historyTtlMs ?? 300_000;
  const publish = (entry: Entry) => {
    if (!entry.snapshot) return;
    entry.byId = new Map(entry.snapshot.logs.map(log => [log.id, log]));
    entry.listeners.forEach(listener => listener.data(entry.snapshot!));
  };
  const cancel = (entry: Entry) => {
    entry.version++;
    entry.controller?.abort();
    entry.controller = undefined;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
  };
  const refresh = (uid: string, entry: Entry): Promise<void> => {
    if (entry.flight) return entry.flight;
    const version = ++entry.version;
    const controller = new AbortController(); entry.controller = controller;
    const until = new Date(now()).toISOString();
    const needsHistory = entry.dirtyHistory || !entry.snapshot?.historyReady || now() - entry.historyAt >= historyTtl;
    const flight = (async () => {
      try {
        // Recent data alone unlocks the first screen. Historical PRs arrive later.
        const recent = await deps.fetch(uid, { since: entry.since, until, signal: controller.signal, timeoutMs: 15_000 });
        if (version !== entry.version || controller.signal.aborted) return;
        const previous = entry.snapshot;
        const history = previous?.history ?? [];
        const recentLogs = previous && contentEqual(previous.recentLogs, recent) ? previous.recentLogs : recent;
        entry.snapshot = {
          recentLogs, history, logs: recentLogs === previous?.recentLogs ? previous.logs : [...recentLogs, ...history],
          historyReady: !!previous?.historyReady, historyRefreshing: needsHistory,
          totalWorkouts: previous?.historyReady ? recentLogs.length + history.length : undefined,
          updatedAt: now(),
        };
        publish(entry);
        if (needsHistory) {
          const older = await deps.fetch(uid, { before: entry.since, until, signal: controller.signal, timeoutMs: 60_000 });
          if (version !== entry.version || controller.signal.aborted) return;
          // Preserve the array when the server returned unchanged training data.
          const history = contentEqual(entry.snapshot.history, older) ? entry.snapshot.history : older;
          entry.historyAt = now(); entry.dirtyHistory = false;
          entry.snapshot = { ...entry.snapshot, history, logs: [...recentLogs, ...history], historyReady: true, historyRefreshing: false, totalWorkouts: recentLogs.length + history.length, updatedAt: now() };
          publish(entry);
        }
      } catch (error) {
        if (version === entry.version && !controller.signal.aborted) entry.listeners.forEach(listener => listener.error?.(error instanceof Error ? error : new Error('统计数据刷新失败')));
      }
    })().finally(() => {
      if (entry.flight === flight) entry.flight = undefined;
      if (entry.controller === controller) entry.controller = undefined;
    });
    entry.flight = flight;
    return flight;
  };
  const schedule = (uid: string, entry: Entry, invalidateHistory: boolean) => {
    if (invalidateHistory) entry.dirtyHistory = true;
    cancel(entry);
    // The cancelled flight may ignore abort; version checks still reject its result.
    entry.flight = undefined;
    if (entry.listeners.size) entry.timer = setTimeout(() => { entry.timer = undefined; void refresh(uid, entry); }, 120);
    else if (entry.snapshot) entry.snapshot = { ...entry.snapshot, updatedAt: 0 };
  };
  const isTrainingChange = (entry: Entry, event: StatisticsChange) => {
    if (event.eventType !== 'UPDATE') return true;
    const next = event.new;
    if (!next) return true;
    const keys = ['exercises', 'created_at', 'category'];
    if (!keys.some(key => key in next)) return false;
    const known = entry.byId?.get(String(next.id));
    if (!known) return true;
    return (next.created_at !== undefined && new Date(String(next.created_at)).getTime() !== new Date(known.timestamp).getTime()) ||
      (next.category !== undefined && next.category !== known.category) ||
      (next.exercises !== undefined && exerciseContent(next.exercises) !== exerciseContent(known.exercises));
  };
  return {
    subscribe(uid: string, data: (value: StatisticsSnapshot) => void, error?: (error: Error) => void) {
      let entry = entries.get(uid);
      if (!entry) {
        entry = { since: new Date(now() - 90 * 86400000).toISOString(), historyAt: 0, dirtyHistory: true, listeners: new Set(), version: 0 };
        entries.set(uid, entry);
      }
      const target = entry;
      const listener = { data, error }; target.listeners.add(listener);
      if (target.snapshot) data(target.snapshot);
      if (!target.disposeRealtime) target.disposeRealtime = deps.listen(uid, event => {
        if (!isTrainingChange(target, event)) return;
        const known = target.byId?.get(String(event.old?.id ?? event.new?.id));
        if (event.eventType === 'DELETE' && target.snapshot?.historyReady && !known) return;
        const newTime = new Date(String(event.new?.created_at ?? '')).getTime();
        const oldTime = new Date(String(event.old?.created_at ?? known?.timestamp ?? '')).getTime();
        const sinceMs = new Date(target.since).getTime();
        const recentOnly = event.eventType === 'INSERT' && newTime >= sinceMs || event.eventType === 'UPDATE' && newTime >= sinceMs && oldTime >= sinceMs || event.eventType === 'DELETE' && oldTime >= sinceMs;
        schedule(uid, target, !recentOnly);
      }, () => schedule(uid, target, true));
      if (!target.snapshot || target.dirtyHistory || now() - target.snapshot.updatedAt >= ttl || now() - target.historyAt >= historyTtl) void refresh(uid, target);
      return () => {
        target.listeners.delete(listener);
        if (!target.listeners.size) {
          cancel(target); target.flight = undefined;
          target.disposeRealtime?.(); target.disposeRealtime = undefined;
          // Keep only a small number of idle user caches; auth changes reset all.
          for (const [key, value] of entries) if (entries.size > 2 && !value.listeners.size && key !== uid) entries.delete(key);
        }
      };
    },
    retry(uid: string) { const entry = entries.get(uid); if (entry) { cancel(entry); entry.flight = undefined; return refresh(uid, entry); } return Promise.resolve(); },
    invalidate(uid: string) { const entry = entries.get(uid); if (entry) schedule(uid, entry, true); },
    reset() {
      entries.forEach(entry => { cancel(entry); entry.disposeRealtime?.(); entry.listeners.clear(); });
      entries.clear();
    },
  };
}

const analysisCache = new WeakMap<StatisticsSnapshot, Map<string, WorkoutLog[]>>();
/** Preserve the two strongest distinct performances plus flagged entries, with their real log IDs. */
export function getStatisticsAnalysisLogs(snapshot: StatisticsSnapshot, ctx?: StrengthBodyContext | null): WorkoutLog[] {
  const body = resolveBodyContext(ctx).ctx;
  const key = `${body.sex}:${body.bodyweightKg}`;
  let cached = analysisCache.get(snapshot);
  if (!cached) { cached = new Map(); analysisCache.set(snapshot, cached); }
  const existing = cached.get(key); if (existing) return existing;
  const flaggedEntries: Array<{ log: WorkoutLog; exercise: WorkoutLog['exercises'][number] }> = [];
  const candidates = new Map<string, Array<{ log: WorkoutLog; exercise: WorkoutLog['exercises'][number]; value: number; excluded: boolean }>>();
  for (const log of snapshot.history) for (const exercise of log.exercises ?? []) {
    const performance = resolveLoggedStrengthPerformance(exercise, body.bodyweightKg);
    if (!performance?.definition?.hasStrengthBenchmark || !performance.estimate.usableForStrength) continue;
    if (performance.plausibility.excludeFromScoring) { flaggedEntries.push({ log, exercise }); continue; }
    const list = candidates.get(performance.canonicalId) ?? [];
    const item = { log, exercise, value: performance.estimate.estimated1RM, excluded: performance.plausibility.excludeFromScoring };
    if (!list.some(candidate => candidate.value === item.value && candidate.excluded === item.excluded)) list.push(item);
    list.sort((a, b) => b.value - a.value);
    const valid = list.filter(item => !item.excluded).slice(0, 2);
    candidates.set(performance.canonicalId, valid);
  }
  const byLog = new Map<string, WorkoutLog>();
  const selected = [...candidates.values()].flat().concat(flaggedEntries.map(item => ({ ...item, value: 0, excluded: true })));
  selected.forEach(({ log, exercise }) => {
    let target = byLog.get(log.id);
    if (!target) { target = { ...log, exercises: [] }; byLog.set(log.id, target); }
    if (!target.exercises.includes(exercise)) target.exercises.push(exercise);
  });
  const logs = [...snapshot.recentLogs, ...byLog.values()]; cached.set(key, logs); return logs;
}

const calculationCache = new WeakMap<WorkoutLog[], Map<string, ReturnType<typeof calculateFullWorkoutAnalytics>>>();
export function getStatisticsAnalytics(snapshot: StatisticsSnapshot, prs: Record<string, number>, days: number, ctx?: StrengthBodyContext | null) {
  const logs = getStatisticsAnalysisLogs(snapshot, ctx);
  let cached = calculationCache.get(logs); if (!cached) { cached = new Map(); calculationCache.set(logs, cached); }
  const key = `${days}:${snapshot.updatedAt}:${JSON.stringify(ctx ?? null)}:${JSON.stringify(prs)}`;
  const result = cached.get(key); if (result) return result;
  const computed = calculateFullWorkoutAnalytics(logs, prs, days, ctx, new Date(snapshot.updatedAt));
  if (cached.size >= 4) cached.clear(); cached.set(key, computed); return computed;
}
