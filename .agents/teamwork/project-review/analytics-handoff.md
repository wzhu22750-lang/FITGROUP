# Analytics 修复交接

## Observation / 证据
- `src/utils/workoutAnalytics.ts:877`：`processLogExercises` 同时用于 current 与 baseline，原先 `categorySets/categoryTonnage` 无条件累计，导致 baseline 污染当前组数、吨位与分布。
- `src/utils/workoutAnalytics.ts:1179-1180`：原 progression baseline 只判断 `< cutoffTime`，包含任意旧历史；current 只判断 `>= cutoffTime`，包含未来记录。
- 固定 `Date.now = 2026-07-01T12:00:00.000Z` 的回归首次运行失败：`7d: only current boundary logs count toward category sets (got 8)`，期望 4。
- 仅修复组数/吨位后再次运行失败：`7d: older history does not supply a baseline`，确认第二项问题独立存在。

## Logic / 逻辑
- current 原始统计仅在 `isCurrent` 时累加；baseline stimulus 路径保留。
- progression current 使用 `[now - days, now]`；baseline 使用 `[now - 2*days, now - days)`，相邻、等长、不重叠。
- 历史 `performancesByKey` 收集、PR 与 strength assessment 管线未变，不通过删历史数据实现窗口限制。
- `tests/workout-analytics.test.ts:556` 新增固定时钟 7/28 天用例；覆盖 cutoff/now 包含、baseline 起点包含、cutoff 前 1ms 包含、baseline 前 1ms 排除、now 后 1ms 排除、baseline-only 为零、分布不变、未知动作 fallback、无相邻 baseline 中性 progression、旧 PR 与 strength 保留。
- 旧历史与未来分别独立断言，避免两种错误 ratio 偶然抵消；时钟在 `finally` 恢复。

## Caveats / 限制
- 保持现有有氧固定 28 天评分窗口；本次仅修复力量统计窗口与 progression，不改变有氧产品语义。
- 历史 PR 管线（包括原有对无效/未来日志的处理）保持原状；未来上界只添加到 progression。
- 未运行全量测试或构建；对应 analytics、cardio 测试与仓库 TypeScript lint 已通过。
- 工作区存在用户 `.gitignore` 及并行 UI worker 修改，本 worker 未修改它们；本 worker 仅修改授权的两个业务/测试文件及本交接文档。

## Conclusion / 结果
- 两项审查缺陷已修复，同时使 progression current 上界与 recentLogs 一致。
- 公共签名不变；新增测试全部通过；历史 PR 保留得到断言验证。

## Verification / 命令
- `npx tsx tests/workout-analytics.test.ts > /tmp/fitgroup-analytics-red.log 2>&1`：原实现回归失败，组数 8 vs 4。
- `npx tsx tests/workout-analytics.test.ts > /tmp/fitgroup-analytics-progression-red.log 2>&1`：只修复统计后，旧历史仍被误作 baseline。
- `npx tsx tests/workout-analytics.test.ts > /tmp/fitgroup-analytics-green.log 2>&1`：全部通过，退出码 0。
- `npm run lint`：`tsc --noEmit` 通过，退出码 0。
- `npx tsx tests/cardio-analytics.test.ts`：全部通过，退出码 0。
- `git diff --check`：通过，退出码 0。

## Exact handoff paths / 函数
- `src/utils/workoutAnalytics.ts`：`calculateFullWorkoutAnalytics`、内部 `processLogExercises`、progression `currentBest/baselineBest`。
- `tests/workout-analytics.test.ts`：新增第 14 节固定时钟边界回归。
- `.agents/teamwork/project-review/analytics-handoff.md`：本交接文档。
