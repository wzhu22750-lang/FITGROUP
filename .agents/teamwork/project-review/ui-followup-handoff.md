# UI follow-up handoff

## Observation
复审确认两处身份隔离漏洞：A→B→A 后首次 A 的 LogCard 回调只检查 teamId，仍可写入日志与乐观缓存、触发刷新；切换后订阅尚未返回时，旧看板仍可挂在新小队标题下。

## Logic
- `src/components/TeamDashboard.tsx`：选择身份增加单调 generation，`isSelectionCurrent` 同时验证挂载、teamId 和选择代次。`handleCardLogUpdated`、乐观更新清理定时器、日志 updater、刷新发起及返回均检查当前选择；请求代次继续保护同队并发刷新。
- 看板和日志记录所属选择代次，渲染仅消费当前代次的数据，切换即隐藏旧数据；订阅切换清空旧数据、错误及乐观缓存。
- 看板与日志订阅均验证有效订阅及选择代次，迟到的 success/error 无法污染新队或返回后的同名队。
- 失败提示仅在当前队已有成功数据时声称显示上次数据。

## Regression coverage
`tests/review-ui-regressions.test.tsx` 新增：
1. 保存首次 A 卡片回调，在 A→B→A 后以日志更新参数调用；刷新计数不变、当前 log 引用不变，随后订阅重放也不出现旧乐观内容。
2. 延迟 B 的看板与日志订阅：pending、旧 A 迟到推送、B failure 均不显示 A 成员、出勤或日志；当前 B 成功可正常显示。
3. 返回 A 后首次 A 订阅依旧无效，只有新 A 订阅可发布。

## Caveats
无线上请求、迁移、部署及浏览器自动化。测试以 esbuild 打包真实组件，仅替换 I/O 边界。现有 react-test-renderer 弃用警告以及预期 offline 场景的日志仍出现，不影响通过。

## Conclusion / Verification
- `npx tsx tests/review-ui-regressions.test.tsx`：PASS。
- `npm run lint`（`tsc --noEmit`）：PASS。
- 修改范围仅两个授权实现/测试文件及本交接文档；未更改其他文件。

关键函数：`isSelectionCurrent`、`handleCardLogUpdated`、看板/日志订阅 effects。公共签名不变。
