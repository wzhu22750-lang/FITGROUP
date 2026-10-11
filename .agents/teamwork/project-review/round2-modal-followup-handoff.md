# Round 2：嵌套训练详情弹窗 Escape 修复交接

## 结论

已修复独立复审阻塞：训练详情只在自身拥有返回栈顶层时处理 Escape；分享关闭不会连带关闭详情；编辑原生 dialog 的 cancel 默认动作不再被父层阻断，保存 busy guard 与 Android 返回保持原行为。

## 文件和接口

- `src/components/WorkoutDetailModal.tsx`：稳定的 `backHandler` 使用 `closeRef` 获取最新关闭回调；只注册一次，避免父回调更新把父层重新压到子层上方。Escape 改为 window capture 阶段检查所有权及 `defaultPrevented`。
- `src/backStack.ts`：新增无副作用的 `isTopBackHandler(handler)`；`pushBackHandler`、`consumeBack` 签名及行为不变，向后兼容。
- `tests/notification-detail.test.tsx`：移除 SharePosterModal / EditWorkoutModal stub，测试真实分享 document keydown、真实 EditWorkoutModal / WorkoutSheet cancel 与返回栈。仅替换 WorkoutSession 的保存业务，调用实际 `editing.onBusy(true)` 设置 busy；未替换逃逸、取消或返回逻辑。
- 本交接文件。

未修改 SharePosterModal、EditWorkoutModal、WorkoutSheet 或其他工作树现有修改。

## 根因及处理

原父层 window bubble Escape 无条件关闭：分享在 document 阶段先关闭，事件继续到父层；编辑的 keydown 被父层 preventDefault，无法触发原生 cancel，同时直接关闭详情绕过 busy guard。

只在 bubble 阶段检查当前栈顶仍不可靠：子层可能已同步卸载、注销返回处理器。因此父层在 window capture 阶段检查自身是否顶层；若有子层，不 preventDefault、不关闭，也不注册 bubble Escape 回调。编辑随后由原生 dialog cancel 路径自行判断 busy。无 DOM selector、无组件名字判断、无全局 Escape 执行 consumeBack（避免把原生 cancel 换成另一条关闭路径）。

## 验证与证据

新增回归先运行在未修复版本上：

```text
npx tsx tests/notification-detail.test.tsx
AssertionError: same Escape cannot close a newly exposed parent
3 !== 2
```

修复后以下命令全部成功（退出码 0）：

```bash
npx tsx tests/notification-detail.test.tsx
npm run lint
npm test
git diff --check
```

关键断言：

1. document Escape 同步注销子层返回处理器后，同一事件也不会关闭父层。
2. 真实分享处理器关闭分享，详情保留；下一次 Escape 才关闭详情。
3. 编辑 Escape 未被父层 preventDefault；真实 WorkoutSheet cancel 调用编辑 busy guard，忙碌时编辑和详情都保留。
4. 父关闭回调变化后，编辑仍保有顶层所有权。
5. 空闲编辑 cancel 只关闭编辑。
6. 分享 / 编辑 Android `consumeBack()` 先关闭子层、下一次关闭详情；busy 编辑消耗返回但不关闭详情。
7. 卸载后返回栈没有残留；原请求取消、身份切换和通知跳转测试仍通过。

## 边界说明

本轮是实际组件与真实返回栈集成测试，事件驱动器显式按 window capture → document → window bubble 顺序运行。原生 dialog 默认动作由测试在未取消的 keydown 后发送 cancel，实际 cancel handler 未 stub。没有使用浏览器或 Android 设备，不声称完成浏览器/设备 E2E；showModal / close / viewport 样式是 renderer 所需的宿主节点模拟。

全套测试输出仍含已有 react-test-renderer 弃用提示、测试环境 Supabase 配置缺失提示与 localstorage 警告；全部测试通过。
