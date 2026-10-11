# 项目审查优化

## 第二轮范围（用户：继续改）
- 数据层 worker 独占 src/api.ts、src/utils/pagination.ts、tests/request-infra.test.ts、tests/export-pagination.test.ts。实时失效在在途读后补拉（事件合并），取消订阅/重置不得补拉；普通并发读取仍 singleflight。导出按不可变主键 id 游标分页（不再 offset），返回最终按 timestamp/id 降序排序；明确这是遍历而非事务快照，不承诺并发修改的时点一致性。
- 通知 worker 独占 src/App.tsx、新建 src/components/WorkoutDetailModal.tsx、src/utils/workoutDetail.ts、tests/notification-detail.test.tsx。接口 getWorkoutLogDetail(logId: string, options?: {signal?: AbortSignal}): Promise<WorkoutLog | null> 使用 RLS 原始表按 ID 查询，复用可公开的 normalize 或独立明确映射；不得绕过权限。弹窗加载/不可访问/错误重试、过期响应隔离、Android返回与关闭清理；App 保留通知目标 ID，账号切换清理。不得修改 src/api.ts 避免冲突。
- 历史迁移与线上仍保护不动。协调者接入新测试并跑全量验证。
- 第二轮状态 DONE（选定范围）：实时刷新、游标导出、通知详情实施完成。首次复审发现 collation 和嵌套 Escape 两个阻塞，修正后独立验收通过。最终 lint/test/build/diff check 通过。额外兼容接口 isTopBackHandler(handler: () => boolean): boolean 用于嵌套返回栈所有权判断。线上权限、严格快照和浏览器/真机仍未验收。

## Architecture
React 19 + TypeScript + Vite SPA，Supabase 数据与认证，Capacitor Android。保持现有架构，优先可复现缺陷，避免无依据重构。

## Feature Inventory
|功能|范围|来源|
|---|---|---|
|客户端审查|组件生命周期、交互与性能|用户全项目审查|
|数据层审查|请求并发、缓存、分页、算法|用户全项目审查|
|工程审查|构建、CI、Android guards、SQL静态检查|用户全项目审查|

## Milestones
1. 基线检查：DONE，lint/test/build 均通过。
2. 并行只读审查：DONE。
3. 对确认的问题锁定文件和具体契约后修复、补回归：DONE（本轮选定范围）。
4. 独立复审与交付：DONE。首次复审拒绝 TeamDashboard 不完整代次保护，后续修复并由独立验收员执行 lint/UI/analytics 测试通过。协调者最终 lint/full test/build/diff check 均通过。远程 CI 未执行，线上与剩余发现未验收。报告 docs/2026-10-11_project-review-report.md。

## Interface Contracts
保持所有公共 TypeScript 签名不变：统计函数仅当前窗口累加 recentSets/tonnage，progression 仅比较相邻等长窗口，历史 PR 独立保留；ExportDataPage 的复制行为仅 loadState=ready 且不在导出时允许；LogCard 分享请求完成不得重新打开已关闭弹窗；TeamDashboard 异步提交必须属于当前 teamId 和有效请求代次。CI 使用非生产占位公开配置生成本地 Android assets，准备 Java/SDK 后执行现有 guards。

实施文件分工：analytics worker 仅 src/utils/workoutAnalytics.ts 与 tests/workout-analytics.test.ts；UI worker 仅 ExportDataPage.tsx、LogCard.tsx、TeamDashboard.tsx 与对应测试（新测试在最终由协调者接入 package.json）；协调者负责 CI、报告及测试命令。

## Code Layout
待审查 src/、tests/、scripts/、supabase/migrations/、android/、构建配置。
Protected Files (UNTOUCHED): 用户已修改的 .gitignore；.env*；历史数据库迁移；pb_data/；认证核心 src/lib/supabase.ts。不得操作线上服务、执行迁移或部署。
元数据：.agents/teamwork/project-review/。
