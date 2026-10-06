import assert from 'node:assert/strict';
import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  generateExportData,
  formatExportAsJson,
  formatExportAsText,
  resolveExercisePrimaryCategory,
  resolveLogCategories,
  formatLocalDate,
  formatLocalTime,
  validateExportContent,
} from '../src/utils/dataExport';
import { APP_NAME, APP_VERSION, EXPORT_SCHEMA_VERSION } from '../src/constants/appVersion';

function pass(msg: string) {
  console.log(`✅ PASSED: ${msg}`);
}

function makeLog(id: string, timestamp: string, overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id,
    userId: 'u1',
    userName: '铁友小王',
    userPhoto: '',
    timestamp,
    category: 'Chest',
    categories: [WorkoutCategory.Chest],
    exercises: [],
    note: '',
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
    ...overrides,
  };
}

console.log('--- Testing Data Export Utility ---');

// 1. Primary category resolution
{
  assert.equal(resolveExercisePrimaryCategory('杠铃平板卧推', false), WorkoutCategory.Chest, '卧推 resolves to Chest');
  assert.equal(resolveExercisePrimaryCategory('高位下拉', false), WorkoutCategory.Back, '下拉 resolves to Back');
  assert.equal(resolveExercisePrimaryCategory('杠铃深蹲', false), WorkoutCategory.Legs, '深蹲 resolves to Legs');
  assert.equal(resolveExercisePrimaryCategory('坐姿哑铃推举', false), WorkoutCategory.Shoulders, '推举 resolves to Shoulders');
  assert.equal(resolveExercisePrimaryCategory('哑铃弯举', false), WorkoutCategory.Others, '弯举 resolves to Others');
  assert.equal(resolveExercisePrimaryCategory('户外跑步', true), WorkoutCategory.Cardio, '跑步 with isCardio resolves to Cardio');
  pass('resolveExercisePrimaryCategory');
}

// 2. Multi-category resolution (prefers `categories`, falls back to legacy string)
{
  assert.deepEqual(
    resolveLogCategories({ category: 'Chest', categories: [WorkoutCategory.Chest, WorkoutCategory.Shoulders] }),
    [WorkoutCategory.Chest, WorkoutCategory.Shoulders],
    'explicit categories array wins and preserves both',
  );
  assert.deepEqual(
    resolveLogCategories({ category: 'Chest, Shoulders' }),
    [WorkoutCategory.Chest, WorkoutCategory.Shoulders],
    'legacy comma string is parsed into both categories',
  );
  assert.deepEqual(resolveLogCategories({ category: 'Back' }), [WorkoutCategory.Back], 'legacy single category');
  assert.deepEqual(resolveLogCategories({ category: '' }), [WorkoutCategory.Others], 'empty category falls back to Others');
  assert.deepEqual(
    resolveLogCategories({ category: 'Chest', categories: [] as WorkoutCategory[] }),
    [WorkoutCategory.Chest],
    'empty categories array falls back to legacy string',
  );
  pass('resolveLogCategories (multi-category + legacy fallback)');
}

// 3. Local date/time semantics
{
  const iso = '2026-08-28T18:30:00.000Z';
  const date = new Date(iso);
  const expectedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const expectedTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  assert.equal(formatLocalDate(iso), expectedDate, 'local date derived via Date getters');
  assert.equal(formatLocalTime(iso), expectedTime, 'local time derived via Date getters');
  assert.equal(formatLocalDate('not-a-date'), '', 'invalid timestamp yields empty date');
  assert.equal(formatLocalTime('not-a-date'), '', 'invalid timestamp yields empty time');
  assert.equal(formatLocalDate(undefined), '', 'missing timestamp yields empty date');
  pass('local date/time formatting (UTC -> local, invalid safe)');
}

// 4. Profile / BMI / dimension summaries
const mockUser = {
  displayName: '铁友小王',
  email: 'wang@fitgroup.app',
  heightCm: 180,
  bodyweightKg: 75,
  sex: 'male',
  streak: 12,
  totalWorkouts: 25,
  prs: { 杠铃平板卧推: 95, 传统硬拉: 150 },
};

