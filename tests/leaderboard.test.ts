import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CommunityLeaderboard from '../src/components/CommunityLeaderboard';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`❌ FAILED: ${message}`);
  console.log(`✅ PASSED: ${message}`);
}

const root = process.cwd();
const apiCode = fs.readFileSync(path.join(root, 'src/api.ts'), 'utf8');
const statsComponentCode = fs.readFileSync(path.join(root, 'src/components/Statistics.tsx'), 'utf8');
const migration0010 = fs.readFileSync(path.join(root, 'supabase/migrations/0010_leaderboard_total_workouts.sql'), 'utf8');

console.log('--- Testing Group Leaderboard (Total Workouts Logic) ---');

// 1. Check getLeaderboard query contract in src/api.ts
assert(
  apiCode.includes(".from('public_profiles')"),
  'getLeaderboard queries public_profiles view',
);

assert(
  apiCode.includes(".order('total_workouts', { ascending: false })"),
  'getLeaderboard orders primarily by total_workouts descending',
);

assert(
  apiCode.includes(".order('streak', { ascending: false })"),
  'getLeaderboard preserves streak as secondary tie-breaker',
);

// 2. Verify the extracted leaderboard renders totals, including a zero fallback.
assert(
  statsComponentCode.includes('<CommunityLeaderboard entries={groupStats} />'),
  'Statistics passes subscribed leaderboard data to CommunityLeaderboard',
);
const leaderboardMarkup = renderToStaticMarkup(createElement(CommunityLeaderboard, {
  entries: [{ uid: 'one', displayName: 'Alice', totalWorkouts: 42 }, { uid: 'two', displayName: 'Bob' }],
}));
assert(/42<span[^>]*>次<\/span>/.test(leaderboardMarkup), 'Leaderboard renders total count with 次');
assert(/0<span[^>]*>次<\/span>/.test(leaderboardMarkup), 'Leaderboard renders zero when total count is absent');
assert(leaderboardMarkup.indexOf('Alice') < leaderboardMarkup.indexOf('Bob'), 'Leaderboard preserves server ranking');

// 3. Verify migration adds index for total_workouts
assert(
  migration0010.includes('profiles_total_workouts_desc') &&
  migration0010.includes('total_workouts desc'),
  'Migration 0010 creates index on profiles(total_workouts desc)',
);

// 4. In-memory sorting simulation test
type MockProfile = {
  id: string;
  display_name: string;
  streak: number;
  total_workouts: number;
};

const mockProfiles: MockProfile[] = [
  { id: '1', display_name: 'Alice', streak: 10, total_workouts: 50 },
  { id: '2', display_name: 'Bob', streak: 30, total_workouts: 30 },
  { id: '3', display_name: 'Charlie', streak: 5, total_workouts: 50 },
  { id: '4', display_name: 'David', streak: 0, total_workouts: 100 },
];

// Sort logic: total_workouts desc, then streak desc
const sorted = [...mockProfiles].sort((a, b) => {
  if (b.total_workouts !== a.total_workouts) {
    return b.total_workouts - a.total_workouts;
  }
  return b.streak - a.streak;
});

assert(sorted[0].display_name === 'David', 'Rank 1 is David with highest total_workouts (100)');
assert(sorted[1].display_name === 'Alice', 'Rank 2 is Alice with total_workouts=50, streak=10 (tie-break)');
assert(sorted[2].display_name === 'Charlie', 'Rank 3 is Charlie with total_workouts=50, streak=5 (tie-break)');
assert(sorted[3].display_name === 'Bob', 'Rank 4 is Bob with total_workouts=30');

console.log('🎉 ALL LEADERBOARD TESTS PASSED SUCCESSFULLY!');
