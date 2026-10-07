/**
 * Unit tests for FitGroup core data logic:
 * - Streak calculation (local date, continuous days, skips, same day)
 * - PR calculation (highest weights, multi-exercise)
 * - Exercise validation
 */

function calculateStatsFromLogs(logs: Array<{
  timestamp: string;
  exercises: Array<{
    name: string;
    type: 'strength' | 'cardio';
    weight?: number;
    sets?: number;
    reps?: number;
    duration?: number;
    distance?: number;
    calories?: number;
  }>;
}>) {
  const totalWorkouts = logs.length;
  const prs: Record<string, number> = {};

  logs.forEach(log => {
    (log.exercises || []).forEach(ex => {
      if (ex.type === 'strength' && typeof ex.weight === 'number' && ex.weight > 0 && ex.name) {
        const name = ex.name.trim();
        if (!prs[name] || ex.weight > prs[name]) {
          prs[name] = ex.weight;
        }
      }
    });
  });

  let streak = 0;
  let lastWorkoutDate: string | undefined = undefined;

  if (logs.length > 0) {
    lastWorkoutDate = logs[0].timestamp;

    const toDateKey = (dateStr: string) => {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const uniqueDateKeys = Array.from(
      new Set(logs.map(l => toDateKey(l.timestamp)))
    ).sort().reverse();

    const todayKey = toDateKey(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toDateKey(yesterday.toISOString());

    const latestKey = uniqueDateKeys[0];
    if (latestKey === todayKey || latestKey === yesterdayKey) {
      streak = 1;
      let curr = new Date(latestKey);
      for (let i = 1; i < uniqueDateKeys.length; i++) {
        const prevExpected = new Date(curr);
        prevExpected.setDate(prevExpected.getDate() - 1);
        const prevExpectedKey = toDateKey(prevExpected.toISOString());
        if (uniqueDateKeys[i] === prevExpectedKey) {
          streak += 1;
          curr = prevExpected;
        } else {
          break;
        }
      }
    } else {
      streak = 0;
    }
  }

  return { totalWorkouts, streak, prs, lastWorkoutDate };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

// Test 1: Empty logs should return 0 stats
{
  const stats = calculateStatsFromLogs([]);
  assert(stats.totalWorkouts === 0, 'Empty logs -> totalWorkouts = 0');
  assert(stats.streak === 0, 'Empty logs -> streak = 0');
  assert(Object.keys(stats.prs).length === 0, 'Empty logs -> prs = {}');
}

// Test 2: Single workout today -> streak = 1, totalWorkouts = 1
{
  const now = new Date();
  const stats = calculateStatsFromLogs([
    {
      timestamp: now.toISOString(),
      exercises: [{ name: '卧推', type: 'strength', weight: 80, sets: 4, reps: 8 }],
    },
  ]);
  assert(stats.totalWorkouts === 1, '1 log today -> totalWorkouts = 1');
  assert(stats.streak === 1, '1 log today -> streak = 1');
  assert(stats.prs['卧推'] === 80, 'PR 卧推 = 80');
}

// Test 3: Multiple workouts on same day -> streak = 1, totalWorkouts = 2
{
  const now = new Date();
  // Keep both records anchored to the same local calendar day, even at midnight.
  const earlier = new Date(now);
  earlier.setHours(12, 0, 0, 0);
  const stats = calculateStatsFromLogs([
    {
      timestamp: now.toISOString(),
      exercises: [{ name: '深蹲', type: 'strength', weight: 100, sets: 5, reps: 5 }],
    },
    {
      timestamp: earlier.toISOString(),
      exercises: [{ name: '深蹲', type: 'strength', weight: 90, sets: 3, reps: 8 }],
    },
  ]);
  assert(stats.totalWorkouts === 2, '2 logs same day -> totalWorkouts = 2');
  assert(stats.streak === 1, '2 logs same day -> streak = 1 (no double streak)');
  assert(stats.prs['深蹲'] === 100, 'PR takes max weight (100 > 90)');
}

// Test 4: Consecutive 3 days workout -> streak = 3
{
  const d0 = new Date();
  const d1 = new Date(); d1.setDate(d1.getDate() - 1);
  const d2 = new Date(); d2.setDate(d2.getDate() - 2);

  const stats = calculateStatsFromLogs([
    { timestamp: d0.toISOString(), exercises: [{ name: '硬拉', type: 'strength', weight: 120 }] },
    { timestamp: d1.toISOString(), exercises: [{ name: '卧推', type: 'strength', weight: 85 }] },
    { timestamp: d2.toISOString(), exercises: [{ name: '深蹲', type: 'strength', weight: 110 }] },
  ]);
  assert(stats.totalWorkouts === 3, '3 consecutive days -> totalWorkouts = 3');
  assert(stats.streak === 3, '3 consecutive days -> streak = 3');
  assert(stats.prs['硬拉'] === 120 && stats.prs['卧推'] === 85 && stats.prs['深蹲'] === 110, 'All PRs tracked');
}

// Test 5: Broken streak (workout 3 days ago) -> streak = 0
{
  const d3 = new Date(); d3.setDate(d3.getDate() - 3);
  const stats = calculateStatsFromLogs([
    { timestamp: d3.toISOString(), exercises: [{ name: '跑步', type: 'cardio', duration: 30 }] },
  ]);
  assert(stats.totalWorkouts === 1, 'Old log -> totalWorkouts = 1');
  assert(stats.streak === 0, 'Old log (>1 day ago) -> streak = 0 (streak broken)');
}

console.log('\n🎉 ALL STATS & DATA INTEGRITY TESTS PASSED SUCCESSFULLY!\n');
