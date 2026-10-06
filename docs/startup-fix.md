# 首次启动加载修复报告

审查基线：`main / b5aa3d0`。版本：**1.0.2 / versionCode 3**。

> 旧 APK 必须升级。当前已生成 debug 签名包和 **未签名 release**；生产覆盖升级须使用原发布签名。没有连接的 Android 设备和生产测试账号，**未宣称真机或生产端到端通过**。

## 结论与审查范围

不是通过增加缓存、延长等待时间或隐藏动画修复：移除了生产 APK 对远程站点加载静态页面的依赖，认证不再等待资料，核心读取实际取消并受截止时间约束，重试/重连能替换挂起读取，点赞不阻塞动态。

开始时 HEAD 为 `b5aa3d0` 且工作区已有修改。执行期间 HEAD 变为 `d6be0b5`（昵称级联同步）；没有回退该提交或已有样式/业务修改。已有的 SWR 缓存、乐观更新 reconciliation、非活跃页延迟查询、昵称同步及相关测试均保留。构建对比基线由 `git archive b5aa3d0` 在临时目录重新生产构建，不以旧 `dist` 代替基线。

## 根因、位置与修改

| 根因 / 证据 | 修改位置 | 修改行为 |
|---|---|---|
| 配置硬编码远程 `server.url`；远程站点不可达时包内页面不能启动 | `capacitor.config.ts`、`vite.config.ts`、`android/app/build.gradle` | 默认本地 `dist`；唯一开发开关 `CAP_DEV_REMOTE=true`；生产远程标志、缺失环境变量及非法 release 资源必须失败 |
| `loginWithEmail`、注册、会话监听等待 `ensureUserProfile`；启动超时曾返回缓存用户 | `src/api.ts`、`src/App.tsx` | SDK session 确认后立即提供框架；无 session 返回登录页；资料后台 single-flight；缓存不能建立认证 |
| 同 UID 重复初始化；退出或切换后旧资料可写回 | `ensureUserProfile`、`getUserProfile`、`subscribeToUserProfile` | UID 与 generation 双重防护；切换取消旧请求；订阅 dispose 和 App 更新回调也防止旧状态恢复 |
| 缓存/Auth-only 资料可能参与写入 | `requireProfileForWrite`、`createWorkoutLog`、`addComment` | 资料依赖写入等待完整资料，不在失败时以默认资料继续写入；仍校验 SDK 用户及服务端 RLS |
| 骨架结束分散在订阅路径；手动/恢复成功空列表没有结束 loading；旧请求覆盖 | `src/components/Feed.tsx`、`SharedFeedScheduler` | 所有成功结果统一通过订阅提交；包括空数组；显式 retry 与 recovery 取消并替换旧 flight；移除只关闭动画的 safety timer |
| 核心读取不受可靠截止时间控制 | `src/utils/request.ts`、`src/lib/supabase.ts`、API 读取 | 关键读 9 秒默认截止；SDK builder 使用 `.abortSignal`（在 `.maybeSingle()` 前）；迟到响应不提交；共享请求限并发；取消不触发写操作自动重试 |
| Feed 等待批量点赞；失败后每张卡发请求 | `SharedFeedScheduler`、`attachCurrentUserLikeState`、`src/components/LogCard.tsx` | 先提交动态，再批量补点赞（4 秒辅助截止）；未知/已赞/未赞分开；未知时仅点击目标卡后查询；批量失败不 fan-out |
| 公共缓存含上一账号的点赞状态 | `Feed` 初始化、`App` Feed key | 公共内容保留，但挂载时点赞置 unknown；账号切换重挂载，旧批量点赞结果不能进入新会话 |
| `App → Feed → LogCard → 分享/编辑` 静态依赖；登录阶段自动预取 WorkoutLogger | `App.tsx`、`LogCard.tsx` | Feed 按认证状态加载；分享/编辑真正 lazy，html-to-image 仅进入分享图；取消定时 WorkoutLogger 预取，改为导航意图预取 |
| 资源加载失败缺少明确恢复文案 | `ErrorBoundary.tsx`、预取回调 | chunk 错误显示重新加载入口；预取失败不会造成未处理 rejection；框架保留原视觉体系 |

