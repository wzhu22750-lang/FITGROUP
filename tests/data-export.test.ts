import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  generateExportData,
  formatExportAsJson,
  formatExportAsText,
  resolveExercisePrimaryCategory,
} from '../src/utils/dataExport';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Data Export Utility ---');

// 1. Test Primary Category Resolution
{
  assert(
    resolveExercisePrimaryCategory('杠铃平板卧推', false) === WorkoutCategory.Chest,
    '卧推 resolves to Chest'
  );
  assert(
    resolveExercisePrimaryCategory('高位下拉', false) === WorkoutCategory.Back,
    '下拉 resolves to Back'
  );
  assert(
    resolveExercisePrimaryCategory('杠铃深蹲', false) === WorkoutCategory.Legs,
    '深蹲 resolves to Legs'
  );
  assert(
    resolveExercisePrimaryCategory('坐姿哑铃推举', false) === WorkoutCategory.Shoulders,
    '推举 resolves to Shoulders'
  );
  assert(
    resolveExercisePrimaryCategory('哑铃弯举', false) === WorkoutCategory.Others,
    '弯举 resolves to Others'
  );
  assert(
    resolveExercisePrimaryCategory('户外跑步', true) === WorkoutCategory.Cardio,
    '跑步 with isCardio resolves to Cardio'
  );
}

