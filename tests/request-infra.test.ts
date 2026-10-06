import assert from 'node:assert';
import {
  readRequest,
  withCallerSignal,
  SingleFlight,
  REQUEST_TIMEOUT_MS,
} from '../src/utils/request';
import { customFetch } from '../src/lib/supabase';
import {
  fetchPublicWorkoutLogs,
  fetchMyWorkoutLogs,
  fetchTeamWorkoutLogs,
  subscribeToPublicWorkoutLogs,
  attachCurrentUserLikeState,
  sharedFeedScheduler,
  normalizeLog,
} from '../src/api';
import { supabase } from '../src/lib/supabase';

// Realtime transport is not the target of these deterministic read tests.
supabase.removeChannel = async () => 'ok';
supabase.channel = (() => {
  const channel = { on: () => channel, subscribe: () => channel };
  return channel;
}) as any;
console.log('=== Running Request Infra & Feed Scheduler Tests ===\n');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 1. Cancellable Deadlines & SDK AbortSignal Propagations
// ---------------------------------------------------------------------------
console.log('--- Testing Cancellable Deadlines & SDK AbortSignal ---');

{
  assert.strictEqual(REQUEST_TIMEOUT_MS, 9000, 'REQUEST_TIMEOUT_MS is exactly 9000');

  // Test: SDK abortSignal is passed to builder
  let capturedSignal: AbortSignal | null = null;
  const res = await readRequest('test-signal', async (signal) => {
    capturedSignal = signal;
    return 'ok';
  });
  assert.strictEqual(res, 'ok');
  assert.ok(capturedSignal !== null, 'AbortSignal was passed to builder');
  assert.strictEqual((capturedSignal as AbortSignal).aborted, false, 'Signal was not aborted during normal execution');

  // Test: Pre-aborted caller signal fails fast
  const preController = new AbortController();
  preController.abort(new Error('Pre-aborted reason'));
  let builderCalled = false;
  try {
    await readRequest('pre-aborted', async () => {
      builderCalled = true;
      return 'nope';
    }, { signal: preController.signal });
    assert.fail('Should have thrown on pre-aborted signal');
  } catch (err: any) {
    assert.strictEqual(builderCalled, false, 'Builder was not called for pre-aborted signal');
    assert.ok(err.message.includes('Pre-aborted'), 'Error preserves caller abort reason');
  }

  // Test: External caller signal aborts in-flight builder
  const callerController = new AbortController();
  let builderAborted = false;
  setTimeout(() => callerController.abort(new Error('Caller cancelled mid-flight')), 30);
  try {
    await readRequest('in-flight-abort', async (signal) => {
      signal.addEventListener('abort', () => { builderAborted = true; });
      await sleep(150);
      return 'done';
    }, { signal: callerController.signal });
    assert.fail('Should have aborted mid-flight');
  } catch (err: any) {
    assert.strictEqual(builderAborted, true, 'Builder received abort signal when caller aborted');
    assert.ok(err.message.includes('Caller cancelled'), 'Error message preserves caller reason');
  }

  // Test: Deadline timeout triggers TimeoutError
  let timedOutSignal = false;
  try {
    await readRequest('timeout-test', async (signal) => {
      signal.addEventListener('abort', () => { timedOutSignal = true; });
      await sleep(150);
      return 'never';
    }, { timeoutMs: 40 });
    assert.fail('Should have timed out');
  } catch (err: any) {
    assert.strictEqual(timedOutSignal, true, 'Internal signal was aborted on timeout');
    assert.strictEqual(err.name, 'TimeoutError', 'Error name is TimeoutError');
    assert.ok(err.message.includes('timed out after 40ms'), 'Timeout message includes timeout duration');
  }

  // Test: withCallerSignal allows caller cancellation without affecting shared promise
  const sharedPromise = sleep(80).then(() => 'shared-result');
  const isolatedController = new AbortController();
  setTimeout(() => isolatedController.abort(new Error('Isolated caller cancel')), 20);

  try {
    await withCallerSignal(sharedPromise, isolatedController.signal);
    assert.fail('Should have rejected for isolated caller');
  } catch (err: any) {
    assert.ok(err.message.includes('Isolated caller cancel'), 'Caller promise rejected with its own signal');
  }
  // But underlying shared promise resolves successfully
  const sharedResult = await sharedPromise;
  assert.strictEqual(sharedResult, 'shared-result', 'Underlying shared promise was unaffected by isolated abort');

  console.log('✅ PASSED: Cancellable deadlines & SDK abortSignal propagation');
}