const mockLogs: WorkoutLog[] = [
  makeLog('log-1', '2026-08-28T18:30:00.000Z', {
    category: 'Chest',
    categories: [WorkoutCategory.Chest],
    exercises: [
      { id: 'e1', name: '杠铃平板卧推', type: 'strength', sets: 4, reps: 8, weight: 100 },
      { id: 'e2', name: '上斜哑铃卧推', type: 'strength', sets: 3, reps: 10, weight: 30 },
    ],
    note: '卧推破百！',
  }),
  makeLog('log-2', '2026-08-29T09:00:00.000Z', {
    category: 'Cardio',
    categories: [WorkoutCategory.Cardio],
    exercises: [{ id: 'e3', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 320 }],
    note: '晨跑打卡',
  }),
];

{
  const exportData = generateExportData(mockUser, mockLogs);
  assert.equal(exportData.profile.displayName, '铁友小王');
  assert.equal(exportData.profile.email, 'wang@fitgroup.app');
  assert.equal(exportData.profile.heightCm, 180);
  assert.equal(exportData.profile.bodyweightKg, 75);
  assert.equal(exportData.profile.sexZh, '男 (Male)');
  assert.equal(exportData.profile.bmi, 23.1, 'BMI 75 / 1.8^2 -> 23.1');
  assert.equal(exportData.profile.bmiCategoryZh, '标准');
  assert.equal(exportData.profile.streak, 12);

  const chest = exportData.summaries.dimensionSummaries[WorkoutCategory.Chest];
  assert.equal(chest.maxWeightKg, 100, 'Chest max weight from log');
  assert.equal(chest.bestExerciseName, '杠铃平板卧推');
  assert.equal(chest.prs['杠铃平板卧推'], 100);
  assert.equal(chest.prs['上斜哑铃卧推'], 30);
  assert.equal(chest.totalVolumeKg, 4100, 'Chest volume 4*8*100 + 3*10*30');
  assert.equal(chest.totalSets, 7);

  const back = exportData.summaries.dimensionSummaries[WorkoutCategory.Back];
  assert.equal(back.maxWeightKg, 150, 'Back max weight from user.prs');
  assert.equal(back.prs['传统硬拉'], 150);

  const cardio = exportData.summaries.dimensionSummaries[WorkoutCategory.Cardio];
  assert.equal(cardio.cardioMinutes, 30);
  assert.equal(cardio.cardioDistanceKm, 5);
  assert.equal(cardio.cardioCaloriesKcal, 320);

  assert.equal(exportData.summaries.totals.workoutLogs, 2);
  assert.equal(exportData.summaries.totals.totalVolumeKg, 4100);
  assert.equal(exportData.summaries.totals.totalSets, 7);

  assert.equal(exportData.workoutLogs.length, 2);
  const newest = exportData.workoutLogs[0];
  assert.equal(newest.id, 'log-2', 'newest log first');
  assert.equal(newest.localDate, formatLocalDate('2026-08-29T09:00:00.000Z'));
  assert.ok(newest.exerciseSummaries[0].includes('户外跑步: 30分钟, 5km, ~320kcal'));
  assert.deepEqual(newest.exercises[0], { id: 'e3', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 320 }, 'raw exercise retained in backup');

  const older = exportData.workoutLogs[1];
  assert.equal(older.id, 'log-1');
  assert.equal(older.totalVolumeKg, 4100);
  assert.ok(older.exerciseSummaries[0].includes('杠铃平板卧推: 4组 × 100kg × 8次 (容量: 3200kg)'));
  pass('profile, BMI, dimension summaries, raw + summary logs');
}

