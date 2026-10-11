# Fitgroup 项目审查与首轮优化

## 结论与范围

本轮审查覆盖 React 页面、数据请求与缓存、训练算法、Supabase 历史迁移、CI 和 Android 打包约束。已修复两个统计问题、三个界面问题，并补齐 CI 前置条件；本地类型检查、全量测试、生产构建通过。仍有实时刷新、并发导出与数据库权限方面的待办，不能据此认定整个项目已无缺陷。

授权来自用户“审查优化整个项目”。仅进行本地代码审查、修改和测试；未连接生产数据库、应用迁移或部署，未更改用户原有 `.gitignore` 修改。数据库结论基于仓库 SQL，未验证线上策略或数据。未做浏览器端 E2E、真机验收或实际 GitHub runner 执行。

## 已修复及证据链

|编号|Evidence：源码与回归测试|Finding：问题|Path：修复与验证|
|---|---|---|---|
|F1|`src/utils/workoutAnalytics.ts` 的 categorySets/categoryTonnage；`tests/workout-analytics.test.ts` 新增 7/28 天测试|上期训练组数、吨位混入近期分布|仅当前窗口累加；仅上期、本期+上期均有回归|
|F2|同上，progression 的 currentBest/baselineBest|“较上期”误用全部历史最佳，当前窗口还缺未来上界|比较相邻等长窗口；保留独立历史 PR；覆盖窗口边界和未来记录|
|F3|`src/components/ExportDataPage.tsx`；`tests/review-ui-regressions.test.tsx`|加载中或失败时仍可复制空报告并提示成功|按钮与 handler 同时检查 busy，覆盖 ready/loading/error/exporting|
|F4|`src/components/LogCard.tsx`；UI 回归测试|分享资料迟到后重新打开已关闭弹窗|删除异步结尾重复打开操作；覆盖请求成功及失败|
|F5|`src/components/TeamDashboard.tsx`；UI deferred Promise 回归测试|切队旧请求、A→B→A 旧回调可覆盖当前数据；等待新队伍时展示旧成员与出勤|选择代次隔离、请求代次保护、订阅清理、错误捕获及按代次展示数据；覆盖旧回调、旧订阅、失败与待加载状态|
|F6|`.github/workflows/ci.yml`、`scripts/verify-apk-guards.ts`|干净检出缺生成 assets、明确 Java/SDK 环境与构建变量|CI 增加 Java 21/SDK 36、非生产公开占位配置；测试前执行 cap:sync。仅静态复核，远程 CI 待验证|

新增 UI 测试已接入 `package.json` 的 `npm test`。没有引入新运行时依赖或改变公共 API。

## 首轮剩余待办（第二轮进展见下文）

|优先级|证据与触发路径|影响与建议|
|---|---|---|
|高，条件性隐私风险|`supabase/migrations/0001_init.sql:501` 的 workouts_read 仅检查 bucket；后续迁移未收紧|若该 bucket 存放非公开图片，已认证用户读取范围可能大于训练可见范围。需先确认实际 bucket 使用和对象关联模型，再建立父记录授权及所有者兜底策略，不能仅修前端|
|中|`0009_security_hardening.sql:106–125` 的 is_team_member 接受任意 user_id 且 authenticated 可执行|知道 team ID 与 user ID 时可能探测成员关系；应让公开 RPC 只查询自身，内部策略帮助函数另行隔离，并做数据库级权限回归|
|中|`src/api.ts` 实时事件防抖调用 fetch，遇到 in-flight 只合并旧请求|旧快照读取期间的更新事件可能被吞掉；需区分普通合并与数据失效，设置 pending refresh，结束后补拉，防止增加并发风暴|
|中|`src/api.ts` 全量导出使用 `.range(from,to)`|跨页期间另一端删除前页记录会移动 offset，造成后页漏行。游标可缓解位移；训练时间可改，严格时点一致性仍需服务端快照契约|
|中|`src/App.tsx` 通知回调未保留传来的 logId|点击通知只切到动态，未定位记录。需要设计目标详情入口，覆盖私密/小队可见、已删除和不在首屏的记录|

首轮上表后四项为静态代码审查结果，不等同于已在生产环境观察到故障。第二轮已为其中实时刷新、导出、通知增加可执行回归并修复，详见下文；两个数据库权限项目仍未修改。权限修正应新增迁移，不修改历史迁移，并经本地多身份数据库测试后再部署。

