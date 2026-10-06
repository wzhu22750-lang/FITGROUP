# APK 本地启动与安装

版本：**1.0.2 / versionCode 3**。完整根因、测试与度量见 [启动修复报告](startup-fix.md)。

> 旧 APK 必须升级：网页发布不会修复已经安装的远程 Web 壳启动配置。当前生成的 release APK 未签名，生产升级必须使用原发布签名，不能用 debug 包替代。

## 构建与核验

```bash
npm ci
npm run lint
npm test
npm run cap:sync
cd android
./gradlew assembleDebug assembleRelease
cd ..
npm run apk:verify
npx tsx scripts/verify-apk.ts android/app/build/outputs/apk/release/app-release-unsigned.apk
```

需要 Java 21、Android SDK 和真实的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`。不要把 service-role/secret key 配到客户端。

- 默认 `capacitor.config.ts` 只有 `webDir: 'dist'`，没有远程 `server.url`。
- 开发远程模式必须明确使用 `CAP_DEV_REMOTE=true`（`npm run android:debug:remote`）；不可发布给用户。
- 生产远程标志会使配置加载失败；Gradle 每个 release variant 检查生成配置、入口与引用资源。缺失环境变量会使 Vite build 失败，不能通过 `SKIP_ENV_GUARD` 绕过。
- `scripts/verify-apk-guards.ts` 执行真实失败构建测试，不只检查源文件字符串。
- `scripts/verify-apk.ts` 从实际 APK 解压配置，并核对每个运行时资源与当前 `dist` 的字节内容。`.vite/manifest.json` 是构建诊断信息，Android aapt 默认排除，不属于运行时资源。

## 安装和升级

- 调试包：`android/app/build/outputs/apk/debug/app-debug.apk`，已由 Android debug key 签名。
- 发布产物：`android/app/build/outputs/apk/release/app-release-unsigned.apk`，**必须使用既有发布密钥签名后才能发布**。
- 同签名、同 applicationId 的升级使用覆盖安装，不应默认清除数据。例如连接测试设备后：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

此命令仅适用于原来也是相同 debug 签名的安装。遇到签名不匹配，不要为绕过错误而直接卸载用户的正式版本。

## origin 变化的兼容性

Android Capacitor 8 默认本地 origin 是 `https://localhost`（安装的 `CapConfig.java` 中 hostname/scheme 默认值已核对）。以前远程 origin 的 WebView localStorage 和 Supabase session 不会自动跨 origin 迁移。

因此升级后可能需要重新登录；公开 Feed 缓存、个人资料缓存也会从新的本地存储重新建立。**不复制旧 token，不把缓存用户资料当成认证，也不清理云端训练记录。** 同本地 origin 后续升级可继续使用 SDK 持久化 session，但资料缓存须匹配 session UID，依赖资料的写入须等远程资料就绪。

已验证浏览器不同 origin 的存储隔离、无 session 的旧资料缓存不能登录；未验证正式 Android 包从远程 origin 覆盖升级后的实机行为。当前 `adb devices` 没有设备，且没有原生产签名或测试账号，不能宣称首次安装/生产升级端到端通过。