// 5. Metadata / version single source
{
  const exportData = generateExportData(mockUser, mockLogs);
  assert.equal(exportData.metadata.app, APP_NAME);
  assert.equal(exportData.metadata.appVersion, APP_VERSION);
  assert.equal(exportData.metadata.exportSchemaVersion, EXPORT_SCHEMA_VERSION);
  assert.ok(exportData.metadata.exportedAt.length > 0, 'exportedAt populated');
  const json = formatExportAsJson(exportData);
  const parsed = JSON.parse(json);
  assert.equal(parsed.metadata.appVersion, APP_VERSION, 'JSON uses shared app version');
  const text = formatExportAsText(exportData);
  assert.ok(text.includes(`应用版本: ${APP_VERSION}`), 'TXT uses the same shared app version');
  pass('metadata + shared app version (JSON & TXT consistent)');
}

// 6. JSON backup is restorable: preserves required raw fields
{
  const exportData = generateExportData(mockUser, mockLogs);
  const parsed = JSON.parse(formatExportAsJson(exportData));
  for (const log of parsed.workoutLogs) {
    for (const field of ['id', 'timestamp', 'category', 'categories', 'exercises', 'note', 'visibility']) {
      assert.ok(field in log, `backup log preserves "${field}"`);
    }
  }
  pass('JSON backup preserves raw workout fields');
}

// 7. Zero records -> valid export
{
  const exportData = generateExportData(mockUser, []);
  assert.equal(exportData.workoutLogs.length, 0);
  assert.equal(exportData.summaries.totals.workoutLogs, 0);
  const json = formatExportAsJson(exportData);
  assert.doesNotThrow(() => JSON.parse(json), '0-log JSON parses');
  const text = formatExportAsText(exportData);
  assert.ok(text.includes('暂无训练打卡记录'), '0-log TXT is still informative');
  assert.equal(validateExportContent(json, 'json') > 0, true);
  assert.equal(validateExportContent(text, 'text') > 0, true);
  pass('0 workout records produce a valid export');
}

// 8. 1 record
{
  const exportData = generateExportData(mockUser, [makeLog('one', '2026-01-01T00:00:00.000Z')]);
  assert.equal(exportData.workoutLogs.length, 1);
  assert.doesNotThrow(() => JSON.parse(formatExportAsJson(exportData)));
  pass('1 workout record export');
}

// 9. 1000 and 1001 records are fully exported (no truncation)
{
  const buildLogs = (count: number): WorkoutLog[] =>
    Array.from({ length: count }, (_, i) =>
      makeLog(`log-${i}`, new Date(Date.UTC(2020, 0, 1) + i * 60000).toISOString(), {
        category: i % 2 === 0 ? 'Chest' : 'Back',
        categories: [i % 2 === 0 ? WorkoutCategory.Chest : WorkoutCategory.Back],
      }),
    );

  for (const count of [1000, 1001]) {
    const exportData = generateExportData(mockUser, buildLogs(count));
    assert.equal(exportData.workoutLogs.length, count, `${count} records exported in full`);
    const json = formatExportAsJson(exportData);
    assert.ok(validateExportContent(json, 'json') > 0, `${count}-record JSON non-empty & parsed`);
  }
  pass('1000 / 1001 records fully exported');
}

// 10. Multi-category workout exports every category
{
  const log = makeLog('multi', '2026-02-02T10:00:00.000Z', {
    category: 'Chest, Shoulders',
    categories: [WorkoutCategory.Chest, WorkoutCategory.Shoulders],
    exercises: [
      { id: 'e1', name: '上斜哑铃卧推', type: 'strength', sets: 3, reps: 10, weight: 30 },
    ],
  });
  const exportData = generateExportData(mockUser, [log]);
  assert.deepEqual(exportData.workoutLogs[0].categories, [WorkoutCategory.Chest, WorkoutCategory.Shoulders]);
  const text = formatExportAsText(exportData);
  assert.ok(text.includes('胸部 + 肩部'), 'TXT shows both Chest and Shoulders');
  assert.equal(exportData.summaries.dimensionSummaries[WorkoutCategory.Chest].workoutCount, 1);
  assert.equal(exportData.summaries.dimensionSummaries[WorkoutCategory.Shoulders].workoutCount, 1);
  pass('multi-category Chest + Shoulders preserved');
}

