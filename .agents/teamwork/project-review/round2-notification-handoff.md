# 第二轮通知详情交接

## Observation
原 App 的通知 onSelectLog 丢弃 logId，仅跳到 feed，用户无法定位通知对应记录。当前 src/api.ts 已公开导出 normalizeLog，可直接复用，无需依赖数据 worker 的后续改动。

## Logic
- `src/App.tsx`：保存 `{logId, accountId}`，打开懒加载 WorkoutDetailModal；通知列表按账号 key 重挂载；切换账号清理详情/通知状态。渲染先核对账号，过期 notification 点击回调再核对当前账号，防止旧异步点击打开新账号详情。
- `src/utils/workoutDetail.ts`：公开 `getWorkoutLogDetail(logId, {signal}?)`。使用现有签名客户端访问原始 `workout_logs` 表，按主键过滤，`abortSignal(...).maybeSingle()`；没有 RPC、特权视图、服务端 key 或权限绕过。复用现有 normalizeLog 和 readRequest（9 秒超时、取消与清理）。空、已删除、RLS 隐藏、42501 权限失败统一 null；其他错误抛出供重试。
- `src/components/WorkoutDetailModal.tsx`：加载/不可访问/错误重试/真实 LogCard。请求由 AbortController 按 id、accountId、重试代次隔离；关闭立刻 abort，卸载清理，旧响应不覆盖。展示数据再次核对 identity。复用 pushBackHandler（LogCard 子弹窗可继续按栈处理）；背景点击、Escape、关闭按钮均统一取消。恢复 body overflow、keydown 监听和此前焦点；删除回调转入不可访问提示。

## Caveats
- 未操作线上；未修改 src/api.ts、package.json、迁移、环境配置。
- 新测试尚未接入 npm test，请协调者将 `tsx tests/notification-detail.test.tsx` 加入测试链。
- 测试使用真实 App、NotificationModal、WorkoutDetailModal、LogCard 和详情查询模块，mock 签名客户端/API/native 等 I/O，以及无关懒加载页面。normalizeLog 本身在测试 API boundary 使用 identity stub；生产代码直接调用既有映射。
- 离线验证证明按原始表主键查询、取消/超时、错误路径和 UI 生命周期；不宣称已在线验证 RLS 策略。
- 保持现有 LogCard 交互能力；没有额外批量点赞查询，未知点赞仍走 LogCard 原有显式交互查询。

## Conclusion
通知入口已可打开目标训练详情，账号切换和关闭不会回显此前详情。

## Verification
通过：
- `npx tsx tests/notification-detail.test.tsx`
- `npm run lint`
- `git diff --check`

覆盖：deferred 请求加载；A→B id 切换且 A 晚到；accountId 更换立即隐藏旧 LogCard；缺失提示；错误重试；关闭后晚到；卸载后晚到；Android backStack 消费/释放；滚动与监听恢复；原始表 eq(id) 查询；权限隐藏；外部取消；9 秒 deadline 路径（测试将时钟缩短）；真实通知→App→详情 logId wiring；账号切换（已加载和请求中）；旧通知 handler 隔离；Escape 关闭与晚到隔离。

## Exact Files / Key Symbols
- `src/App.tsx` — detailTarget、accountIdRef、onSelectLog wiring
- `src/components/WorkoutDetailModal.tsx` — Props、Result、WorkoutDetailModal
- `src/utils/workoutDetail.ts` — getWorkoutLogDetail
- `tests/notification-detail.test.tsx` — real-component offline regression harness
- `.agents/teamwork/project-review/round2-notification-handoff.md` — 此交接