## 第二轮：继续修复

用户追加要求“继续改”。本轮仍仅本地实施，保留首轮修改及用户 `.gitignore`。

|Evidence|Finding|Path / 修复与验证|
|---|---|---|
|`src/api.ts` SharedFeedScheduler；`tests/request-infra.test.ts`|实时事件被正在执行的旧读取吞掉|记录 pending refresh，在当前请求结束后补拉；事件合并、force替代、退订/reset清理及迟到channel回调隔离均有回归|
|`src/api.ts` 导出函数、`src/utils/pagination.ts`；`tests/export-pagination.test.ts`|offset 分页在前页删除后跳过仍存在的记录|不可变 id 游标读取，最终按时间/id排序；覆盖1001条、前页删除、补录、修改训练时间、取消、错误与非法参数|
|`src/App.tsx`、`src/utils/workoutDetail.ts`、`src/components/WorkoutDetailModal.tsx`；`tests/notification-detail.test.tsx`|通知丢弃 logId，没有目标记录入口|保留ID并懒加载详情，通过普通RLS查询；支持取消、超时、错误重试、统一不可访问提示、账号/ID切换隔离与Android返回|
|分页 helper 与混合大小写测试|客户端字符串排序与数据库 collation 可能不同（独立复审发现）|不再用JS字典序拒绝数据库结果，改为记录已见ID防重复和循环，保留页数安全上限|
|详情弹窗、`src/backStack.ts` 与真实嵌套组件测试|内层Escape可能连带关闭父详情、绕过编辑busy（独立复审发现）|新增向后兼容的顶层handler查询；window capture阶段只处理自身顶层Escape，不干扰内层分享或原生编辑cancel|

**导出一致性边界：** 游标遍历消除了 offset 位移漏行，但不是事务快照。并发插入在游标以下可能被读到，在已遍历部分可能不被读到；尚未读取的数据仍可能被删除或修改。`exportStartedAt` 只是可修改训练时间的过滤条件，不能解释为数据库快照。如需严格一致的备份，后续应增加服务端快照接口。

**验收：** 第二轮最终 `npm run lint`、`npm test`、`npm run build`、`git diff --check` 均退出0。新增通知详情测试已接入默认测试链。独立验收员再次运行分页、详情测试与lint，通过并给出限定本轮复审修复的 `VICTORY CONFIRMED`。日志在 `/tmp/fitgroup-round2-final-{lint,test,build}.log`。没有进行浏览器E2E、真机验证、生产查询或远程CI执行。

**仍待处理：** workouts Storage 读取策略、小队成员RPC权限；严格导出快照；实际GitHub runner与真机验收。

## 性能与架构建议

- 已有页面懒加载、分包、请求合并和日志对象复用；本轮不为“优化”而引入新状态框架或大规模重写。
- 优先修复实时刷新失效语义，再考虑抽取约 2300 行 `src/api.ts` 的订阅、认证、导出模块；保持接口并先补行为测试。
- 测试中有源码字符串断言与简化状态机，无法代替真实组件或数据库执行测试；此次回归采用真实组件和可控 Promise。
- `react-test-renderer` 已有弃用提示，后续逐步迁移 DOM 测试；现有警告不代表测试失败。
- 未采集 Web Vitals/真机性能数据，因此不宣称性能提升百分比。

## 验证与时间线

1. 修改前：`npm run lint`、`npm test`、`npm run build` 均通过，说明缺陷原先未被覆盖。
2. 并行审查：客户端、数据与算法、工程及 SQL 三条线。
3. 第一轮实施后独立复审发现 A→B→A 旧回调遗漏及旧数据展示，追加修复与回归。
4. 协调者最终执行以下命令，全部退出码 0：

```bash
npm run lint
npm test
npm run build
git diff --check
```

5. 独立验收员再次运行 lint、新增 UI 回归及 workout analytics 测试，均退出码 0，给出限定本轮修复的 `VICTORY CONFIRMED`。

最终本地日志：`/tmp/fitgroup-final-lint.log`、`/tmp/fitgroup-final-test.log`、`/tmp/fitgroup-final-build.log`（临时文件，非长期交付）。完整测试包含 APK 配置与 Gradle release guards，但未重新构建和验收发布 APK。GitHub CI 修改必须等远程 runner 执行后才能确认通过。
