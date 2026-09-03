/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../types';

export const PUBLIC_FEED_CACHE_KEY = 'fitgroup_feed_cache_public';
export const MY_FEED_CACHE_KEY_PREFIX = 'fitgroup_feed_cache_my_';
export const MAX_CACHED_PUBLIC_LOGS = 30;
export const MAX_CACHED_MY_LOGS = 50;

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Window local storage unavailable or access denied (sandbox / strict privacy)
  }
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    // globalThis local storage unavailable
  }
  return null;
}

/**
 * Persist logs with graceful degradation on QuotaExceededError:
 * if full slice fails, progressively try smaller slices (10, then 5)
 * so that full storage quota never breaks the app or throws unhandled errors.
 */
function safeSetFeedCache(key: string, logs: WorkoutLog[], maxCount: number): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const slice = logs.slice(0, maxCount);
    try {
      storage.setItem(key, JSON.stringify(slice));
      return;
    } catch (err) {
      // QuotaExceededError or write failure; attempt progressive reduction
      if (slice.length > 10) {
        try {
          storage.setItem(key, JSON.stringify(slice.slice(0, 10)));
          return;
        } catch {
          // continue fallback
        }
      }
      if (slice.length > 5) {
        try {
          storage.setItem(key, JSON.stringify(slice.slice(0, 5)));
          return;
        } catch {
          // storage completely exhausted; fail closed smoothly
        }
      }
      console.warn(`Failed to save feed cache for ${key}:`, err);
    }
  } catch (e) {
    console.warn(`Failed to access storage for ${key}:`, e);
  }
}

/**
 * Retrieve cached public workout logs from local storage.
 * Returns empty array if storage is empty or corrupt.
 */
export function getCachedPublicLogs(): WorkoutLog[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(PUBLIC_FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse public feed cache:', e);
  }
  return [];
}

/**
 * Persist public workout logs to local storage.
 * Keeps at most MAX_CACHED_PUBLIC_LOGS entries to ensure compact storage.
 */
export function setCachedPublicLogs(logs: WorkoutLog[]): void {
  safeSetFeedCache(PUBLIC_FEED_CACHE_KEY, logs, MAX_CACHED_PUBLIC_LOGS);
}

/**
 * Retrieve cached personal workout logs for the specified user.
 */
