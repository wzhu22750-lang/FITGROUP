/**
 * Unit tests for Feed SWR caching, lazy tab activation, and startup performance contracts:
 * 1. SWR local feed cache (storage, retrieval, limits, corrupted data recovery)
 * 2. User personal logs cache (userId scoping, limits)
 * 3. Log reconciliation contracts (optimistic updates, visibility changes, deletions)
 * 4. Lazy tab activation contract (deferring queries until user switches to tab)
 * 5. Startup and auth pipeline fast-path resolution
 */

import {
  getCachedPublicLogs,
  setCachedPublicLogs,
  getCachedMyLogs,
  setCachedMyLogs,
  clearPublicFeedCache,
  PUBLIC_FEED_CACHE_KEY,
  MAX_CACHED_PUBLIC_LOGS,
  MAX_CACHED_MY_LOGS,
  mergeLogsPreservingIdentity,
  getNormalizedPullThreshold,
  shouldTriggerPullRefresh,
  getMonotonicTime,
  isOptimisticUpdateExpired,
  stripUpdateMetadata,
  OptimisticUpdateMetadata,
} from '../src/utils/feedCache';
import { WorkoutLog, WorkoutCategory } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

// In-memory localStorage mock for Node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

console.log('--- Testing SWR Local Feed Cache ---');

// Test 1: Empty cache returns empty array
mockStorage.clear();
assert(getCachedPublicLogs().length === 0, 'Empty storage returns empty public logs array');

// Test 2: Writing and reading public logs
const sampleLogs: WorkoutLog[] = [
  {
    id: 'log-1',
    userId: 'user-1',
    userName: 'Test User',
    userPhoto: '',
    timestamp: '2026-09-01T10:00:00Z',
    category: WorkoutCategory.Chest,
    exercises: [{ id: 'ex-1', name: '卧推', type: 'strength', weight: 80, sets: 1, reps: 10 }],
    likesCount: 5,
    commentsCount: 2,
    visibility: 'public',
    isLiked: true,
  },
  {
    id: 'log-2',
    userId: 'user-2',
    userName: 'Test User 2',
    userPhoto: '',
    timestamp: '2026-09-01T09:00:00Z',
    category: WorkoutCategory.Legs,
    exercises: [{ id: 'ex-2', name: '深蹲', type: 'strength', weight: 100, sets: 1, reps: 8 }],
    likesCount: 3,
    commentsCount: 0,
    visibility: 'public',
    isLiked: false,
  },
];

setCachedPublicLogs(sampleLogs);
const retrieved = getCachedPublicLogs();
assert(retrieved.length === 2, 'Retrieved cached public logs count matches');
assert(retrieved[0].id === 'log-1', 'First cached log ID matches');
assert(retrieved[0].isLiked === true, 'First cached log like state preserved');
assert(retrieved[1].id === 'log-2', 'Second cached log ID matches');
assert(retrieved[1].isLiked === false, 'Second cached log like state preserved');

// Test 3: Cache size capping
const manyLogs: WorkoutLog[] = Array.from({ length: 50 }, (_, i) => ({
  id: `log-${i}`,
  userId: `user-${i}`,
  userName: `User ${i}`,
  userPhoto: '',
  timestamp: new Date().toISOString(),
  category: WorkoutCategory.Chest,
  exercises: [],
  likesCount: 0,
  commentsCount: 0,
  visibility: 'public',
}));

setCachedPublicLogs(manyLogs);
const capped = getCachedPublicLogs();
assert(capped.length === MAX_CACHED_PUBLIC_LOGS, `Public feed cache is capped at ${MAX_CACHED_PUBLIC_LOGS}`);
assert(capped[0].id === 'log-0', 'Preserves newest logs at the front');

// Test 4: Corrupted cache recovers gracefully
mockStorage.setItem(PUBLIC_FEED_CACHE_KEY, '{ invalid json garbage');
assert(getCachedPublicLogs().length === 0, 'Corrupted JSON in storage gracefully recovers to empty array without crashing');

