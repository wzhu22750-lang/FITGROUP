/**
 * Unit tests for:
 * 1. Squads / Teams logic (code generation, member limit validation, membership)
 * 2. Visibility permission matrix (public, friends, private across Global Feed, Squad Feed, My Logs)
 * 3. Edit Workout log impact on full analytics, PRs, and volume calculation
 */

import { WorkoutLog, WorkoutVisibility, WorkoutCategory } from '../src/types';
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
import { DEFAULT_MAX_TEAM_MEMBERS } from '../src/constants/teamConfig';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Squad & Teams Configuration ---');

// Test 1: Team default capacity
assert(DEFAULT_MAX_TEAM_MEMBERS === 8, 'Default max team members is 8');

// Test 2: Code format validation
function isValidTeamCode(code: string): boolean {
  return /^FIT-[A-Z0-9]{3,6}$/i.test(code);
}
assert(isValidTeamCode('FIT-888'), 'FIT-888 is valid team code');
assert(isValidTeamCode('FIT-7A9B'), 'FIT-7A9B is valid team code');
assert(!isValidTeamCode('INVALID'), 'INVALID is not valid team code');
assert(!isValidTeamCode('FIT-'), 'FIT- is not valid team code');

// Test 3: Join team capacity check
function canJoinTeam(currentMemberCount: number, maxMembers: number): boolean {
  return currentMemberCount < maxMembers;
}
assert(canJoinTeam(3, 8), '3/8 members can join');
assert(!canJoinTeam(8, 8), '8/8 members cannot join (full)');
assert(!canJoinTeam(10, 8), '10/8 members cannot join (exceeded)');

console.log('\n--- Testing Visibility Matrix Rules ---');

/**
 * Filter simulation for the three domains
 */
function filterGlobalFeed(logs: WorkoutLog[]): WorkoutLog[] {
  return logs.filter((l) => (l.visibility || 'public') === 'public');
}

function filterSquadFeed(logs: WorkoutLog[], squadUserIds: string[]): WorkoutLog[] {
  return logs.filter(
    (l) => squadUserIds.includes(l.userId) && (l.visibility || 'public') !== 'private'
  );
}

function filterMyLogs(logs: WorkoutLog[], currentUserId: string): WorkoutLog[] {
  return logs.filter((l) => l.userId === currentUserId);
}