认证回调通过下一轮任务启动资料请求，避免在 Supabase auth lock 内发 SDK 请求。注册无 session 时仍提示查收确认邮件；不修改 RLS、邮箱确认或权限模型。资料写入/注册/打卡/点赞均不做无差别自动重试。全局 transport 对未带 signal 的请求（含认证）实际发出 abort，不以 UI 动画冒充取消。

Feed 提供 `loading / success / empty / offline / timeout / error` 状态（根节点 `data-state`）。有内容时后台错误保留内容；无内容时明确错误/重试。前台/联网恢复使用在途去重和 1 秒 burst 合并；通用刷新调度器限一个在途读取、一个后续刷新。通知、实时订阅不在首页 await 链上。

## 实际测试结果

`npm run lint`、`npm test`、生产 `npm run build`、`npx cap sync android`、Gradle debug/release 构建均 **退出码 0**。`git diff --check` 通过。

| 场景 | 被测真实逻辑 | 结果 |
|---|---|---|
| 空缓存、无 session、外部网络不可用 | 真实生产构建 + 浏览器；允许本地资源服务器，阻断全部外部网络，navigator offline | 登录页可见且按钮可操作；未读取缓存建立认证 |
| 登录成功、资料挂起 | 实际 `loginWithEmail`、`waitForAuthReady`、会话监听 | 认证立即返回，资料仍未 ready；退出实际 abort；无 session 登录不能建立用户 |
| 邮箱确认与写入约束 | 实际注册、`createWorkoutLog` | 无 session 注册提示确认邮件且只执行一次；打卡等资料返回后再写入真实姓名/头像 |
| 资料初始化并发/切换账号旧请求到达 | 实际 `ensureUserProfile` | 并发共享一个 RPC；A 迟到结果不污染 B；SDK 收到取消信号 |
| Feed 快、点赞慢 | 实际 fetch/subscribe/batch functions | 先收到动态，之后收到已赞补丁；unknown 不等于 false |
| 初次挂起，手动或恢复成功返回空数组 | 实际渲染 `Feed` + SDK transport 桩 | 骨架消失并显示 empty；旧 SDK 请求实际收到 abort |
| 新结果后旧响应到达 | 实际 `Feed` / production scheduler | 旧响应不覆盖新的空态/数据 |
| 多个 online/focus、后台失败 | 实际 `Feed` 事件监听 | burst 只有一个读取；后台失败保留内容 |
| 批量点赞不可用、目标卡点击 | 实际渲染 5 张 `LogCard` | 挂载没有任何单卡点赞查询；点击只查询一张，并按真实已赞状态取消赞 |
| 缺环境变量、生产远程 URL、缺配置/引用资源 | 实际 Vite / Capacitor 配置 / Gradle 失败构建 | 全部按预期失败；合法配置构建通过 |

测试位于 `tests/startup-auth.test.ts`、`tests/request-infra.test.ts`、`tests/startup-feed.test.tsx`、`tests/startup-logcard.test.tsx`；调用生产函数/实际组件，桩仅替换 SDK/网络，未实现替代性的理想化业务类。renderer 已固定为与当前 React 同版本的 `19.2.6`。测试输出包含 renderer 弃用提示及预期取消错误；不作为未通过。

## 阶段耗时（不是生产延迟承诺）

`[fitgroup:timing]` 本地诊断记录 auth、profile、feed、likes 与页面挂载时间；无用户 ID/token，不发送遥测。可通过 `getStartupTimings()` 在调试代码中读取最近记录。

| 阶段 | 本次记录 | 条件 |
|---|---:|---|
| 无 session 认证 | 0–1 ms | 桌面浏览器，本地页面、空存储、外部请求阻断 |
| 登录页挂载 | 336 ms | 相同浏览器模拟；从 navigation 起算，不包含动画阻挡时间 |
| 登录按钮可操作 | 1771 ms | Playwright trial click；包含已有 splash/执行调度，不是真机数值 |
| 登录完成但资料挂起 | 0 ms（取整） | 真实 login 函数 + 确定性 SDK 桩 |
| 资料成功 | 25 ms | 生产资料函数，transport 固定延迟约 25 ms |
| 动态 / 点赞 | 2 ms / 403 ms | 真实 subscribe/fetch；点赞 transport 固定约 400 ms；内容先到 |