// ---------------------------------------------------------------------------
// 2. Slow Likes: Feed Fetch Returns Logs Before Batch Likes with Bounded Cancellation
// ---------------------------------------------------------------------------
console.log('--- Testing Slow Likes & Feed Fetch Before Batch Likes ---');

{
  // Test: attachCurrentUserLikeState on empty logs returns immediately without db query
  const emptyResult = await attachCurrentUserLikeState([]);
  assert.deepStrictEqual(emptyResult, [], 'attachCurrentUserLikeState([]) returns empty array immediately');

  // Test: attachCurrentUserLikeState with bounded cancellation doesn't hang on slow queries
  const mockLogs = [
    normalizeLog({
      id: 'log-slow-1',
      user_id: 'user-1',
      user_name: 'Tester',
      user_photo: '',
      created_at: new Date().toISOString(),
      category: 'Chest',
      exercises: [],
      note: 'Bench day',
      photo_url: '',
      likes_count: 5,
      comments_count: 0,
      visibility: 'public',
    }),
  ];

  // Call attachCurrentUserLikeState with a tight 30ms timeoutMs option
  // It should gracefully handle timeout, log a warning, and return logs without throwing
  const start = Date.now();
  const logsAfterSlowLikes = await attachCurrentUserLikeState(mockLogs, { timeoutMs: 30 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `Completed promptly in ${elapsed}ms instead of hanging`);
  assert.strictEqual(logsAfterSlowLikes.length, 1);
  assert.strictEqual(logsAfterSlowLikes[0].id, 'log-slow-1');

  // Mock Supabase from query for feed and slow likes
  const originalFrom = supabase.from.bind(supabase);
  let likesQueryStarted = false;
  let likesQueryCompleted = false;

  (supabase as any).from = function (table: string) {
    if (table === 'workout_likes') {
      likesQueryStarted = true;
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              abortSignal: (signal: AbortSignal) => {
                return new Promise((resolve) => {
                  const timer = setTimeout(() => {
                    likesQueryCompleted = true;
                    resolve({ data: [{ log_id: 'log-slow-1' }], error: null });
                  }, 400); // 400ms slow likes
                  signal?.addEventListener('abort', () => {
                    clearTimeout(timer);
                    resolve({ data: null, error: { message: 'Aborted' } });
                  });
                });
              },
            }),
          }),
        }),
      };
    }
    if (table === 'workout_logs') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                abortSignal: () => Promise.resolve({
                  data: [
                    {
                      id: 'log-slow-1',
                      user_id: 'user-1',
                      user_name: 'Fast Log',
                      user_photo: '',
                      created_at: new Date().toISOString(),
                      category: 'Chest',
                      exercises: [],
                      note: 'Log available fast',
                      photo_url: '',
                      likes_count: 3,
                      comments_count: 1,
                      visibility: 'public',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    return originalFrom(table);
  };

  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  supabase.auth.getSession = async () => ({ data: { session: { user: { id: 'likes-user' } } }, error: null }) as any;
  let unsubscribe = () => {};
  try {
    let firstContentAt = 0;
    let likedContentAt = 0;
    const subscriptionStart = Date.now();
    unsubscribe = subscribeToPublicWorkoutLogs((logs) => {
      if (!firstContentAt) firstContentAt = Date.now() - subscriptionStart + 1;
      if (logs[0]?.isLiked === true) likedContentAt = Date.now() - subscriptionStart;
    }, undefined, 25);
    // Calling fetchPublicWorkoutLogs returns logs immediately without waiting for the 400ms slow likes
    const fetchStart = Date.now();
    const fetchedLogs = await fetchPublicWorkoutLogs(25);
    const fetchDuration = Date.now() - fetchStart;

    assert.ok(fetchDuration < 200, `fetchPublicWorkoutLogs returned in ${fetchDuration}ms (<200ms), before 400ms slow likes`);
    assert.strictEqual(fetchedLogs.length, 1);
    assert.strictEqual(fetchedLogs[0].id, 'log-slow-1');
    assert.equal(fetchedLogs[0].isLiked, undefined, 'unknown is not falsely mapped to unliked');
    await sleep(20);
    assert.ok(likesQueryStarted, 'the slow batch actually ran');
    assert.ok(firstContentAt > 0 && firstContentAt < 200, 'subscriber displays content before likes');
    assert.equal(likesQueryCompleted, false);
    await sleep(430);
    assert.ok(likedContentAt >= 400, 'subscriber receives delayed like patch');
    console.log(`Measured fixture stages: feed=${firstContentAt}ms, likes=${likedContentAt}ms`);
    assert.strictEqual(fetchedLogs[0].userName, 'Fast Log');
  } finally {
    (supabase as any).from = originalFrom;
  }

  unsubscribe();
  supabase.auth.getSession = originalGetSession;
  console.log('✅ PASSED: Feed fetch returns logs before batch likes with bounded cancellation');
}

// ---------------------------------------------------------------------------
// 3. Stale Response Rejection: Out-of-Order Fetches Must Never Overwrite
// ---------------------------------------------------------------------------
console.log('--- Testing Stale Response Prevention (No Stale Overwrite) ---');

{
  // Simulate out-of-order responses on a unique domain key
  const domainKey = 'test-stale-feed';
  const deliveredVersions: string[] = [];

  const unsub = sharedFeedScheduler.subscribe(
    domainKey,
    async () => [],
    () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
    (logs) => {
      deliveredVersions.push(logs[0]?.note || 'empty');
    },
  );

  // We manually simulate two fetches with different response durations:
  // Request 1: starts first, but delayed by 100ms (older data: "state-1")
  // Request 2: starts second, but completes fast in 20ms (newer data: "state-2")
  await sleep(1); // let the subscription's initial empty fetch settle
  const req1 = sharedFeedScheduler.fetch(
    domainKey,
    async () => {
      await sleep(100);
      return [normalizeLog({
        id: 'log-1',
        user_id: 'u1',
        user_name: 'Old',
        user_photo: '',
        created_at: new Date().toISOString(),
        category: 'Others',
        exercises: [],
        note: 'state-1 (stale)',
        photo_url: '',
        likes_count: 0,
        comments_count: 0,
        visibility: 'public',
      })];
    },
  );

  void req1.catch(() => undefined);
  // Small delay before starting request 2
  await sleep(10);

  const req2 = sharedFeedScheduler.fetch(
    `${domainKey}-alt`,
    async () => [],
  );

  // Advance version on domainKey for request 2
  const req2OnDomain = sharedFeedScheduler.fetch(
    domainKey,
    async () => {
      await sleep(15);
      return [normalizeLog({
        id: 'log-1',
        user_id: 'u1',
        user_name: 'Fresh',
        user_photo: '',
        created_at: new Date().toISOString(),
        category: 'Others',
        exercises: [],
        note: 'state-2 (fresh)',
        photo_url: '',
        likes_count: 1,
        comments_count: 0,
        visibility: 'public',
      })];
    },
    { force: true },
  );

  // Explicit retry replaces/cancels the older read even if its transport ignores abort.
  await Promise.allSettled([req1, req2, req2OnDomain]);
  await sleep(120);

  // Last delivered version to subscriber MUST be state-2 (fresh), never overwritten by state-1 (stale)
  const lastDelivered = deliveredVersions[deliveredVersions.length - 1];
  assert.strictEqual(lastDelivered, 'state-2 (fresh)', 'Stale older response did not overwrite fresh newer response');

  unsub();
  console.log('✅ PASSED: Out-of-order stale responses are safely dropped without overwriting');
}

// ---------------------------------------------------------------------------
// 4. New Empty Feeds: Graceful Resolution with Zero Errors
// ---------------------------------------------------------------------------
console.log('--- Testing New Empty Feed Resolution ---');

{
  // Test empty feed handling
  const originalFrom = supabase.from.bind(supabase);
  (supabase as any).from = function (table: string) {
    if (table === 'workout_logs') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                abortSignal: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    return originalFrom(table);
  };

  try {
    const emptyLogs = await fetchPublicWorkoutLogs(20);
    assert.ok(Array.isArray(emptyLogs), 'Empty logs returns array');
    assert.strictEqual(emptyLogs.length, 0, 'Empty logs length is 0');

    // Subscription also receives [] cleanly
    let subLogs: any = null;
    const unsub = subscribeToPublicWorkoutLogs((logs) => {
      subLogs = logs;
    }, undefined, 20);

    await sleep(50);
    assert.ok(Array.isArray(subLogs), 'Subscriber receives empty array without error');
    assert.strictEqual(subLogs.length, 0, 'Subscriber logs length is 0');
    unsub();
  } finally {
    (supabase as any).from = originalFrom;
  }

  // Test empty teamId or userId fails-closed returning []
  const emptyTeamLogs = await fetchTeamWorkoutLogs('');
  assert.deepStrictEqual(emptyTeamLogs, [], 'Empty teamId returns []');

  const emptyMyLogs = await fetchMyWorkoutLogs('');
  assert.deepStrictEqual(emptyMyLogs, [], 'Empty userId returns []');

  console.log('✅ PASSED: New empty feeds resolve cleanly to empty arrays without crashing');
}

// ---------------------------------------------------------------------------
// 5. Resume Dedup: Concurrent In-Flight Reads Coalesced
// ---------------------------------------------------------------------------
console.log('--- Testing Resume Dedup & Concurrent In-Flight Read Coalescing ---');

{
  const originalFrom = supabase.from.bind(supabase);
  let queryCount = 0;

  (supabase as any).from = function (table: string) {
    if (table === 'workout_logs') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                abortSignal: async () => {
                  queryCount++;
                  await sleep(60);
                  return {
                    data: [
                      {
                        id: 'dedup-log-1',
                        user_id: 'u-dedup',
                        user_name: 'Dedup Tester',
                        user_photo: '',
                        created_at: new Date().toISOString(),
                        category: 'Back',
                        exercises: [],
                        note: 'Coalesced',
                        photo_url: '',
                        likes_count: 2,
                        comments_count: 0,
                        visibility: 'public',
                      },
                    ],
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      };
    }
    return originalFrom(table);
  };

  try {
    // Simulate multiple simultaneous triggers (e.g. app resume + window focus + mount)
    queryCount = 0;
    const [resA, resB, resC] = await Promise.all([
      fetchPublicWorkoutLogs(30),
      fetchPublicWorkoutLogs(30),
      fetchPublicWorkoutLogs(30),
    ]);

    assert.strictEqual(queryCount, 1, 'Exactly ONE database query was fired for 3 concurrent calls (resume dedup)');
    assert.strictEqual(resA.length, 1);
    assert.strictEqual(resB.length, 1);
    assert.strictEqual(resC.length, 1);
    assert.strictEqual(resA[0].id, 'dedup-log-1');
    assert.strictEqual(resB[0].id, 'dedup-log-1');
    assert.strictEqual(resC[0].id, 'dedup-log-1');

    // After the in-flight read settles, a subsequent read performs a fresh query
    await sleep(20);
    const freshRes = await fetchPublicWorkoutLogs(30);
    assert.strictEqual(queryCount, 2, 'Subsequent call after settlement triggers a new query');
    assert.strictEqual(freshRes[0].id, 'dedup-log-1');
  } finally {
    (supabase as any).from = originalFrom;
  }

  console.log('✅ PASSED: Concurrent in-flight reads are properly deduplicated (single-flight)');
}

// ---------------------------------------------------------------------------
// 6. Central Fetch: Deadlines for Reads, Strictly NO Automatic Write Retries
// ---------------------------------------------------------------------------
console.log('--- Testing Central Fetch Deadlines & No Write Retries ---');

{
  const originalFetch = globalThis.fetch;
  let writeCallCount = 0;

  // Mock global fetch to simulate a network error on a write
  globalThis.fetch = async (input: any, init?: any) => {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      writeCallCount++;
      throw new Error('Network write failure simulation');
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    // Execute a POST write through customFetch
    writeCallCount = 0;
    try {
      await customFetch('https://example.com/api/save', {
        method: 'POST',
        body: JSON.stringify({ note: 'Workout' }),
      });
      assert.fail('Should have failed');
    } catch (err: any) {
      assert.ok(err.message.includes('Network write failure simulation'));
      assert.strictEqual(writeCallCount, 1, 'Write was executed exactly once — NO automatic retries!');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('✅ PASSED: Central fetch policy enforces no automatic write retries');
}

console.log('\n🎉 ALL REQUEST INFRA & FEED SCHEDULER TESTS PASSED SUCCESSFULLY!');
