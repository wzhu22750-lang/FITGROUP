# 第二轮数据层交接

## Observation
- 旧 scheduler 在 realtime debounce 到期时调用普通 singleflight fetch；事件发生于旧读期间时，仅合并到旧请求，没有再次读取更新后数据。
- 旧导出以 offset + created_at 排序分页，已读页删除、训练时间修改会使后续窗口偏移；pageSize 的截断/夹值也没有拒绝 NaN/Infinity。

## Logic
### 实时失效
- `SharedFeedScheduler.pendingRefresh` 按 domain 记录一个待补拉 fetcher。在途事件直接置 pending；一轮任意数量事件只在该 flight 的 finally 完成后补拉一次。
- 没有在途读时沿用 120ms debounce；普通调用 `fetch()` 仍合并到当前读，不创建 pending。
- `force` 清理替代之前的 pending 和 debounce，再取消旧读。替代开始之后发生的新事件仍会补拉。旧 flight finally 仅能清理自己的身份对应状态。
- 最后一个 unsubscribe 清理 pending/timer、取消读与点赞请求并提升版本。新增显式 `sharedFeedScheduler.reset()` 清理全部订阅/channel、pending/timer、读与缓存；保留版本计数防止旧代次响应回写。
- channel 回调和 unsubscribe 捕获原订阅 Map 身份；reset 后同域重新订阅时，旧回调/旧 disposer 无权操作新域。

### 导出
- `fetchAllMyWorkoutLogsForExport` 使用 `order('id', { ascending: false }).limit(pageSize)`，后续 `.lt('id', lastId)`。不再 range/offset，也不再 created_at 排序游标。
- 继续 `eq(user_id)` 与 `lte(created_at, exportStartedAt)`；normalize、去重，最终按 timestamp/id 降序，保持客户端导出展示语义。
- 新增 `fetchAllPagesById`：有限安全正整数验证、取消前后检查、页数上限、严格递减 id 进度验证（异常后端不能无限重复读）。保留原 `fetchAllPages` 签名并补取消/参数校验，但导出不再使用它。
- 默认 400 页大小，合法的大 pageSize 最多夹至 1000（provider cap）。0/负数/小数/NaN/Infinity/非安全整数直接拒绝；不再无声截断非法输入。

## Caveats
- **这不是事务快照。** created_at 截止只是过滤条件；并发补录若 id 在未读游标下方可能被读到，已越过的较大 id 不回头读取。已读行不会刷新，并发删除或编辑未读行可能改变最终返回内容。
- id 以数据库当前不可变主键字符串排序为契约；严格递减验证适合本项目 UUID 主键。不能用于任意非一致排序的本地字符串主键。
- reset 是新增显式 scheduler 清理入口，本次没有改变认证核心或接入 App 生命周期；实际现有生命周期的 unsubscribe 同样清理 pending。不要把 reset 与普通 refresh 混同：reset 会注销全部实时订阅。
- 未操作线上、未执行 SQL/迁移、未改 package.json 或其他业务文件。仓库已有并行修改不属于本 worker。
- 未运行浏览器；本地测试无线上依赖。SDK 签名从安装包 `node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts`、`PostgrestTransformBuilder.ts` 验证 lt/order/limit 的 this 返回值和参数。

## Conclusion / Exact Files
- `src/api.ts`: `SharedFeedScheduler.fetch/subscribe/reset/clearRefresh`，`fetchAllMyWorkoutLogsForExport`。
- `src/utils/pagination.ts`: `validatePageSize`，`fetchAllPagesById`，保留并加强 `fetchAllPages`。
- `tests/request-infra.test.ts`: 真 scheduler + deferred transport 回归（忽略 abort 的旧请求也不能回写）。覆盖短/长在途事件、50事件合并、普通读合并、结尾 fresh 结果、失败补拉、unsubscribe/reset 无补拉、idle timer 清理、force 清 pending/timer、force 后新事件、reset 后重新订阅隔离；网络兜底禁止真实请求。
- `tests/export-pagination.test.ts`: 模拟实际过滤/order/limit/lt 查询；0/800/1000/1001、前页删除、补录、训练时间编辑、timestamp/id 排序、snapshot 边界、错误/取消、参数与游标不前进保护。
- `.agents/teamwork/project-review/round2-data-handoff.md`: 本交接。

## Verification
以下均已执行通过：
```sh
npx tsx tests/export-pagination.test.ts
npx tsx tests/request-infra.test.ts
npx tsx tests/feed-cache-and-performance.test.ts
npx tsx tests/startup-auth.test.ts
npx tsx tests/data-export.test.ts
npm run lint
git diff --check
```
环境未配置 Supabase 的提示属于预期（SDK 以 invalid.localhost 安全占位初始化）；storage 失败与 profile abort fixture 的警告属于已有预期断言。两份新范围测试全部 offline mock 通过。全量 test/build 交由协调者最终门禁。