// 2. Test User Profile Export & BMI
{
  const mockUser = {
    displayName: '铁友小王',
    email: 'wang@fitgroup.app',
    heightCm: 180,
    bodyweightKg: 75,
    sex: 'male',
    streak: 12,
    totalWorkouts: 25,
    prs: {
      '杠铃平板卧推': 95,
      '传统硬拉': 150,
    },
  };

  const mockLogs: WorkoutLog[] = [
    {
      id: 'log-1',
      userId: 'u1',
      userName: '铁友小王',
      userPhoto: '',
      timestamp: '2026-08-28T18:30:00.000Z',
      category: 'Chest',
      categories: [WorkoutCategory.Chest],
      exercises: [
        {
          id: 'e1',
          name: '杠铃平板卧推',
          type: 'strength',
          sets: 4,
          reps: 8,
          weight: 100, // PR higher than user.prs
        },
        {
          id: 'e2',
          name: '上斜哑铃卧推',
          type: 'strength',
          sets: 3,
          reps: 10,
          weight: 30,
        },
      ],
      note: '卧推破百！',
      likesCount: 2,
      commentsCount: 0,
      visibility: 'public',
    },
    {
      id: 'log-2',
      userId: 'u1',
      userName: '铁友小王',
      userPhoto: '',
      timestamp: '2026-08-29T09:00:00.000Z',
      category: 'Cardio',
      categories: [WorkoutCategory.Cardio],
      exercises: [
        {
          id: 'e3',
          name: '户外跑步',
          type: 'cardio',
          duration: 30,
          distance: 5,
          calories: 320,
        },
      ],
      note: '晨跑打卡',
      likesCount: 0,
      commentsCount: 0,
      visibility: 'public',
    },
  ];

  const exportData = generateExportData(mockUser, mockLogs);

  // Profile tests
  assert(exportData.profile.displayName === '铁友小王', 'Profile displayName matches');
  assert(exportData.profile.email === 'wang@fitgroup.app', 'Profile email matches');
  assert(exportData.profile.heightCm === 180, 'Height is 180 cm');
  assert(exportData.profile.bodyweightKg === 75, 'Weight is 75 kg');
  assert(exportData.profile.sexZh === '男 (Male)', 'Sex is 男 (Male)');
  assert(exportData.profile.bmi === 23.1, 'BMI is 23.1 (75 / 1.8^2 = 23.15 -> 23.1)');
  assert(exportData.profile.bmiCategoryZh === '标准', 'BMI category is 标准');
  assert(exportData.profile.streak === 12, 'Streak matches');

  // Dimension Chest tests
  const chest = exportData.dimensionSummaries[WorkoutCategory.Chest];
  assert(chest.maxWeightKg === 100, 'Chest max weight updated to 100kg from log');
  assert(chest.bestExerciseName === '杠铃平板卧推', 'Chest best exercise is 卧推');
  assert(chest.prs['杠铃平板卧推'] === 100, 'PR for 杠铃平板卧推 is 100');
  assert(chest.prs['上斜哑铃卧推'] === 30, 'PR for 上斜哑铃卧推 is 30');
  // Volume: 4*8*100 = 3200, 3*10*30 = 900 -> total = 4100
  assert(chest.totalVolumeKg === 4100, 'Chest total volume is 4100 kg');
  assert(chest.totalSets === 7, 'Chest total sets is 7');

  // Dimension Back tests (from user.prs)
  const back = exportData.dimensionSummaries[WorkoutCategory.Back];
  assert(back.maxWeightKg === 150, 'Back max weight from user.prs is 150');
  assert(back.prs['传统硬拉'] === 150, 'Back has 传统硬拉 PR');

  // Dimension Cardio tests
  const cardio = exportData.dimensionSummaries[WorkoutCategory.Cardio];
  assert(cardio.cardioMinutes === 30, 'Cardio duration is 30 min');
  assert(cardio.cardioDistanceKm === 5, 'Cardio distance is 5 km');
  assert(cardio.cardioCaloriesKcal === 320, 'Cardio calories is 320 kcal');

  // Workout Logs summary tests
  assert(exportData.workoutLogs.length === 2, '2 workout logs summarized');
  const firstLog = exportData.workoutLogs[0]; // Log 2 is newest (Aug 29)
  assert(firstLog.date === '2026-08-29', 'Newest log date is 2026-08-29');
  assert(firstLog.exercises[0].includes('户外跑步: 30分钟, 5km, ~320kcal'), 'Cardio exercise summary formatted');

  const secondLog = exportData.workoutLogs[1]; // Log 1 is Aug 28
  assert(secondLog.date === '2026-08-28', 'Second log date is 2026-08-28');
  assert(secondLog.totalVolumeKg === 4100, 'Second log total volume is 4100 kg');
  assert(secondLog.totalSets === 7, 'Second log total sets is 7');
  assert(secondLog.exercises[0].includes('杠铃平板卧推: 4组 × 100kg × 8次 (容量: 3200kg)'), 'Strength exercise summary formatted');

  // 3. Test JSON Formatting
  const jsonStr = formatExportAsJson(exportData);
  const parsed = JSON.parse(jsonStr);
  assert(parsed.app === 'FitGroup', 'JSON output has app FitGroup');
  assert(parsed.profile.heightCm === 180, 'JSON output contains height');

  // 4. Test Text Formatting
  const textReport = formatExportAsText(exportData);
  assert(textReport.includes('FITGROUP 健身数据导出报告'), 'Text report has title');
  assert(textReport.includes('身高: 180 cm'), 'Text report contains height');
  assert(textReport.includes('体重: 75 kg'), 'Text report contains weight');
  assert(textReport.includes('胸部 (Chest):'), 'Text report contains Chest section');
  assert(textReport.includes('最大单项重量: 100 kg'), 'Text report contains max weight');
  assert(textReport.includes('历史累计容量: 4,100 kg'), 'Text report contains formatted volume');
  assert(textReport.includes('杠铃平板卧推: 4组 × 100kg × 8次'), 'Text report contains log details');

  // 5. Test Pull-up Effective Load in Data Export
  const pullUpLogs: WorkoutLog[] = [
    {
      id: 'log-pull-1',
      userId: 'u1',
      userName: '铁友小王',
      userPhoto: '',
      timestamp: '2026-08-30T10:00:00.000Z',
      category: 'Back',
      categories: [WorkoutCategory.Back],
      exercises: [
        {
          id: 'e-pull-1',
          name: '引体向上',
          type: 'strength',
          sets: 3,
          reps: 8,
          weight: -15, // Assisted: 75 + (-15) = 60kg
        },
      ],
      likesCount: 0,
      commentsCount: 0,
      visibility: 'public',
    },
  ];

  const exportWithPullUps = generateExportData(mockUser, pullUpLogs);
  const backPullUp = exportWithPullUps.dimensionSummaries[WorkoutCategory.Back];
  assert(backPullUp.prs['引体向上'] === 60, 'Assisted pull-up PR in export is 60kg effective load');
  // Volume: 3 * 8 * 60 = 1440kg
  assert(backPullUp.totalVolumeKg === 1440, 'Assisted pull-up volume is 1440kg');
  assert(exportWithPullUps.workoutLogs[0].exercises[0].includes('-15kg (总计60kg)'), 'Assisted pull-up text includes both assistance and total load');
}

console.log('\n🎉 ALL DATA EXPORT UNIT TESTS PASSED SUCCESSFULLY!\n');

