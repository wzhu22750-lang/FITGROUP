# UI worker handoff

## Observation
确认三个真实组件缺陷：ExportDataPage 复制按钮没有 busy 禁用和 handler 防护；LogCard 分享先打开，随后 profile 请求完成又打开；TeamDashboard 更新卡片后的 dashboard 读取只检查 mounted，旧队伍或旧代次响应可覆盖当前数据。

## Logic / Changes
- `src/components/ExportDataPage.tsx`：`handleCopyText` 复用 busy guard，复制按钮使用 disabled={busy}，增加稳定测试定位。仅 ready 且没有保存/分享进行中可复制，ready 的零记录合法。
- `src/components/LogCard.tsx`：`handleShare` 仅在用户点击时打开；移除 await 后的二次打开。profile 成功/失败仍更新 stats，不会改变弹窗开关。
- `src/components/TeamDashboard.tsx`：`handleCardLogUpdated` 验证挂载与当前 teamId；刷新请求使用递增 dashboardRequest。切换队伍、订阅新数据、卸载/订阅清理使旧请求失效。当前请求失败被捕获并显示错误，成功清除错误。订阅 dashboard 回调增加生命周期及队伍校验。
- `tests/review-ui-regressions.test.tsx`：渲染真实 ExportDataPage、LogCard、TeamDashboard，使用 deferred Promise 控制完成顺序；仅替换 API I/O 和未审查的 modal 子工具，禁止初始化生产客户端。

## Caveats
- 按分工没有修改 package.json。协调者需要在 npm test 串中加入 `tsx tests/review-ui-regressions.test.tsx`。
- 测试使用现有 tsx 工具链带来的 esbuild，运行时生成 tests 下临时 bundle，finally 中清理；没有网络调用。
- 控制台 react-test-renderer 废弃提示、故意 offline 失败日志，以及既有全套测试的 Supabase 空配置提示不是失败。
- `.gitignore` 和并行 analytics worker 文件未碰。

## Conclusion
三个确认缺陷均修复，公共组件接口保持不变；未操作线上、未执行迁移或部署。

## Verification
全部 exit 0：
1. `npx tsx tests/review-ui-regressions.test.tsx`：加载/失败时复制不可用（包括直接调用 handler）；ready 零记录可复制；保存 pending 时禁用复制；profile resolve/reject 后不重开关闭的分享弹窗；A 的旧响应不能覆盖 B；旧卡片回调无效；同队伍逆序请求仅最新提交；订阅数据使 pending 请求失效；A→B→A 请求代次校验；请求失败保留 dashboard 并显示错误；卸载后完成不提交。
2. `npm run lint`：TypeScript 无错误。
3. `npm test`：现有全套测试通过（新增测试尚待协调者接入）；日志 `/tmp/fitgroup-ui-worker-tests.log`。