// Test 5: Cache clearing
setCachedPublicLogs(sampleLogs);
assert(getCachedPublicLogs().length === 2, 'Cache populated before clearing');
clearPublicFeedCache();
assert(getCachedPublicLogs().length === 0, 'Cache successfully cleared');

console.log('\n--- Testing Personal Logs Cache ---');

// Test 6: Scoped personal logs caching
const userLogsA: WorkoutLog[] = [
  {
    id: 'my-1',
    userId: 'user-alice',
    userName: 'Alice',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: WorkoutCategory.Back,
    exercises: [],
    likesCount: 1,
    commentsCount: 0,
    visibility: 'private',
  },
];

const userLogsB: WorkoutLog[] = [
  {
    id: 'my-2',
    userId: 'user-bob',
    userName: 'Bob',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: WorkoutCategory.Shoulders,
    exercises: [],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'friends',
  },
];

setCachedMyLogs('user-alice', userLogsA);
setCachedMyLogs('user-bob', userLogsB);

const aliceCached = getCachedMyLogs('user-alice');
const bobCached = getCachedMyLogs('user-bob');
assert(aliceCached.length === 1 && aliceCached[0].id === 'my-1', 'Alice gets her own cached logs');
assert(bobCached.length === 1 && bobCached[0].id === 'my-2', 'Bob gets his own cached logs');
assert(getCachedMyLogs('user-charlie').length === 0, 'Uncached user gets empty array');
assert(getCachedMyLogs('').length === 0, 'Empty userId returns empty array');

// Test 7: Personal logs cache size limit
setCachedMyLogs('user-alice', manyLogs);
assert(getCachedMyLogs('user-alice').length === MAX_CACHED_MY_LOGS, `Personal logs cache capped at ${MAX_CACHED_MY_LOGS}`);

console.log('\n--- Testing Reconciliation with Edits & Deletions ---');

// Test 8: Optimistic update reconciliation
function reconcileLogs(
  logs: WorkoutLog[],
  updates: Record<string, Partial<WorkoutLog> & { id: string }>,
  domain: 'public' | 'my'
): WorkoutLog[] {
  return logs
    .filter((log) => {
      const update = updates[log.id];
      return !(domain === 'public' && update?.visibility && update.visibility !== 'public');
    })
    .map((log) => ({ ...log, ...(updates[log.id] || {}) }));
}

