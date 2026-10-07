/** Spec #50-H verification: three simulated lifters through the full V3 pipeline. */
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
import type { WorkoutLog } from '../src/types';

const dayMs = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * dayMs).toISOString();

const log = (id: string, ts: string, exs: Array<{ name: string; weight?: number; sets: number; reps: number }>) => ({
  id, userId: 'u', userName: 'u', userPhoto: '', timestamp: ts, category: 'Chest',
  exercises: exs.map((e, i) => ({ id: `${id}-${i}`, ...e, type: 'strength' as const })),
  likesCount: 0, commentsCount: 0,
});

function report(label: string, logs: WorkoutLog[], ctx: { sex: 'male' | 'female'; bodyweightKg: number } | null) {
  const a = calculateFullWorkoutAnalytics(logs, {}, 28, ctx);
  console.log(`\n===== ${label} =====`);
  a.categorizedPrs.filter((p) => !p.excludeFromScoring).forEach((p) => {
    console.log(
      `  ${p.name}: 记录 ${p.weight}${p.unit} → e1RM ${p.estimated1RM} | 力量分 ${p.score} | ${p.tier.zh}(${p.tier.en}) | 置信度 ${p.confidence}(${p.confidenceScore}) | 来源 ${p.source}${p.suspectedOutlier ? ' | ⚠疑似异常' : ''}`
    );
  });
  (['Chest', 'Back', 'Legs', 'Shoulders'] as const).forEach((c) => {
    const d = a.categoryDetails[c];
    if (!d) return;
    console.log(
      `  [${d.zh}] 训练状态 ${d.trainingScore} (频${d.frequencyScore}/容${d.volumeScore}/进${d.progressionScore}/稳${d.consistencyScore}) ${d.tier.zh} | 部位力量 ${d.strengthScore} ${d.strengthAssessment ? `${d.strengthAssessment.tier.zh} 置信${d.strengthAssessment.confidence}` : '(无证据)'}`
    );
  });
}

// 用户1: 70kg 男性 卧推80×8 深蹲100×5 硬拉120×5
report(
  '用户1 · 70kg 男性',
  [log('u1', daysAgo(1), [
    { name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 },
    { name: '杠铃深蹲', weight: 100, sets: 4, reps: 5 },
    { name: '传统硬拉', weight: 120, sets: 3, reps: 5 },
  ])],
  { sex: 'male', bodyweightKg: 70 }
);

// 用户2: 55kg 女性 卧推40×5 深蹲65×6 硬拉80×5
report(
  '用户2 · 55kg 女性',
  [log('u2', daysAgo(1), [
    { name: '杠铃平板卧推', weight: 40, sets: 4, reps: 5 },
    { name: '杠铃深蹲', weight: 65, sets: 4, reps: 6 },
    { name: '传统硬拉', weight: 80, sets: 3, reps: 5 },
  ])],
  { sex: 'female', bodyweightKg: 55 }
);

// 用户3: 74kg 男性 引体 自重×10、+10kg×6
report(
  '用户3 · 74kg 男性 引体',
  [
    log('u3a', daysAgo(2), [{ name: '引体向上', weight: 0, sets: 4, reps: 10 }]),
    log('u3b', daysAgo(1), [{ name: '引体向上', weight: 10, sets: 4, reps: 6 }]),
  ],
  { sex: 'male', bodyweightKg: 74 }
);
