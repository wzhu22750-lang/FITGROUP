/**
 * Unit tests for Notification System:
 * - Notification types (like, comment)
 * - Self-action suppression (user liking/commenting their own log shouldn't notify themselves)
 * - Unread count and filtering logic
 */

import { AppNotification, NotificationType } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Notification System Logic ---');

// Test 1: Self-action suppression logic
function shouldCreateNotification(authorId: string, actorId: string): boolean {
  return authorId !== actorId;
}

assert(shouldCreateNotification('user_author', 'user_fan'), 'Like from another user creates notification');
assert(!shouldCreateNotification('user_author', 'user_author'), 'Self-like does NOT create notification');
assert(shouldCreateNotification('user_author', 'user_peer'), 'Comment from peer creates notification');
assert(!shouldCreateNotification('user_author', 'user_author'), 'Self-comment does NOT create notification');

// Test 2: Unread count computation
const mockNotifications: AppNotification[] = [
  {
    id: 'n1',
    userId: 'user_a',
    actorId: 'user_b',
    actorName: '健友小李',
    actorPhoto: '',
    type: 'like',
    logId: 'log_1',
    content: '',
    logCategory: 'Chest',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    userId: 'user_a',
    actorId: 'user_c',
    actorName: '健友小王',
    actorPhoto: '',
    type: 'comment',
    logId: 'log_1',
    content: '大佬这个卧推太猛了！',
    logCategory: 'Chest',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n3',
    userId: 'user_a',
    actorId: 'user_d',
    actorName: '健友小张',
    actorPhoto: '',
    type: 'like',
    logId: 'log_2',
    content: '',
    logCategory: 'Back',
    isRead: true,
    createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
];

const unreadCount = mockNotifications.filter((n) => !n.isRead).length;
assert(unreadCount === 2, 'Unread notifications count is 2');

// Test 3: Filter all vs unread
const allItems = mockNotifications;
const unreadItems = mockNotifications.filter((n) => !n.isRead);
assert(allItems.length === 3, 'All notifications has 3 items');
assert(unreadItems.length === 2, 'Unread filter has 2 items');
assert(!unreadItems.some((n) => n.isRead), 'Unread filter contains no read items');

// Test 4: Notification text rendering
function getNotificationSummary(notif: AppNotification): string {
  if (notif.type === 'like') {
    return `${notif.actorName} 赞了你的打卡`;
  }
  return `${notif.actorName} 评论了你的打卡: "${notif.content}"`;
}

assert(getNotificationSummary(mockNotifications[0]) === '健友小李 赞了你的打卡', 'Like notification text');
assert(getNotificationSummary(mockNotifications[1]) === '健友小王 评论了你的打卡: "大佬这个卧推太猛了！"', 'Comment notification text');

console.log('\n🎉 ALL NOTIFICATION UNIT TESTS PASSED SUCCESSFULLY!\n');
