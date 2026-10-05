import fs from 'node:fs';
import path from 'node:path';
import {
  setCachedPublicLogs,
  getCachedPublicLogs,
  setCachedMyLogs,
  getCachedMyLogs,
  updateCachedLogsProfile,
  clearPublicFeedCache,
} from '../src/utils/feedCache';
import type { WorkoutLog } from '../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`❌ FAILED: ${message}`);
  console.log(`✅ PASSED: ${message}`);
}

// In-memory localStorage mock for node test environment
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

(globalThis as any).localStorage = new MemoryStorage();

console.log('--- Testing Profile Nickname & Avatar Cascade Sync ---');

// 1. Setup mock workout logs in cache
const userA_id = 'user-alice-123';
const userB_id = 'user-bob-456';

const sampleLogs: WorkoutLog[] = [
  {
    id: 'log-1',
    userId: userA_id,
    userName: '旧昵称Alice',
    userPhoto: 'https://example.com/old-alice.jpg',
    timestamp: new Date().toISOString(),
    category: 'Chest',
    exercises: [],
    note: '训练1',
    photoUrl: '',
    likesCount: 2,
    commentsCount: 1,
    visibility: 'public',
  },
  {
    id: 'log-2',
    userId: userB_id,
    userName: 'Bob健美',
    userPhoto: '',
    timestamp: new Date().toISOString(),
    category: 'Back',
    exercises: [],
    note: '训练2',
    photoUrl: '',
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
  {
    id: 'log-3',
    userId: userA_id,
    userName: '旧昵称Alice',
    userPhoto: 'https://example.com/old-alice.jpg',
    timestamp: new Date().toISOString(),
    category: 'Legs',
    exercises: [],
    note: '训练3',
    photoUrl: '',
    likesCount: 5,
    commentsCount: 2,
    visibility: 'public',
  },
];

// Seed public cache and personal cache
setCachedPublicLogs(sampleLogs);
setCachedMyLogs(userA_id, [sampleLogs[0], sampleLogs[2]]);

assert(getCachedPublicLogs().length === 3, 'Public feed seeded with 3 logs');
assert(getCachedMyLogs(userA_id).length === 2, 'Personal feed seeded with 2 logs');

// 2. Perform nickname and avatar cascade update in cache
updateCachedLogsProfile(userA_id, {
  userName: '新昵称Alice Pro',
  userPhoto: 'https://example.com/new-alice.jpg',
});

// 3. Verify public feed cache synchronization
const updatedPublic = getCachedPublicLogs();
assert(updatedPublic[0].userName === '新昵称Alice Pro', 'Public feed log-1 userName updated to new nickname');
assert(updatedPublic[0].userPhoto === 'https://example.com/new-alice.jpg', 'Public feed log-1 userPhoto updated');
assert(updatedPublic[1].userName === 'Bob健美', 'Other user Bob log-2 userName remains intact');
assert(updatedPublic[2].userName === '新昵称Alice Pro', 'Public feed log-3 userName updated to new nickname');

// 4. Verify personal feed cache synchronization
const updatedMy = getCachedMyLogs(userA_id);
assert(updatedMy[0].userName === '新昵称Alice Pro', 'Personal feed log-1 userName updated');
assert(updatedMy[1].userName === '新昵称Alice Pro', 'Personal feed log-3 userName updated');
assert(updatedMy[0].userPhoto === 'https://example.com/new-alice.jpg', 'Personal feed log-1 userPhoto updated');

// 5. Test partial update (only nickname, photo preserved)
updateCachedLogsProfile(userA_id, {
  userName: '超绝肌肉金刚芭比Alice',
});
const partialUpdatePublic = getCachedPublicLogs();
assert(partialUpdatePublic[0].userName === '超绝肌肉金刚芭比Alice', 'Partial update updates nickname');
assert(partialUpdatePublic[0].userPhoto === 'https://example.com/new-alice.jpg', 'Partial update preserves existing photo');

// 6. Verify database migration 0011 contract
const root = process.cwd();
const migration0011Path = path.join(root, 'supabase/migrations/0011_sync_profile_display_name_to_logs.sql');
assert(fs.existsSync(migration0011Path), 'Migration 0011 file exists');
const migration0011Content = fs.readFileSync(migration0011Path, 'utf8');

assert(
  migration0011Content.includes('sync_profile_display_name_to_logs'),
  'Migration defines sync_profile_display_name_to_logs function',
);
assert(
  migration0011Content.includes('update public.workout_logs'),
  'Migration cascades updates to workout_logs table',
);
assert(
  migration0011Content.includes('update public.workout_comments'),
  'Migration cascades updates to workout_comments table',
);
assert(
  migration0011Content.includes('create trigger sync_profile_display_name'),
  'Migration sets up profile update trigger',
);
assert(
  migration0011Content.includes('user_name is distinct from p.display_name'),
  'Migration includes historical data backfill logic',
);

// 7. Verify api.ts contract for profile update cascade
const apiPath = path.join(root, 'src/api.ts');
const apiContent = fs.readFileSync(apiPath, 'utf8');

assert(
  apiContent.includes(".from('workout_logs')") &&
  apiContent.includes(".update(logsPayload)") &&
  apiContent.includes(".eq('user_id', userId)"),
  'api.ts directly executes workout_logs update for immediate consistency',
);
assert(
  apiContent.includes("updateCachedLogsProfile(userId"),
  'api.ts triggers local SWR cache update',
);
assert(
  apiContent.includes("fitgroup:user-profile-updated"),
  'api.ts broadcasts fitgroup:user-profile-updated event',
);

// 8. Verify UI components listen to the profile update event
const feedPath = path.join(root, 'src/components/Feed.tsx');
const feedContent = fs.readFileSync(feedPath, 'utf8');
assert(
  feedContent.includes("fitgroup:user-profile-updated"),
  'Feed.tsx listens for profile update event to instantly sync active public/my logs',
);

const teamDashboardPath = path.join(root, 'src/components/TeamDashboard.tsx');
const teamContent = fs.readFileSync(teamDashboardPath, 'utf8');
assert(
  teamContent.includes("fitgroup:user-profile-updated"),
  'TeamDashboard.tsx listens for profile update event to instantly sync team logs and members',
);

const statsPath = path.join(root, 'src/components/Statistics.tsx');
const statsContent = fs.readFileSync(statsPath, 'utf8');
assert(
  statsContent.includes("fitgroup:user-profile-updated"),
  'Statistics.tsx listens for profile update event to sync userProfile, logs, and leaderboard',
);

const profilePath = path.join(root, 'src/components/Profile.tsx');
const profileContent = fs.readFileSync(profilePath, 'utf8');
assert(
  profileContent.includes("个人档案及历史打卡记录已同步更新"),
  'Profile.tsx informs user that history logs are synchronized after nickname update',
);

console.log('🎉 ALL PROFILE NICKNAME & HISTORICAL LOGS SYNC TESTS PASSED SUCCESSFULLY!');
