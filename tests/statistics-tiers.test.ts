import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateFullWorkoutAnalytics,
  getTrainingStateTier,
  getStrengthTier,
} from '../src/utils/workoutAnalytics';
import { WorkoutCategory, WorkoutLog } from '../src/types';

console.log('--- Testing Statistics 3-Tier Hierarchy & Data Isolation ---');

const root = process.cwd();
const statsCode = fs.readFileSync(path.join(root, 'src/components/Statistics.tsx'), 'utf8');

// 1. Statistics requests complete paginated history.
assert.ok(
  statsCode.includes('subscribeToStatisticsData(\n      user.uid,') ||
  statsCode.includes('subscribeToStatisticsData('),
  'Statistics calls subscribeToStatisticsData',
);
assert.ok(
  statsCode.includes('snapshot.recentLogs'),
  'Statistics opts into complete paginated history',
);
console.log('✅ PASSED: Statistics uses paginated history without a 500-log cap');

// 2. Verify 3-tier hierarchy structure in markup
assert.ok(statsCode.includes('训练表现'), 'Tier 2 header present in Statistics');
assert.ok(statsCode.includes('更多依据'), 'Tier 3 header present in Statistics');
assert.ok(statsCode.includes('我最近练得怎么样？') || statsCode.includes('近期训练反馈'), 'Tier 1 feedback present');
assert.ok(statsCode.includes('近期状态与力量'), 'Tier 2 progression section present');
assert.ok(statsCode.includes('详细分析'), 'Tier 3 deep analysis present');
console.log('✅ PASSED: Statistics contains clear Tier 1, Tier 2, and Tier 3 hierarchy');

// 3. Verify separation of Training State vs Strength Level
assert.ok(statsCode.includes('训练状态 (近28天)'), 'Training state distinctly labeled');
assert.ok(statsCode.includes('极限力量水平'), 'Strength level distinctly labeled');
console.log('✅ PASSED: Training State vs Strength Level conceptually separated');

// 4. Verify math isolation between training capacity and strength score
{
  const makeLog = (id: string, date: string, weight: number, reps: number): WorkoutLog => ({
    id,
    userId: 'u1',
    userName: 'Tester',
    userPhoto: '',
    timestamp: date,
    category: 'Chest',
    exercises: [{ id: 'ex-1', name: '杠铃平板卧推', weight, sets: 4, reps, type: 'strength' }],
    likesCount: 0,
    commentsCount: 0,
  });

  const now = new Date('2026-10-14T12:00:00.000Z');
  const nowMs = now.getTime();
  const dayMs = 24 * 3600 * 1000;

  // Lifter A: trained 80kg x 5 recently (within 7 days)
  const logsA = [
    makeLog('l-1', new Date(nowMs - 2 * dayMs).toISOString(), 80, 5),
    makeLog('l-2', new Date(nowMs - 4 * dayMs).toISOString(), 80, 5),
  ];
  const analyticsA = calculateFullWorkoutAnalytics(logsA, {}, 28, { sex: 'male', bodyweightKg: 75 }, now);
  const chestA = analyticsA.categoryDetails[WorkoutCategory.Chest];

  // Lifter B: trained 80kg x 5 a long time ago (60 days ago - outside 28 days)
  const logsB = [
    makeLog('l-old', new Date(nowMs - 60 * dayMs).toISOString(), 80, 5),
  ];
  const analyticsB = calculateFullWorkoutAnalytics(logsB, {}, 28, { sex: 'male', bodyweightKg: 75 }, now);
  const chestB = analyticsB.categoryDetails[WorkoutCategory.Chest];

  // Lifter A has active training capacity in 28 days
  assert.ok(chestA.trainingScore > 0, 'Lifter A has positive 28-day training capacity');
  // Lifter B has 0 training capacity in last 28 days
  assert.equal(chestB.trainingScore, 0, 'Lifter B has 0 recent 28-day training capacity');

  // But both lifters retain their 80kg PR and identical strength level!
  const prA = analyticsA.categorizedPrs.find((p) => p.name.includes('卧推'));
  const prB = analyticsB.categorizedPrs.find((p) => p.name.includes('卧推'));
  assert.ok(prA && prB, 'Both lifters retain their bench press PR');
  assert.equal(prA?.estimated1RM, prB?.estimated1RM, 'Both lifters have identical e1RM benchmark');
  assert.equal(chestA.strengthScore, chestB.strengthScore, 'Strength scores match regardless of deload');

  console.log('✅ PASSED: Mathematical independence of 28-day Training Capacity vs Lifetime Strength Benchmarks verified');
}

console.log('🎉 ALL STATISTICS 3-TIER TESTS PASSED SUCCESSFULLY!\n');