export function getCachedMyLogs(userId: string): WorkoutLog[] {
  if (!userId) return [];
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(`${MY_FEED_CACHE_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse my feed cache:', e);
  }
  return [];
}

/**
 * Persist personal workout logs to local storage.
 * Keeps at most MAX_CACHED_MY_LOGS entries.
 */
export function setCachedMyLogs(userId: string, logs: WorkoutLog[]): void {
  if (!userId) return;
  safeSetFeedCache(`${MY_FEED_CACHE_KEY_PREFIX}${userId}`, logs, MAX_CACHED_MY_LOGS);
}

/**
 * Clear cached public feed.
 */
export function clearPublicFeedCache(): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(PUBLIC_FEED_CACHE_KEY);
  } catch (e) {
    console.warn('Failed to clear public feed cache:', e);
  }
}

/**
 * Reconcile fresh logs with existing logs in state while preserving
 * existing object references for unmodified cards.
 * If all cards are identical, returns prevLogs directly, avoiding state churn.
 */
export function mergeLogsPreservingIdentity(prevLogs: WorkoutLog[], newLogs: WorkoutLog[]): WorkoutLog[] {
  if (!prevLogs || prevLogs.length === 0) return newLogs;
  if (!newLogs || newLogs.length === 0) return newLogs;

  const prevMap = new Map(prevLogs.map((l) => [l.id, l]));
  let hasAnyChange = prevLogs.length !== newLogs.length;

  const merged = newLogs.map((newLog, index) => {
    const prevLog = prevMap.get(newLog.id);
    if (!prevLog) {
      hasAnyChange = true;
      return newLog;
    }

    const isSame =
      prevLog.id === newLog.id &&
      prevLog.likesCount === newLog.likesCount &&
      prevLog.commentsCount === newLog.commentsCount &&
      prevLog.isLiked === newLog.isLiked &&
      prevLog.visibility === newLog.visibility &&
      prevLog.category === newLog.category &&
      (prevLog.categories === newLog.categories || JSON.stringify(prevLog.categories) === JSON.stringify(newLog.categories)) &&
      prevLog.timestamp === newLog.timestamp &&
      prevLog.userId === newLog.userId &&
      prevLog.userName === newLog.userName &&
      prevLog.userPhoto === newLog.userPhoto &&
      prevLog.note === newLog.note &&
      prevLog.photoUrl === newLog.photoUrl &&
      (prevLog.exercises === newLog.exercises || JSON.stringify(prevLog.exercises) === JSON.stringify(newLog.exercises));

    if (isSame) {
      if (prevLogs[index] !== prevLog) {
        hasAnyChange = true;
      }
      return prevLog;
    } else {
      hasAnyChange = true;
      return newLog;
    }
  });

  return hasAnyChange ? merged : prevLogs;
}

/**
 * Calculate a normalized pull-to-refresh threshold accounting for screen scale.
 * Base threshold is 75px, clamped to [65, 85] based on viewport height.
 */
export function getNormalizedPullThreshold(viewportHeight?: number): number {
  const vh = viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const dynamic = Math.round(vh * 0.1);
  return Math.max(65, Math.min(85, dynamic));
}

export interface TouchGestureState {
  touchStartY: number;
  touchStartX: number;
  touchEndY: number;
  touchEndX: number;
  touchStartScrollY: number;
  scrollY: number;
  refreshing: boolean;
  viewportHeight?: number;
}

/**
 * Validates pull-to-refresh gesture:
 * 1. Must not be currently refreshing
 * 2. Touch must originate at the top of scrollable container (touchStartScrollY < 10)
 * 3. Container must still be at the top upon release (scrollY < 10)
 * 4. Pull distance deltaY must exceed normalized threshold
 * 5. Pull must be predominantly vertical (deltaY > |deltaX| * 1.5)
 */
export function shouldTriggerPullRefresh(state: TouchGestureState): boolean {
  if (state.refreshing) return false;
  if (state.touchStartY <= 0) return false;
  if (state.touchStartScrollY >= 10 || state.scrollY >= 10) return false;

  const deltaY = state.touchEndY - state.touchStartY;
  const deltaX = state.touchEndX - state.touchStartX;
  const threshold = getNormalizedPullThreshold(state.viewportHeight);

  return deltaY > threshold && deltaY > Math.abs(deltaX) * 1.5;
}

/**
 * Monotonic millisecond timestamp, immune to system clock adjustments.
 */
export function getMonotonicTime(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export interface OptimisticUpdateMetadata {
  id: string;
  _monotonicAt?: number;
  _wallClockAt?: number;
  _updatedAt?: number;
  _deleted?: boolean;
  [key: string]: any;
}

/**
 * Checks whether an optimistic update has expired (default 30s TTL).
 * Guarded against:
 * 1. Mobile WebView suspend/sleep (where timers were paused, but wall-clock time passed).
 * 2. System clock backwards/forwards skew.
 */
export function isOptimisticUpdateExpired(
  update?: OptimisticUpdateMetadata,
  ttlMs = 30_000
): boolean {
  if (!update) return true;

  const nowMonotonic = getMonotonicTime();
  const nowWallClock = Date.now();

  // If monotonic timestamp is recorded:
  if (typeof update._monotonicAt === 'number') {
    const elapsedMonotonic = nowMonotonic - update._monotonicAt;
    if (elapsedMonotonic > ttlMs || elapsedMonotonic < 0) {
      return true;
    }
  }

  // If wall-clock timestamp is recorded:
  if (typeof update._wallClockAt === 'number') {
    const elapsedWallClock = nowWallClock - update._wallClockAt;
    if (elapsedWallClock > ttlMs || elapsedWallClock < -5_000) {
      return true;
    }
  }

  // Fallback for legacy updates with only _updatedAt:
  if (
    typeof update._updatedAt === 'number' &&
    typeof update._monotonicAt === 'undefined' &&
    typeof update._wallClockAt === 'undefined'
  ) {
    const elapsed = nowWallClock - update._updatedAt;
    if (elapsed > ttlMs || elapsed < -5_000) {
      return true;
    }
  }

  return false;
}

/**
 * Strip internal reconciliation metadata so it never leaks into WorkoutLog or localStorage.
 */
export function stripUpdateMetadata<T extends Record<string, any>>(update: T): Partial<WorkoutLog> {
  const { _monotonicAt, _wallClockAt, _updatedAt, _deleted, ...clean } = update;
  return clean as Partial<WorkoutLog>;
}

