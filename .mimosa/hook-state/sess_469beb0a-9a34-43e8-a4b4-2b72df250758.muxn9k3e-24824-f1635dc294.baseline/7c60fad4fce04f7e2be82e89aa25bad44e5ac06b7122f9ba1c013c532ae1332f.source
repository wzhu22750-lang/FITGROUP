import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Mock LocalStorage environment for Node/tsx runner
// ---------------------------------------------------------------------------
const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

// Import supabase client and target api functions
const { supabase } = await import('../src/lib/supabase');
const {
  waitForAuthReady,
  onAuthStateChangedFn,
  ensureUserProfile,
  getCurrentUser,
  logout,
  loginWithEmail,
  registerWithEmail,
  createWorkoutLog,
  isProfileReady,
  waitForProfileReady,
  getUserProfile,
} = await import('../src/api');

function testLog(passed: boolean, message: string) {
  if (passed) {
    console.log(`✅ PASSED: ${message}`);
  } else {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
}

async function runTestSuite() {
  console.log('\n--- Testing Auth / Profile Decoupling & Startup State Machine ---');

  // =========================================================================
  // Test Group 1: Auth Hung Profile (Immediate Auth Never Blocked by Profile)
  // =========================================================================
  {
    console.log('\n[1] Testing Auth Hung Profile: immediate auth resolution');

    // Scenario: getSession returns a valid session immediately, but profile RPC hangs forever
    supabase.auth.getSession = async () => ({
      data: {
        session: {
          user: {
            id: 'user-hung-1',
            email: 'hung@fitgroup.app',
            user_metadata: { display_name: 'HungAuthUser' },
          },
        },
      },
      error: null,
    } as any);

    // Profile RPC never settles (hung)
    let hungSignalCaptured: AbortSignal | null = null;
    supabase.rpc = (_fn: string) => {
      return {
        abortSignal(sig: AbortSignal) {
          hungSignalCaptured = sig;
          return this;
        },
        then() {
          // Never calls resolve or reject - permanently hung
          return new Promise(() => {});
        },
      } as any;
    };

    const startTime = Date.now();
    const resolvedUser = await waitForAuthReady(2000);
    const elapsed = Date.now() - startTime;

    testLog(
      elapsed < 100,
      `waitForAuthReady resolves immediately without waiting for hung profile (${elapsed}ms < 100ms)`,
    );
    testLog(
      resolvedUser !== null && resolvedUser.id === 'user-hung-1',
      'waitForAuthReady returns real session auth-only user immediately',
    );
    testLog(
      resolvedUser?.displayName === 'HungAuthUser',
      'auth-only immediate user extracts metadata displayName',
    );
    testLog(
      getCurrentUser()?.id === 'user-hung-1',
      'getCurrentUser matches immediately resolved auth user',
    );

    // Also verify onAuthStateChangedFn fires immediately even with hung profile
    let authListenerCb: any = null;
    supabase.auth.onAuthStateChange = ((cb: any) => {
      authListenerCb = cb;
      return { data: { subscription: { id: 'mock-sub-1', callback: cb, unsubscribe: () => {} } } };
    }) as any;

    let listenerReceivedUser: any = null;
    const unsub = onAuthStateChangedFn((u) => {
      listenerReceivedUser = u;
    });

    authListenerCb?.('SIGNED_IN', {
      user: {
        id: 'user-hung-2',
        email: 'hung2@fitgroup.app',
        user_metadata: { display_name: 'ImmediateListener' },
      },
    });

    testLog(
      listenerReceivedUser !== null && listenerReceivedUser.id === 'user-hung-2',
      'onAuthStateChangedFn invokes callback immediately with auth user when profile hangs',
    );
    testLog(
      listenerReceivedUser?.displayName === 'ImmediateListener',
      'onAuthStateChangedFn immediate user reflects auth user metadata',
    );
    unsub();

    // Clean up
    await logout();
  }

  // =========================================================================
  // Test Group 2: Real Session Only, Never Cached Authentication
  // =========================================================================
  {
    console.log('\n[2] Testing Real Session Only: never cached authentication');

    // Seed localStorage with a stale cached profile from a prior session
    const staleProfile = {
      id: 'stale-user-999',
      uid: 'stale-user-999',
      displayName: 'Stale Ghost User',
      photoURL: '',
      streak: 42,
      totalWorkouts: 100,
      prs: {},
    };
    mockStorage.setItem('fitgroup_cached_user_profile', JSON.stringify(staleProfile));

    // Case 2a: No real session exists (user logged out or expired session)
    supabase.auth.getSession = async () => ({
      data: { session: null },
      error: null,
    } as any);

    const userNoSession = await waitForAuthReady(1000);
    testLog(
      userNoSession === null,
      'waitForAuthReady resolves null when real session is null (never uses cached user as auth)',
    );
    testLog(
      getCurrentUser() === null,
      'getCurrentUser returns null when real session is null',
    );
    testLog(
      mockStorage.getItem('fitgroup_cached_user_profile') === null,
      'stale cached profile is cleared from storage when session is null',
    );

    // Case 2b: getSession throws or fails with error
    mockStorage.setItem('fitgroup_cached_user_profile', JSON.stringify(staleProfile));
    supabase.auth.getSession = async () => ({
      data: { session: null },
      error: new Error('Network error: token expired'),
    } as any);

    const userOnError = await waitForAuthReady(1000);
    testLog(
      userOnError === null,
      'waitForAuthReady resolves null when getSession fails (never falls back to cached authentication)',
    );
    testLog(
      getCurrentUser() === null,
      'getCurrentUser remains null on session error',
    );

    await logout();
  }

  // =========================================================================
  // Test Group 3: Profile Singleflight Dedup per UID
  // =========================================================================
  {
    console.log('\n[3] Testing Profile Singleflight Dedup per UID');

    let rpcCallCount = 0;
    supabase.rpc = (_fn: string) => {
      rpcCallCount++;
      return {
        abortSignal() { return this; },
        then(onResolve: (val: any) => void) {
          setTimeout(() => {
            onResolve({
              data: {
                id: 'user-dedup-1',
                display_name: 'Dedup Master',
                photo_url: 'https://fit.app/dedup.png',
                streak: 7,
                total_workouts: 15,
              },
              error: null,
            });
          }, 25);
        },
      } as any;
    };

    const targetUser = {
      id: 'user-dedup-1',
      email: 'dedup@fitgroup.app',
      user_metadata: { display_name: 'Fallback' },
    } as any;

    // Concurrently trigger 4 profile requests for the same UID
    const [p1, p2, p3, p4] = await Promise.all([
      ensureUserProfile(targetUser),
      ensureUserProfile(targetUser),
      ensureUserProfile(targetUser),
      ensureUserProfile(targetUser),
    ]);

    testLog(
      rpcCallCount === 1,
      `singleflight coalesced 4 concurrent ensureUserProfile calls into exactly 1 RPC call (actual: ${rpcCallCount})`,
    );
    testLog(
      p1.displayName === 'Dedup Master' &&
      p2.displayName === 'Dedup Master' &&
      p3.displayName === 'Dedup Master' &&
      p4.displayName === 'Dedup Master',
      'all concurrent callers received the identical profile data',
    );
    testLog(
      p1 === p2 && p2 === p3 && p3 === p4,
      'all concurrent callers received the exact same object reference from singleflight',
    );

    // After settlement, singleflight map is cleaned up and allows a fresh fetch
    await new Promise((r) => setTimeout(r, 10));
    await ensureUserProfile(targetUser);
    testLog(
      rpcCallCount === 2,
      'subsequent fetch after settlement correctly initiates a new RPC call',
    );

    await logout();
  }

  // =========================================================================
  // Test Group 4: Account Switch, Generation Guard & Abort on Switch
  // =========================================================================
  {
    console.log('\n[4] Testing Account Switch: abort signal & generation guard');

    let capturedAbortSignalUserA: AbortSignal | null = null;
    let resolveUserAProfile: (() => void) | null = null;

    supabase.rpc = (fn: string) => {
      return {
        abortSignal(sig: AbortSignal) {
          if (!capturedAbortSignalUserA) {
            capturedAbortSignalUserA = sig;
          }
          return this;
        },
        then(onResolve: (val: any) => void) {
          if (fn === 'get_my_profile' && !resolveUserAProfile) {
            resolveUserAProfile = () => {
              onResolve({
                data: {
                  id: 'user-alpha',
                  display_name: 'Alpha User',
                  photo_url: '',
                  streak: 10,
                },
                error: null,
              });
            };
          }
        },
      } as any;
    };

    let authCb: any = null;
    supabase.auth.onAuthStateChange = ((cb: any) => {
      authCb = cb;
      return { data: { subscription: { id: 'mock-sub-2', callback: cb, unsubscribe: () => {} } } };
    }) as any;

    const unsub = onAuthStateChangedFn(() => {});

    // Step 1: User Alpha logs in
    authCb?.('SIGNED_IN', {
      user: { id: 'user-alpha', email: 'alpha@fitgroup.app', user_metadata: { display_name: 'Alpha' } },
    });

    testLog(
      getCurrentUser()?.id === 'user-alpha',
      'user-alpha is active user immediately after Alpha login',
    );

    // Auth callbacks deliberately defer SDK work outside the auth lock.
    await new Promise((r) => setTimeout(r, 5));

    // Step 2: Account switch to User Beta occurs while User Alpha profile is still in-flight
    authCb?.('SIGNED_IN', {
      user: { id: 'user-beta', email: 'beta@fitgroup.app', user_metadata: { display_name: 'Beta' } },
    });

    testLog(
      capturedAbortSignalUserA !== null && (capturedAbortSignalUserA as AbortSignal).aborted,
      'User Alpha in-flight profile fetch was aborted immediately upon account switch',
    );
    testLog(
      getCurrentUser()?.id === 'user-beta',
      'getCurrentUser is immediately updated to user-beta on switch',
    );

    // Step 3: User Alpha late response attempts to resolve now
    if (resolveUserAProfile) {
      resolveUserAProfile();
    }
    await new Promise((r) => setTimeout(r, 20));

    testLog(
      getCurrentUser()?.id === 'user-beta',
      'generation guard discarded User Alpha late response; User Alpha NEVER overwrote User Beta',
    );
    testLog(
      getCurrentUser()?.displayName === 'Beta',
      'current user retains User Beta identity intact',
    );

    unsub();
    await logout();
  }

  // =========================================================================
  // Test Group 5: Profile Ready Gating Writes Dependent on Profile
  // =========================================================================
  {
    console.log('\n[5] Testing Profile Ready Gating Writes Dependent on Profile');

    let resolveDelayedProfile: (() => void) | null = null;
    supabase.rpc = (_fn: string) => {
      return {
        abortSignal() { return this; },
        then(onResolve: (val: any) => void) {
          resolveDelayedProfile = () => {
            onResolve({
              data: {
                id: 'user-writer',
                display_name: 'Verified Champion',
                photo_url: 'https://fit.app/champion.png',
                streak: 5,
                total_workouts: 20,
              },
              error: null,
            });
          };
        },
      } as any;
    };

    let insertedLogPayload: any = null;
    supabase.from = (table: string) => {
      if (table === 'workout_logs') {
        return {
          insert(payload: any) {
            insertedLogPayload = payload;
            return { error: null };
          },
        } as any;
      }
      return {
        insert: () => ({ error: null }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      } as any;
    };

    supabase.auth.getSession = async () => ({
      data: {
        session: {
          user: {
            id: 'user-writer',
            email: 'writer@fitgroup.app',
            user_metadata: { display_name: 'FitGroup' }, // initial generic placeholder
          },
        },
      },
      error: null,
    } as any);

    let authCb: any = null;
    supabase.auth.onAuthStateChange = ((cb: any) => {
      authCb = cb;
      return { data: { subscription: { id: 'mock-sub-3', callback: cb, unsubscribe: () => {} } } };
    }) as any;

    const unsub = onAuthStateChangedFn(() => {});
    authCb?.('SIGNED_IN', {
      user: {
        id: 'user-writer',
        email: 'writer@fitgroup.app',
        user_metadata: { display_name: 'FitGroup' },
      },
    });

    testLog(
      !isProfileReady('user-writer'),
      'isProfileReady is false while profile fetch is in-flight',
    );

    // Write operation: createWorkoutLog is called while profile is still loading in background
    const writePromise = createWorkoutLog({
      note: 'Finished leg day squats',
      category: 'Legs',
      exercises: [{ name: '深蹲', sets: 4, reps: 10, weight: 100 }],
    });

    // Resolve delayed profile after 25ms
    setTimeout(() => {
      if (resolveDelayedProfile) resolveDelayedProfile();
    }, 25);

    const logResult = await writePromise;

    testLog(
      logResult !== null && typeof logResult.id === 'string',
      'createWorkoutLog completed successfully',
    );
    testLog(
      insertedLogPayload?.user_name === 'Verified Champion',
      'profile ready gating ensured workout log was written with resolved displayName (Verified Champion)',
    );
    testLog(
      insertedLogPayload?.user_photo === 'https://fit.app/champion.png',
      'profile ready gating ensured workout log was written with resolved userPhoto',
    );
    testLog(
      isProfileReady('user-writer'),
      'isProfileReady is true after profile has resolved',
    );

    unsub();
    await logout();
  }

  // =========================================================================
  // Test Group 6: Supabase Cancellation Support via abortSignal
  // =========================================================================
  {
    console.log('\n[6] Testing Supabase Cancellation Support: SDK abortSignal propagation');

    let passedSignal: AbortSignal | null = null;
    supabase.rpc = (_fn: string) => {
      return {
        abortSignal(sig: AbortSignal) {
          passedSignal = sig;
          return this;
        },
        then(onResolve: (val: any) => void) {
          onResolve({
            data: { id: 'user-cancel-1', display_name: 'Cancel Me', photo_url: '' },
            error: null,
          });
        },
      } as any;
    };

    const userCanceller = {
      id: 'user-cancel-1',
      email: 'cancel@fitgroup.app',
      user_metadata: {},
    } as any;

    await ensureUserProfile(userCanceller);

    testLog(
      passedSignal !== null && typeof (passedSignal as AbortSignal).addEventListener === 'function',
      'getMyProfileRow propagates AbortSignal to supabase.rpc().abortSignal()',
    );

    await logout();
  }

  // Actual login must return before a hung profile request (no fake auth manager).
  {
    const user = { id: 'login-hung', email: 'login@example.test', user_metadata: {} } as any;
    supabase.auth.signInWithPassword = async () => ({ data: { user, session: { user } }, error: null }) as any;
    let profileSignal: AbortSignal | undefined;
    supabase.rpc = (() => ({ abortSignal(signal: AbortSignal) { profileSignal = signal; return this; }, then() {} })) as any;
    const started = performance.now();
    const loggedIn = await loginWithEmail('login@example.test', 'test-only');
    assert.equal(loggedIn.uid, user.id);
    assert.ok(performance.now() - started < 100);
    assert.equal(isProfileReady(user.id), false);
    console.log(`Measured actual login with hung profile: ${Math.round(performance.now() - started)}ms`);
    await logout();
    assert.equal(profileSignal?.aborted, true);
    supabase.auth.signInWithPassword = async () => ({ data: { user, session: null }, error: null }) as any;
    await assert.rejects(loginWithEmail('login@example.test', 'test-only'), /登录失败/);
    assert.equal(getCurrentUser(), null, 'auth user without a real session is not authentication');
  }
  {
    let writes = 0;
    supabase.auth.signUp = async () => { writes++; return { data: { user: { id: 'pending-email' }, session: null }, error: null } as any; };
    await assert.rejects(registerWithEmail('confirm@example.test', 'test-only', 'Confirm'), /确认邮件/);
    assert.equal(getCurrentUser(), null, 'unconfirmed sign-up must not authenticate');
    assert.equal(writes, 1, 'registration is never automatically retried');
  }
  console.log('\n🎉 ALL STARTUP & AUTH/PROFILE DECOUPLING TESTS PASSED SUCCESSFULLY!\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected exception:', err);
  process.exit(1);
});