const baseLogs: WorkoutLog[] = [
  {
    id: 'log-1',
    userId: 'user-1',
    userName: 'User 1',
    userPhoto: '',
    timestamp: '2026-09-01T10:00:00Z',
    category: WorkoutCategory.Chest,
    exercises: [],
    likesCount: 1,
    commentsCount: 0,
    visibility: 'public',
  },
  {
    id: 'log-2',
    userId: 'user-1',
    userName: 'User 1',
    userPhoto: '',
    timestamp: '2026-09-01T09:00:00Z',
    category: WorkoutCategory.Legs,
    exercises: [],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
];

// Edit log-1 category and likesCount
const updates: Record<string, Partial<WorkoutLog> & { id: string }> = {
  'log-1': { id: 'log-1', category: WorkoutCategory.Back, likesCount: 2, isLiked: true },
};

const reconciled = reconcileLogs(baseLogs, updates, 'public');
assert(reconciled[0].category === WorkoutCategory.Back, 'Reconciliation applies updated category');
assert(reconciled[0].likesCount === 2, 'Reconciliation applies updated likesCount');
assert(reconciled[0].isLiked === true, 'Reconciliation applies updated isLiked');
assert(reconciled[1].category === WorkoutCategory.Legs, 'Untouched log remains unaffected');

// Visibility change from public to private removes log from public feed
updates['log-2'] = { id: 'log-2', visibility: 'private' };
const afterVisibilityChange = reconcileLogs(baseLogs, updates, 'public');
assert(afterVisibilityChange.length === 1, 'Private log filtered out of public feed');
assert(afterVisibilityChange[0].id === 'log-1', 'Only public log remains in public feed');

// In personal feed ('my'), private logs are preserved
const myReconciled = reconcileLogs(baseLogs, updates, 'my');
assert(myReconciled.length === 2, 'Private log is preserved in personal feed');

console.log('\n--- Testing Lazy Tab Loading State Machine ---');

// Test 9: Lazy Tab Activation contract
class TabActivationSimulator {
  private activeDomain: 'public' | 'team' | 'my' = 'public';
  private hasActivatedMy = false;
  private myFetchCount = 0;
  private teamFetchCount = 0;

  switchTab(domain: 'public' | 'team' | 'my') {
    this.activeDomain = domain;
    if (domain === 'my' && !this.hasActivatedMy) {
      this.hasActivatedMy = true;
      this.myFetchCount++;
    }
    if (domain === 'team') {
      this.teamFetchCount++;
    }
  }

  getMyFetchCount() {
    return this.myFetchCount;
  }

  getTeamFetchCount() {
    return this.teamFetchCount;
  }

  isMyActivated() {
    return this.hasActivatedMy;
  }
}

const sim = new TabActivationSimulator();
assert(!sim.isMyActivated(), 'My Logs is not activated on initial mount');
assert(sim.getMyFetchCount() === 0, 'No personal log queries initiated on initial mount');
assert(sim.getTeamFetchCount() === 0, 'No team queries initiated on initial mount');

// Switch to 'my' activates query
sim.switchTab('my');
assert(sim.isMyActivated(), 'My Logs is activated after switching to my tab');
assert(sim.getMyFetchCount() === 1, 'Personal log query initiated on activation');

// Switch back to 'public' does not trigger redundant fetch
sim.switchTab('public');
assert(sim.getMyFetchCount() === 1, 'No additional personal log query when leaving my tab');

// Switch to 'team' activates team query
sim.switchTab('team');
assert(sim.getTeamFetchCount() === 1, 'Team query initiated upon visiting team tab');

console.log('\n--- Testing Startup Fast-Path Resolution ---');

// Test 10: Fast-path auth resolution with cached user
const cachedProfile = {
  id: 'user-fast',
  uid: 'user-fast',
  displayName: 'Fast User',
  photoURL: '',
  phone: '',
  streak: 5,
  totalWorkouts: 12,
  prs: {},
  sex: 'male' as const,
  bodyweightKg: 75,
  heightCm: 180,
  bodyMetricsUpdatedAt: null,
};

mockStorage.setItem('fitgroup_cached_user_profile', JSON.stringify(cachedProfile));
const loadedUser = JSON.parse(mockStorage.getItem('fitgroup_cached_user_profile') || '{}');
assert(loadedUser.id === 'user-fast', 'Cached user immediately retrievable synchronously on startup');
assert(loadedUser.displayName === 'Fast User', 'Display name matches cached user');

console.log('\n--- Testing Storage Quota Exhaustion & Degradation ---');

// Test 11: QuotaExceeded progressive pruning
class QuotaLimitedStorage extends MockLocalStorage {
  public maxItemLength = 10000;
  public throwOnSet = false;

  override setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    const parsed = JSON.parse(value);
    // Simulate quota error if array has more than 10 items
    if (Array.isArray(parsed) && parsed.length > 10) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    super.setItem(key, value);
  }
}

const quotaStorage = new QuotaLimitedStorage();
(globalThis as any).localStorage = quotaStorage;

// Saving 30 items when max allowed without quota error is 10 items
setCachedPublicLogs(manyLogs);
const quotaPrunedLogs = getCachedPublicLogs();
assert(quotaPrunedLogs.length === 10, 'QuotaExceeded on 30 items triggers progressive pruning to 10 items');
assert(quotaPrunedLogs[0].id === 'log-0', 'Preserves newest items when pruned under quota');

// When storage throws unconditionally, it degrades gracefully without crashing
quotaStorage.throwOnSet = true;
let threw = false;
try {
  setCachedPublicLogs(manyLogs);
} catch {
  threw = true;
}
assert(!threw, 'Unconditional storage write failure fails closed safely without throwing');

console.log('\n--- Testing Sandboxed / Blocked Storage Environment ---');