// 11. Legacy single-category data still exports
{
  const legacy = makeLog('legacy', '2026-03-03T10:00:00.000Z', {
    category: 'Legs',
    categories: undefined,
  });
  const exportData = generateExportData(mockUser, [legacy]);
  assert.deepEqual(exportData.workoutLogs[0].categories, [WorkoutCategory.Legs]);
  assert.ok(formatExportAsText(exportData).includes('腿部'));
  pass('legacy category-only data is compatible');
}

// 12. Invalid timestamp cannot crash the whole export
{
  const bad = makeLog('bad', 'not-a-real-timestamp', { category: 'Back', categories: undefined });
  const good = makeLog('good', '2026-04-04T10:00:00.000Z');
  const exportData = generateExportData(mockUser, [bad, good]);
  assert.equal(exportData.workoutLogs.length, 2);
  const badExport = exportData.workoutLogs.find((l) => l.id === 'bad');
  assert.equal(badExport?.localDate, '', 'invalid timestamp yields empty local date');
  assert.doesNotThrow(() => JSON.parse(formatExportAsJson(exportData)));
  assert.doesNotThrow(() => formatExportAsText(exportData));
  pass('invalid timestamp degrades safely');
}

// 13. Chinese + quotes + newlines + emoji survive JSON and TXT
{
  const trickyNote = '今天状态不错 💪\n"PB" 又刷新了';
  const log = makeLog('unicode', '2026-05-05T10:00:00.000Z', {
    userName: '小明🐱',
    category: 'Chest',
    categories: [WorkoutCategory.Chest],
    exercises: [{ id: 'e1', name: '杠铃卧推', type: 'strength', sets: 4, reps: 8, weight: 80 }],
    note: trickyNote,
  });
  const exportData = generateExportData({ displayName: '小明🐱' }, [log]);
  const json = formatExportAsJson(exportData);
  const parsed = JSON.parse(json) as { workoutLogs: Array<{ note: string; userName: string }> };
  assert.equal(parsed.workoutLogs[0].note, trickyNote, 'note round-trips exactly through JSON');
  assert.equal(parsed.workoutLogs[0].userName, '小明🐱');

  const text = formatExportAsText(exportData);
  assert.ok(text.includes(trickyNote), 'TXT preserves emoji, quotes and newline note');
  assert.ok(text.includes('杠铃卧推'), 'TXT preserves Chinese exercise name');

  const bytes = new TextEncoder().encode(json).byteLength;
  assert.ok(bytes > json.length / 2, 'UTF-8 byte length reflects multi-byte characters');
  pass('Unicode / quotes / newlines / emoji are export-safe');
}

// 14. validateExportContent guards the native boundary
{
  assert.throws(() => validateExportContent('', 'json'), /导出内容为空/);
  assert.throws(() => validateExportContent('{ not json', 'json'), /JSON 内容无效/);
  assert.equal(validateExportContent('{"a":1}', 'json') > 0, true);
  assert.equal(validateExportContent('纯文本报告', 'text') > 0, true);
  pass('validateExportContent rejects empty/invalid content');
}

// 15. Pull-up effective load regression
{
  const pullUpLogs: WorkoutLog[] = [
    makeLog('log-pull-1', '2026-08-30T10:00:00.000Z', {
      category: 'Back',
      categories: [WorkoutCategory.Back],
      exercises: [{ id: 'e-pull-1', name: '引体向上', type: 'strength', sets: 3, reps: 8, weight: -15 }],
    }),
  ];
  const exportWithPullUps = generateExportData(mockUser, pullUpLogs);
  const backPullUp = exportWithPullUps.summaries.dimensionSummaries[WorkoutCategory.Back];
  assert.equal(backPullUp.prs['引体向上'], 60, 'Assisted pull-up PR is 60kg effective load');
  assert.equal(backPullUp.totalVolumeKg, 1440, 'Assisted pull-up volume is 1440kg');
  assert.ok(exportWithPullUps.workoutLogs[0].exerciseSummaries[0].includes('-15kg (总计60kg)'));
  pass('assisted pull-up effective load');
}

console.log('\n🎉 ALL DATA EXPORT UNIT TESTS PASSED SUCCESSFULLY!\n');