没有生产账号，因此没有生产资料、动态、点赞请求 p95 或真实网络 RTT 数据。9 秒是初始读取策略，不声称已根据真机网络完成调优。

## 生产首屏依赖对比

同一安装依赖，对 `b5aa3d0` 与当前代码执行 Vite 生产构建；以 manifest 的 **静态 imports 传递闭包 + CSS** 计数。登录/Feed 列还加入对应页面和现有 splash。不将 lazy 分享/编辑或以后导航页面计入首屏，也不将图片/HTML算作 JS/CSS 资源；gzip 为本地 `gzipSync` 估算，不是 Android 包压缩或下载量。

| 闭包 | 基线资源数 | 当前资源数 | 基线字节 / gzip | 当前字节 / gzip |
|---|---:|---:|---:|---:|
| entry | 6 | 5 | 748544 / 213507 | 693040 / 198074 |
| 登录 + splash | 8 | 7 | 758067 / 217582 | 702579 / 202169 |
| 已认证 Feed + splash | 7 | 9 | 754800 / 216261 | 734840 / 212195 |

Feed 的资源数 **增加**，因为拆成独立 Feed/LogCard/presets chunk；总静态依赖体积略降，不把分包宣传成减少所有资源请求。登录闭包下降 55488 原始字节；当前 entry/登录/Feed 都不包含 `vendor-share`、SharePosterModal 或 EditWorkoutModal。当前仍有 React、Supabase、motion 的基础成本，未宣称大幅倍速优化。

浏览器实测登录阶段 7 个 JS/CSS 文件，与当前闭包匹配。已有工作区其他 UI/业务修改也会影响体积；上述整体差值不能全部归因于本次启动修复。

复算：`npx tsx scripts/measure-startup.ts dist`。原始文件清单见 [基线](startup-evidence/b5aa3d0-bundle.json) / [当前](startup-evidence/current-bundle.json)。

## APK 核验与升级

两种 APK 内均没有 `server.url`，`webDir=dist`，26 个运行时文件与当前 dist **逐字节相同**。生成配置 `android/app/src/main/assets/capacitor.config.json` 同样为本地模式；`.vite` 仅是 aapt 排除的诊断元数据。

| APK | SHA-256 |
|---|---|
| `android/app/build/outputs/apk/debug/app-debug.apk` | `702d904afacae05b1e20fd13a39bede28a77083cca3243ff1d6a0d319f84a0b4` |
| `android/app/build/outputs/apk/release/app-release-unsigned.apk` | `8c596093350f95146e29255006fa645e340f94f9e9a501ba134793df83412af0` |

详见 [安装说明与 origin 兼容性](startup-apk.md)。origin 从远程域切到 Capacitor 默认 `https://localhost` 后，旧 WebView 的 localStorage/session 不会跨域复制，用户可能需要重新登录，缓存重新建立；云端业务数据不受影响。同本地 origin 的后续升级保留 session 存储。

已在真实浏览器验证不同 origin 存储隔离和仅缓存资料不能认证，但 **尚未实机验证旧正式 APK 覆盖升级**。不靠复制缓存 token 或关闭权限校验规避迁移问题。

## 复现证据与待验证项

- [全量测试](startup-evidence/tests.log)、[生产构建](startup-evidence/build.log)、[Capacitor sync](startup-evidence/cap-sync.log)、[Gradle 构建](startup-evidence/gradle.log)、[浏览器测试](startup-evidence/browser.log)、[阶段时间](startup-evidence/browser-console.log)。
- 浏览器脚本：`scripts/verify-browser-startup.js`，给 `playwright-cli run-code` 使用；运行前启动 `vite preview --host 127.0.0.1 --port 4178`。完成后必须关闭浏览器。本次浏览器和临时 preview 已显式关闭。
- 尚需：原发布密钥签名；真机空数据首次安装/飞行模式；从旧远程 APK 覆盖升级；生产邮箱确认、登录、RLS、真实弱网断线恢复；Android WebView 中分享/编辑 lazy chunk 恢复与首屏时间。
- `adb devices` 为空；没有进行安装、真机截图、生产数据库写入或线上 schema 变更。
- 安装测试依赖时 npm 报告现有依赖审计警告，本轮没有执行无差别 `npm audit fix` 或扩大依赖升级范围。