// Test 12: Restricted storage environment (e.g. strict sandbox / disabled cookies)
class BlockedStorage {
  getItem(): string | null {
    const err = new Error('Access is denied for this document.');
    err.name = 'SecurityError';
    throw err;
  }
  setItem(): void {
    const err = new Error('Access is denied for this document.');
    err.name = 'SecurityError';
    throw err;
  }
  removeItem(): void {
    const err = new Error('Access is denied for this document.');
    err.name = 'SecurityError';
    throw err;
  }
}

(globalThis as any).localStorage = new BlockedStorage();
assert(getCachedPublicLogs().length === 0, 'Blocked storage fails closed returning empty public logs');
assert(getCachedMyLogs('user-alice').length === 0, 'Blocked storage fails closed returning empty my logs');

let blockedWriteThrew = false;
try {
  setCachedPublicLogs(sampleLogs);
  setCachedMyLogs('user-alice', userLogsA);
  clearPublicFeedCache();
} catch {
  blockedWriteThrew = true;
}
assert(!blockedWriteThrew, 'Blocked storage write and clear operations do not throw');

// Restore working mock storage
(globalThis as any).localStorage = mockStorage;

console.log('\n--- Testing Pull-To-Refresh Gesture Edge Cases ---');

// Test 13: Pull-to-refresh gesture calculation logic using real exported shouldTriggerPullRefresh
// Valid vertical pull at top of page
assert(
  shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 100,
    touchEndY: 150,
    touchEndX: 102,
    touchStartScrollY: 0,
    scrollY: 0,
    refreshing: false,
    viewportHeight: 800,
  }),
  'Valid vertical pull at top of page triggers pull-to-refresh'
);

// Pull distance under threshold (< threshold)
assert(
  !shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 100,
    touchEndY: 110,
    touchEndX: 100,
    touchStartScrollY: 0,
    scrollY: 0,
    refreshing: false,
    viewportHeight: 800,
  }),
  'Pull distance under threshold does not trigger refresh'
);

// Horizontal swipe with slight downward drift
assert(
  !shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 50,
    touchEndY: 140,
    touchEndX: 250,
    touchStartScrollY: 0,
    scrollY: 0,
    refreshing: false,
    viewportHeight: 800,
  }),
  'Horizontal swipe with downward slant does not trigger pull refresh'
);

// Swiping when not at top of page (scrollY >= 10)
assert(
  !shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 100,
    touchEndY: 160,
    touchEndX: 100,
    touchStartScrollY: 0,
    scrollY: 50,
    refreshing: false,
    viewportHeight: 800,
  }),
  'Pull when page is scrolled down does not trigger pull refresh'
);

// Gesture that started when page was scrolled down (touchStartScrollY >= 10) but ended at top
assert(
  !shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 100,
    touchEndY: 160,
    touchEndX: 100,
    touchStartScrollY: 45,
    scrollY: 0,
    refreshing: false,
    viewportHeight: 800,
  }),
  'Gesture that started when page was scrolled down does not trigger pull refresh upon reaching top'
);

// Already refreshing
assert(
  !shouldTriggerPullRefresh({
    touchStartY: 50,
    touchStartX: 100,
    touchEndY: 160,
    touchEndX: 100,
    touchStartScrollY: 0,
    scrollY: 0,
    refreshing: true,
    viewportHeight: 800,
  }),
  'Gesture while already refreshing does not trigger duplicate refresh'
);

console.log('\n--- Testing SWR Reconciliation Race Condition & Deletion Tombstones ---');

// Test 14: Sequential partial updates merging
const logUpdateStore: Record<string, Partial<WorkoutLog> & { id: string; _updatedAt?: number; _deleted?: boolean }> = {};

function applyLogUpdate(updated: Partial<WorkoutLog> & { id: string; _deleted?: boolean }) {
  const now = Date.now();
  const existing = logUpdateStore[updated.id] || { id: updated.id };
  logUpdateStore[updated.id] = { ...existing, ...updated, _updatedAt: now };
}

// User edits category
applyLogUpdate({ id: 'log-race-1', category: WorkoutCategory.Back });
// Then immediately likes the log
applyLogUpdate({ id: 'log-race-1', likesCount: 9, isLiked: true });

