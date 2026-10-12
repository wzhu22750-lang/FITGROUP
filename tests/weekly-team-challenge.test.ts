import assert from 'node:assert/strict';
import { toLocalDateKey } from '../src/api';
import type { WeeklyTeamChallenge, WeeklyChallengeMemberProgress } from '../src/types';

console.log('--- Testing Weekly Team Challenge & Anti-Brushing Rules ---');

// Mock data generator for testing weekly challenge logic
function computeTestWeeklyChallenge(
  members: { userId: string; displayName: string }[],
  logs: { userId: string; created_at: string }[],
  now = new Date('2026-10-14T12:00:00.000Z') // Wednesday
): WeeklyTeamChallenge {
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const memberTargetDays = 3;
  const weekActiveDatesByUser = new Map<string, Set<string>>();

  logs.forEach((l) => {
    const localDate = toLocalDateKey(l.created_at);
    const logTime = new Date(l.created_at).getTime();

    if (logTime >= monday.getTime() && logTime <= sunday.getTime()) {
      let dates = weekActiveDatesByUser.get(l.userId);
      if (!dates) {
        dates = new Set<string>();
        weekActiveDatesByUser.set(l.userId, dates);
      }
      dates.add(localDate);
    }
  });

  const membersProgress: WeeklyChallengeMemberProgress[] = members.map((m) => {
    const activeDates = Array.from(weekActiveDatesByUser.get(m.userId) || []).sort();
    const activeDaysCount = activeDates.length;
    return {
      userId: m.userId,
      displayName: m.displayName,
      activeDaysCount,
      targetDays: memberTargetDays,
      isTargetMet: activeDaysCount >= memberTargetDays,
      activeDates,
    };
  });

  const teamTargetActiveDays = Math.max(1, members.length * memberTargetDays);
  const currentTeamActiveDays = membersProgress.reduce((sum, m) => sum + m.activeDaysCount, 0);
  const completionRate = Math.min(100, Math.round((currentTeamActiveDays / teamTargetActiveDays) * 100));
  const sortedByActivity = [...membersProgress].sort((a, b) => b.activeDaysCount - a.activeDaysCount);
  const mvpMember = sortedByActivity[0]?.activeDaysCount > 0 ? sortedByActivity[0] : undefined;
  const activeMembersCount = membersProgress.filter((m) => m.activeDaysCount > 0).length;

  const weekKey = `${monday.getFullYear()}-W${Math.ceil((((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`;

  return {
    weekKey,
    weekStartDate: monday.toISOString(),
    weekEndDate: sunday.toISOString(),
    memberTargetDays,
    teamTargetActiveDays,
    currentTeamActiveDays,
    completionRate,
    membersProgress,
    mvpMember,
    activeMembersCount,
  };
}

// 1. Anti-brushing test: Multiple workouts on the same day must count as 1 active day
{
  const members = [
    { userId: 'alice', displayName: 'Alice' },
    { userId: 'bob', displayName: 'Bob' },
  ];

  // Alice logs 5 workouts on Tuesday within the same local daytime (brushing)
  // Bob logs 1 workout on Tuesday, 1 on Wednesday, 1 on Friday (steady)
  const logs = [
    { userId: 'alice', created_at: '2026-10-13T02:00:00.000Z' },
    { userId: 'alice', created_at: '2026-10-13T04:00:00.000Z' },
    { userId: 'alice', created_at: '2026-10-13T06:00:00.000Z' },
    { userId: 'alice', created_at: '2026-10-13T08:00:00.000Z' },
    { userId: 'alice', created_at: '2026-10-13T10:00:00.000Z' },
    { userId: 'bob', created_at: '2026-10-13T03:00:00.000Z' },
    { userId: 'bob', created_at: '2026-10-14T03:00:00.000Z' },
    { userId: 'bob', created_at: '2026-10-16T03:00:00.000Z' },
  ];

  const challenge = computeTestWeeklyChallenge(members, logs);

  const alice = challenge.membersProgress.find((m) => m.userId === 'alice')!;
  const bob = challenge.membersProgress.find((m) => m.userId === 'bob')!;

  assert.equal(alice.activeDaysCount, 1, 'Alice 5 workouts on same day count as exactly 1 active day');
  assert.equal(alice.isTargetMet, false, 'Alice is not target met (needs 3 distinct days)');
  assert.equal(bob.activeDaysCount, 3, 'Bob 3 distinct days count as 3 active days');
  assert.equal(bob.isTargetMet, true, 'Bob met the 3-day weekly target');
  assert.equal(challenge.mvpMember?.userId, 'bob', 'Bob is MVP because he has more distinct active days');
  assert.equal(challenge.currentTeamActiveDays, 4, 'Total team active days = 1 (Alice) + 3 (Bob) = 4');
  assert.equal(challenge.teamTargetActiveDays, 6, 'Total team target = 2 members * 3 = 6 days');
  assert.equal(challenge.completionRate, 67, 'Completion rate = 4/6 = 67%');
  console.log('✅ PASSED: Anti-brushing contract: multiple same-day check-ins count as 1 active day');
}

// 2. Goal completion saturation at 100%
{
  const members = [{ userId: 'champion', displayName: 'Champ' }];
  // 5 days active
  const logs = [
    { userId: 'champion', created_at: '2026-10-12T09:00:00.000Z' },
    { userId: 'champion', created_at: '2026-10-13T09:00:00.000Z' },
    { userId: 'champion', created_at: '2026-10-14T09:00:00.000Z' },
    { userId: 'champion', created_at: '2026-10-15T09:00:00.000Z' },
    { userId: 'champion', created_at: '2026-10-16T09:00:00.000Z' },
  ];
  const challenge = computeTestWeeklyChallenge(members, logs);
  assert.equal(challenge.completionRate, 100, 'Completion rate is capped at 100%');
  assert.equal(challenge.membersProgress[0].isTargetMet, true, 'Champ is target met');
  console.log('✅ PASSED: Completion rate caps at 100%');
}

// 3. Prior week logs are excluded
{
  const members = [{ userId: 'alice', displayName: 'Alice' }];
  // Log from previous Sunday local daytime (2026-10-11 14:00 CST / 06:00 UTC)
  const logs = [{ userId: 'alice', created_at: '2026-10-11T06:00:00.000Z' }];
  const challenge = computeTestWeeklyChallenge(members, logs);
  assert.equal(challenge.currentTeamActiveDays, 0, 'Prior week logs are excluded from current week challenge');
  assert.equal(challenge.activeMembersCount, 0, 'Zero active members for current week');
  assert.equal(challenge.mvpMember, undefined, 'No MVP when zero workouts logged this week');
  console.log('✅ PASSED: Previous week logs do not bleed into current week challenge');
}

console.log('🎉 ALL WEEKLY TEAM CHALLENGE TESTS PASSED SUCCESSFULLY!\n');
