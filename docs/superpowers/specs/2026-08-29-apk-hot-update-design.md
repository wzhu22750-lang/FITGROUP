# APK 热更新（远程 Web 壳）设计

日期：2026-08-29
状态：已获用户批准，进入实施

## 背景与目标

健身打卡 App 当前是 Capacitor 打包的 APK，`server.url` 注释掉，web 资源（`dist/`）打进 APK，每次改版都要重装 APK。

目标：让 APK 在启动时从 `https://app.du4s.com` 加载最新 web 内容，实现「热更新」——改 web 不用重装 APK。

## 约束与已确认事实

- Capacitor 8，`webDir: dist`，Android APK（兼容 HarmonyOS）。
- `app.du4s.com` 是同一 Vercel 项目（fitgroup-three）的自定义域名：GitHub push → Vercel 构建 → 两个域名（`fitgroup-three.vercel.app`、`app.du4s.com`）同时更新。
- 数据层 Supabase，由 web 层直连，与浏览器版一致，无需改动。
- 分发方式：自用/小范围 → 构建 **debug APK**，不配置 release 签名。
- HTTPS 域名，`cleartext: false` 即可，无需额外明文配置。

## 方案选择

**远程 Web 壳（server.url）**：APK 成为壳，每次启动从服务器拉最新 web 内容。
- 优点：改动最小（1 处配置 + 重建 APK）、永远最新、无新依赖。
- 缺点：需网络；无离线缓存；无版本回滚（非当前需求）。
- 已排除：Capgo 真热更新（离线/回滚，后续需要再升级）、自定义启动失败页（A1 默认原生错误页够用）。

## 改动清单

### 1. `capacitor.config.ts`

取消注释并指向 du4s.com：

```ts
server: {
  url: 'https://app.du4s.com',
  cleartext: false,
},
```

⚠️ 设置 `server.url` 后 Capacitor 忽略 APK 内嵌本地资源，每次启动从服务器加载。

### 2. 部署 web

将 `f3f0720`（vercel.json 收窄 rewrite 修复）与本改动一起推送到 GitHub main，触发 Vercel 部署。

### 3. 重新构建 APK

`npm run android:debug`（build → cap sync → assembleDebug），产出 debug APK。

## 错误处理

- 启动时服务器不可达 → Capacitor 原生默认错误页。
- web 层运行时错误 → 已有 `ErrorBoundary` 兜底，不改动。

## 测试清单

- [ ] `app.du4s.com` 线上可访问，资源 200。
- [ ] 缺失资源真实 404（vercel.json 修复生效）。
- [ ] adb 安装新 APK，确认从 du4s.com 加载。
- [ ] 热更新验证：改 web → 重新部署 → 重开 APK 见新内容（不重装）。

## 明确不做（YAGNI）

签名 release 包、Capgo 离线缓存、Play 上架、自定义启动错误页。