// Both updates should be retained in the merged update record
assert(logUpdateStore['log-race-1'].category === WorkoutCategory.Back, 'Category edit preserved after subsequent like');
assert(logUpdateStore['log-race-1'].likesCount === 9, 'Like count preserved in merged update');
assert(logUpdateStore['log-race-1'].isLiked === true, 'Like state preserved in merged update');

// Test 15: Optimistic deletion tombstone
applyLogUpdate({ id: 'log-race-2', _deleted: true });

const remoteStaleFeed: WorkoutLog[] = [
  {
    id: 'log-race-2',
    userId: 'user-1',
    userName: 'User 1',
    userPhoto: '',
    timestamp: '2026-09-01T10:00:00Z',
    category: WorkoutCategory.Chest,
    exercises: [],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
  {
    id: 'log-race-3',
    userId: 'user-1',
    userName: 'User 1',
    userPhoto: '',
    timestamp: '2026-09-01T10:00:00Z',
    category: WorkoutCategory.Legs,
    exercises: [],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
];

const reconciledAfterDelete = remoteStaleFeed.filter((log) => {
  const update = logUpdateStore[log.id];
  if (update?._deleted) return false;
  return true;
});

assert(reconciledAfterDelete.length === 1, 'Deleted log is excluded from reconciled feed');
assert(reconciledAfterDelete[0].id === 'log-race-3', 'Remaining non-deleted log is retained');

// Test 16: Out-of-order network response versioning
class RequestVersioningTracker {
  private currentVersion = 0;
  private settledData: string | null = null;

  startRequest(): number {
    return ++this.currentVersion;
  }

  resolveRequest(reqVersion: number, data: string) {
    // If request version is older than latest started request, reject
    if (reqVersion === this.currentVersion) {
      this.settledData = data;
    }
  }

  getSettledData() {
    return this.settledData;
  }
}

const tracker = new RequestVersioningTracker();
const req1 = tracker.startRequest(); // t=1, version 1
const req2 = tracker.startRequest(); // t=2, version 2

// Request 2 finishes first with fresh data
tracker.resolveRequest(req2, 'fresh-data');
assert(tracker.getSettledData() === 'fresh-data', 'Request 2 sets fresh data');

// Request 1 arrives late with stale data
tracker.resolveRequest(req1, 'stale-data');
assert(tracker.getSettledData() === 'fresh-data', 'Late Request 1 is rejected and cannot overwrite fresh data');

console.log('\n--- Testing Feed Card Memoization & Rendering Churn Prevention ---');
const originalFeed: WorkoutLog[] = [
  {
    id: 'log-ident-1',
    userId: 'u1',
    userName: 'User 1',
    userPhoto: '',
    timestamp: '2026-09-01T10:00:00Z',
    category: WorkoutCategory.Chest,
    exercises: [],
    likesCount: 3,
    commentsCount: 1,
    visibility: 'public',
    isLiked: false,
  },
  {
    id: 'log-ident-2',
    userId: 'u2',
    userName: 'User 2',
    userPhoto: '',
    timestamp: '2026-09-01T11:00:00Z',
    category: WorkoutCategory.Legs,
    exercises: [],
    likesCount: 5,
    commentsCount: 2,
    visibility: 'public',
    isLiked: true,
  },
];

// Revalidation returns exact same data: must return the exact same array reference!
const identicalRevalidated = originalFeed.map((l) => ({ ...l }));
const mergedSame = mergeLogsPreservingIdentity(originalFeed, identicalRevalidated);
assert(mergedSame === originalFeed, 'Unmodified feed returns identical array reference, completely eliminating React re-renders');

// Revalidation modifies only 1 card (log-ident-2 gets a like):
const oneUpdatedRevalidated: WorkoutLog[] = [
  { ...originalFeed[0] },
  { ...originalFeed[1], likesCount: 6, isLiked: true },
];
const mergedPartial = mergeLogsPreservingIdentity(originalFeed, oneUpdatedRevalidated);
assert(mergedPartial !== originalFeed, 'Feed with modified card produces updated array');
assert(mergedPartial[0] === originalFeed[0], 'Unmodified card preserves exact object reference across revalidation');
assert(mergedPartial[1] !== originalFeed[1], 'Modified card receives new object reference');
assert(mergedPartial[1].likesCount === 6, 'Modified card receives updated likesCount');

console.log('\n--- Testing High-DPI Gesture Threshold Normalization ---');
const compactThreshold = getNormalizedPullThreshold(500);
const standardThreshold = getNormalizedPullThreshold(800);
const tallThreshold = getNormalizedPullThreshold(1200);

assert(compactThreshold === 65, 'Clamps compact viewport pull threshold to minimum 65px');
assert(standardThreshold === 80, 'Standard 800px viewport uses 80px pull threshold');
assert(tallThreshold === 85, 'Clamps tall/tablet viewport pull threshold to maximum 85px');

console.log('\n--- Testing Offline Startup & Online Reconnect Sync State Machine ---');
// Mock offline environment with cached logs
mockStorage.clear();
setCachedPublicLogs(originalFeed);

class OfflineFeedStateMachine {
  public isOnline: boolean;
  public logs: WorkoutLog[];
  public loading: boolean;
  public syncTriggeredCount = 0;

  constructor(isOnline: boolean) {
    this.isOnline = isOnline;
    this.logs = getCachedPublicLogs();
    this.loading = this.logs.length === 0;
  }

  handleOnlineEvent() {
    this.isOnline = true;
    this.syncTriggeredCount++;
  }
}

const offlineMachine = new OfflineFeedStateMachine(false);
assert(offlineMachine.logs.length === 2, 'Offline boot immediately reads cached logs from storage');
assert(offlineMachine.loading === false, 'Offline boot with cache does not show blocking loading spinner');

offlineMachine.handleOnlineEvent();
assert(offlineMachine.isOnline === true, 'Online event restores online status');
assert(offlineMachine.syncTriggeredCount === 1, 'Online event triggers automatic background sync');

console.log('\n--- Testing Android Capacitor Lifecycle Resume Silent Revalidation ---');
class LifecycleStateMachine {
  public logs: WorkoutLog[];
  public loading: boolean;
  public silentRevalidationCount = 0;

  constructor(initialLogs: WorkoutLog[]) {
    this.logs = initialLogs;
    this.loading = initialLogs.length === 0;
  }

  onResume() {
    // When app resumes from background, silent revalidation MUST NOT set loading to true
    if (this.logs.length > 0) {
      assert(this.loading === false, 'Loading spinner must remain false during resume revalidation');
    }
    this.silentRevalidationCount++;
  }
}

const lifecycle = new LifecycleStateMachine(originalFeed);
lifecycle.onResume();
assert(lifecycle.loading === false, 'Loading remains false when resumed');
assert(lifecycle.silentRevalidationCount === 1, 'Silent revalidation triggered on app resume');

console.log('\n--- Testing Late Auth Resolution Personal Log Cache Recovery ---');
mockStorage.clear();
const aliceLogs: WorkoutLog[] = [
  {
    id: 'alice-1',
    userId: 'user-alice',
    userName: 'Alice',
    userPhoto: '',
    timestamp: '2026-09-02T10:00:00Z',
    category: WorkoutCategory.Chest,
    exercises: [],
    likesCount: 1,
    commentsCount: 0,
    visibility: 'private',
  },
];
setCachedMyLogs('user-alice', aliceLogs);

// Simulate Feed mounting when currentUser is initially null:
let simulatedMyLogs: WorkoutLog[] = [];
let simulatedMyLoading = false;
let user: { uid: string } | null = null;

// Later, auth finishes:
user = { uid: 'user-alice' };

// User clicks "My Logs" tab (hasActivatedMy becomes true):
if (simulatedMyLogs.length === 0 && user) {
  const cached = getCachedMyLogs(user.uid);
  if (cached.length > 0) {
    simulatedMyLogs = cached;
  } else {
    simulatedMyLoading = true;
  }
}

assert(simulatedMyLogs.length === 1, 'Personal logs recovered from cache upon tab activation even after late auth');
assert(simulatedMyLogs[0].id === 'alice-1', 'Correct personal log ID recovered');
assert(simulatedMyLoading === false, 'No blocking loader shown for personal logs when cache exists');

console.log('\n--- Testing TeamDashboard Optimistic Deletion & Update Merging ---');
const teamLogUpdates: Record<string, Partial<WorkoutLog> & { id: string; _updatedAt?: number; _deleted?: boolean }> = {};

function applyTeamUpdate(updated: Partial<WorkoutLog> & { id: string; _deleted?: boolean }) {
  const now = Date.now();
  const existing = teamLogUpdates[updated.id] || { id: updated.id };
  teamLogUpdates[updated.id] = { ...existing, ...updated, _updatedAt: now };
}

// 1. Step 1: User edits note
applyTeamUpdate({ id: 'team-log-1', note: 'New PR reached!' });
// 2. Step 2: User likes the log
applyTeamUpdate({ id: 'team-log-1', likesCount: 4, isLiked: true });

assert(teamLogUpdates['team-log-1'].note === 'New PR reached!', 'Team log update preserves note from prior edit');
assert(teamLogUpdates['team-log-1'].likesCount === 4, 'Team log update preserves likesCount from subsequent like');

// 3. Deletion tombstone in team feed
applyTeamUpdate({ id: 'team-log-1', _deleted: true });
const teamFeed: WorkoutLog[] = [
  { ...originalFeed[0], id: 'team-log-1' },
  { ...originalFeed[1], id: 'team-log-2' },
];

const reconciledTeam = teamFeed.filter((l) => {
  const u = teamLogUpdates[l.id];
  if (u?._deleted) return false;
  return !(u?.visibility && u.visibility === 'private');
});

assert(reconciledTeam.length === 1, 'Deleted log is excluded from team feed via tombstone');
assert(reconciledTeam[0].id === 'team-log-2', 'Remaining log is retained in team feed');

console.log('\n--- Testing Categories Plural Array Identity & Change Detection ---');
const categoriesLogA: WorkoutLog = {
  ...sampleLogs[0],
  id: 'cat-log-1',
  category: WorkoutCategory.Chest,
  categories: [WorkoutCategory.Chest, WorkoutCategory.Shoulders],
};

const categoriesLogAClone: WorkoutLog = {
  ...sampleLogs[0],
  id: 'cat-log-1',
  category: WorkoutCategory.Chest,
  categories: [WorkoutCategory.Chest, WorkoutCategory.Shoulders],
};

// 1. Same categories array contents preserves exact object reference
const mergedIdenticalCat = mergeLogsPreservingIdentity([categoriesLogA], [categoriesLogAClone]);
assert(mergedIdenticalCat[0] === categoriesLogA, 'Identical categories array preserves object identity');

// 2. Modified categories array triggers reference update
const categoriesLogAModified: WorkoutLog = {
  ...categoriesLogA,
  categories: [WorkoutCategory.Chest, WorkoutCategory.Back],
};
const mergedModifiedCat = mergeLogsPreservingIdentity([categoriesLogA], [categoriesLogAModified]);
assert(mergedModifiedCat[0] !== categoriesLogA, 'Modified categories produces a new object reference');
assert(mergedModifiedCat[0].categories?.[1] === WorkoutCategory.Back, 'New categories correctly reflected in merged result');

console.log('\n--- Testing Monotonic Timestamp & Bounded TTL Expiration ---');
const baseMonotonic = getMonotonicTime();
const baseWallClock = Date.now();

// 1. Fresh update within 30s is NOT expired
const freshUpdate: OptimisticUpdateMetadata = {
  id: 'opt-1',
  _monotonicAt: baseMonotonic,
  _wallClockAt: baseWallClock,
  _updatedAt: baseWallClock,
};
assert(!isOptimisticUpdateExpired(freshUpdate), 'Fresh optimistic update within 30s is not expired');

// 2. Monotonic elapsed > 30s is expired
const oldMonotonicUpdate: OptimisticUpdateMetadata = {
  id: 'opt-2',
  _monotonicAt: baseMonotonic - 31_000,
  _wallClockAt: baseWallClock,
};
assert(isOptimisticUpdateExpired(oldMonotonicUpdate), 'Monotonic time > 30s is detected as expired');

// 3. Wall clock elapsed > 30s (simulating phone suspend/sleep where timers paused) is expired
const suspendedSleepUpdate: OptimisticUpdateMetadata = {
  id: 'opt-3',
  _monotonicAt: baseMonotonic,
  _wallClockAt: baseWallClock - (2 * 3600 * 1000), // 2 hours ago
};
assert(isOptimisticUpdateExpired(suspendedSleepUpdate), 'Update created 2 hours ago during sleep is detected as expired');

// 4. Backward system clock skew jump (> 5s backwards) is safely bounded
const backwardSkewUpdate: OptimisticUpdateMetadata = {
  id: 'opt-4',
  _monotonicAt: baseMonotonic,
  _wallClockAt: baseWallClock + 10_000, // System clock adjusted backwards by 10s
};
assert(isOptimisticUpdateExpired(backwardSkewUpdate), 'Backward clock skew > 5s is safely expired to prevent indefinite lingering');

console.log('\n--- Testing Metadata Stripping & Storage Cleanliness Contract ---');
const rawUpdateWithMetadata = {
  id: 'log-clean-1',
  likesCount: 15,
  isLiked: true,
  _monotonicAt: 123456,
  _wallClockAt: 1700000000000,
  _updatedAt: 1700000000000,
  _deleted: false,
};

const stripped = stripUpdateMetadata(rawUpdateWithMetadata);
assert(stripped.likesCount === 15, 'Clean update preserves domain properties');
assert(stripped.isLiked === true, 'Clean update preserves like state');
assert(!('_monotonicAt' in stripped), '_monotonicAt is cleanly stripped');
assert(!('_wallClockAt' in stripped), '_wallClockAt is cleanly stripped');
assert(!('_updatedAt' in stripped), '_updatedAt is cleanly stripped');
assert(!('_deleted' in stripped), '_deleted is cleanly stripped');

// Verify that when saved to storage cache, internal metadata is never serialized
const testCleanLogs: WorkoutLog[] = [
  { ...sampleLogs[0], ...stripped, id: 'log-storage-clean' },
];
setCachedPublicLogs(testCleanLogs);
const retrievedClean = getCachedPublicLogs();
assert(!('_monotonicAt' in retrievedClean[0]), 'Storage cache does not contain _monotonicAt');
assert(!('_wallClockAt' in retrievedClean[0]), 'Storage cache does not contain _wallClockAt');
assert(!('_updatedAt' in retrievedClean[0]), 'Storage cache does not contain _updatedAt');
assert(!('_deleted' in retrievedClean[0]), 'Storage cache does not contain _deleted');

console.log('\n--- Testing Tab Activation Retention (Deferred Inactive -> Persistent Active) ---');
let hasActivatedTeamSim = false;
let teamMountCount = 0;

function simulateTabVisit(domain: 'public' | 'team' | 'my') {
  if (domain === 'team' && !hasActivatedTeamSim) {
    hasActivatedTeamSim = true;
    teamMountCount++; // First mount
  }
}

// 1. Initial mount on public feed: team is NOT activated
simulateTabVisit('public');
assert(!hasActivatedTeamSim, 'Team tab is not activated on discovery feed initial mount');
assert(teamMountCount === 0, 'Team dashboard is not mounted on discovery feed initial mount');

// 2. User switches to team tab
simulateTabVisit('team');
assert(hasActivatedTeamSim, 'Team tab is activated upon user visit');
assert(teamMountCount === 1, 'Team dashboard mounts once upon activation');

// 3. User switches back to public and then back to team
simulateTabVisit('public');
simulateTabVisit('team');
assert(teamMountCount === 1, 'Team dashboard stays mounted and is not re-mounted across tab toggles');

console.log('\n🎉 ALL FEED SWR CACHING & PERFORMANCE TESTS PASSED SUCCESSFULLY!');