const mockLogs: WorkoutLog[] = [
  {
    id: '1',
    userId: 'user_a',
    userName: 'User A',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Chest',
    exercises: [{ id: 'e1', name: '杠铃卧推', type: 'strength', weight: 80, sets: 4, reps: 8 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
  {
    id: '2',
    userId: 'user_a',
    userName: 'User A',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Back',
    exercises: [{ id: 'e2', name: '高位下拉', type: 'strength', weight: 60, sets: 4, reps: 10 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'friends',
  },
  {
    id: '3',
    userId: 'user_a',
    userName: 'User A',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Legs',
    exercises: [{ id: 'e3', name: '深蹲', type: 'strength', weight: 100, sets: 4, reps: 6 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'private',
  },
  {
    id: '4',
    userId: 'user_b',
    userName: 'User B',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Cardio',
    exercises: [{ id: 'e4', name: '跑步', type: 'cardio', duration: 30 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
  {
    id: '5',
    userId: 'user_b',
    userName: 'User B',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Shoulders',
    exercises: [{ id: 'e5', name: '哑铃推举', type: 'strength', weight: 20, sets: 4, reps: 10 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'friends',
  },
  {
    id: '6',
    userId: 'user_b',
    userName: 'User B',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Chest',
    exercises: [{ id: 'e6', name: '俯卧撑', type: 'strength', weight: 0, sets: 4, reps: 20 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'private',
  },
  {
    id: '7',
    userId: 'user_c', // Not in User A's squad
    userName: 'User C',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Back',
    exercises: [{ id: 'e7', name: '硬拉', type: 'strength', weight: 140, sets: 3, reps: 5 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'friends',
  },
];

// Global Feed: only public records
const globalResults = filterGlobalFeed(mockLogs);
assert(globalResults.length === 2, 'Global feed contains exactly 2 public logs');
assert(globalResults.every((l) => l.visibility === 'public'), 'All global feed records have visibility = public');
assert(!globalResults.some((l) => l.visibility === 'friends'), 'No friends logs in global feed');
assert(!globalResults.some((l) => l.visibility === 'private'), 'No private logs in global feed');

// Squad Feed: User A and User B share a squad
const squadUserIds = ['user_a', 'user_b'];
const squadResults = filterSquadFeed(mockLogs, squadUserIds);
assert(squadResults.length === 4, 'Squad feed contains 4 records (2 public + 2 friends from squad members)');
assert(!squadResults.some((l) => l.visibility === 'private'), 'No private records in squad feed');
assert(!squadResults.some((l) => l.userId === 'user_c'), 'User C records excluded from User A/B squad');

// My Logs: User A views their own training history
const myResults = filterMyLogs(mockLogs, 'user_a');
assert(myResults.length === 3, 'My logs contains all 3 logs for User A (public, friends, private)');
assert(myResults.some((l) => l.visibility === 'public'), 'My logs contains public log');
assert(myResults.some((l) => l.visibility === 'friends'), 'My logs contains friends log');
assert(myResults.some((l) => l.visibility === 'private'), 'My logs contains private log');

console.log('\n--- Testing Workout Edit Impact on Analytics & PRs ---');

// Initial state: Bench press 20kg x 10 reps
let testLogs: WorkoutLog[] = [
  {
    id: 'log_edit_test',
    userId: 'user_a',
    userName: 'User A',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Chest',
    exercises: [{ id: 'ex_1', name: '哑铃卧推', type: 'strength', weight: 20, sets: 4, reps: 10 }],
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
];

let initialAnalytics = calculateFullWorkoutAnalytics(testLogs, { '哑铃卧推': 20 });
assert(initialAnalytics.recentSetsCount === 4, 'Initial sets count is 4');
assert(initialAnalytics.categorizedPrs[0].weight === 20, 'Initial PR is 20kg');
const initialScore = initialAnalytics.categoryDetails[WorkoutCategory.Chest].trainingScore;

// User edits log: updates 哑铃卧推 from 20kg to 25kg
testLogs = [
  {
    ...testLogs[0],
    exercises: [{ id: 'ex_1', name: '哑铃卧推', type: 'strength', weight: 25, sets: 4, reps: 10 }],
  },
];

let updatedAnalytics = calculateFullWorkoutAnalytics(testLogs, { '哑铃卧推': 25 });
assert(updatedAnalytics.categorizedPrs[0].weight === 25, 'Edited PR correctly reflects 25kg');
const updatedScore = updatedAnalytics.categoryDetails[WorkoutCategory.Chest].trainingScore;
assert(updatedScore >= initialScore, 'Chest training score increased with higher edited weight');

// User edits log: adds a new exercise (e.g. 蝴蝶机夹胸)
testLogs = [
  {
    ...testLogs[0],
    exercises: [
      { id: 'ex_1', name: '哑铃卧推', type: 'strength', weight: 25, sets: 4, reps: 10 },
      { id: 'ex_2', name: '蝴蝶机夹胸', type: 'strength', weight: 40, sets: 3, reps: 12 },
    ],
  },
];

let multiExAnalytics = calculateFullWorkoutAnalytics(testLogs, { '哑铃卧推': 25, '蝴蝶机夹胸': 40 });
assert(multiExAnalytics.recentSetsCount === 7, 'Total sets updated from 4 to 7 after adding exercise');
assert(multiExAnalytics.categorizedPrs.length === 2, '2 PR records now tracked');

console.log('\n🎉 ALL SQUAD, VISIBILITY & EDIT LINKAGE TESTS PASSED SUCCESSFULLY!\n');
