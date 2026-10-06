# FitGroup

<div align="center">

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3FCF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38BDF8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)

<br>

</div>

**一个 brutalist 风格的健身打卡群组应用。** 用 React + Supabase 构建，支持训练记录、实时动态、点赞评论、数据统计和战绩海报分享。

---

## 🏋️ 功能

| 模块 | 说明 |
|---|------|
| **认证** | 邮箱/密码注册登录，自动登录，会话实时监听 |
| **打卡记录** | 力量训练（重量/组数/次数）+ 有氧（时长/距离/卡路里），支持多项目、拍照或图片链接 |
| **实时动态** | Postgres 实时卡片流，下拉刷新，点赞/取消点赞 |
| **评论** | 实时评论流，支持 Enter 快捷发送 |
| **个人中心** | 头像/昵称修改，设置页，退出登录 |
| **数据统计** | 连续打卡天数、累计训练次数、能力雷达图、PR 个人纪录、群组榜单 |
| **海报分享** | 生成战绩海报，截图分享到群聊 |

---

## 🎨 设计风格

Brutalist 粗野主义：粗黑边框、硬阴影、荧光黄 `#DFFF00` 强调色、纸色背景、全大写无衬线字体。所有交互强调物理感——按钮按下有位移反馈，破 PR 有纸屑动画。

---

## 🛠 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 19 + Vite + TypeScript |
| 样式 | Tailwind CSS v4 + 自定义 brutalist 主题 |
| 动画 | Framer Motion |
| 图表 | Recharts |
| 后端 | Supabase Auth + Postgres + RLS |
| 移动端 | Capacitor（Android） |
| 部署 | Vercel（GitHub 推送自动发布） |

---

## 🚀 快速开始

**前置条件：** Node.js 22+（Capacitor 8 要求），以及一个 [Supabase](https://supabase.com/dashboard) 项目。

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量并填入 Project URL + anon key
cp .env.example .env

# 3. 在 Supabase SQL Editor 执行 supabase/migrations/0001_init.sql
#    Authentication → Providers：启用 Email，开发阶段关闭 Confirm email

# 4. 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 即可。

### 生产部署（Vercel）

1. 在 [Vercel](https://vercel.com) 用 GitHub 导入 `FITGROUP`，生产分支选 `main`。
2. Framework Preset 用 Vite；Build Command `npm run build`；Output `dist`（`vercel.json` 已写好）。
3. 添加环境变量（Production / Preview 都要）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`（publishable key）
4. 之后推送到 `main` 即自动构建上线。
5. **APK 本地资源打包与防线架构**：
   - **默认本地资源打包**：APK 默认采用本地打包静态资源（`dist/` → `android/app/src/main/assets/public/`），WebView 直接加载本地页面资源，避免网络波动导致静态页面白屏（注：用户认证与数据同步等动态业务仍依赖 Supabase 网络服务）。
   - **构建守卫（Build Guard）**：Vite 构建时若缺失 `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY`，直接抛出致命错误中断，且无任何绕过机制（严禁 `SKIP_ENV_GUARD`）。
   - **生产安全防线（Production Guard）**：生产构建严格禁止注入远程 `server.url`（杜绝 `CAP_ALLOW_REMOTE_PROD` 等任何后门）；Gradle 所有 release 路径强制校验 `capacitor.config.json` 存在且无远程 `server.url`，并校验 `index.html` 及其引用的所有本地静态资源文件完整存在。
   - **显式开发远程热更新**：开发调试场景下仅支持显式传入 `CAP_DEV_REMOTE=true` 标志（如 `npm run android:debug:remote`）开启远程 Web 壳，生产环境下使用该标志直接报错中止。

### Android APK 构建与调试

确保 `.env` 中已配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，常用构建命令如下：

```bash
# 1. 检验构建防线与本地资源配置规范
npm run guard:verify

# 2. 构建本地资源 APK（默认推荐，版本 v1.0.2 / versionCode 3）
npm run android:debug

# 3. 显式开启开发远程热更新 Web 壳构建（仅限开发联调）
npm run android:debug:remote
```

- 生成文件路径：`android/app/build/outputs/apk/debug/app-debug.apk`；执行 `cd android && ./gradlew assembleRelease` 可生成未签名 release，发布前须用原发布密钥签名。
- 已安装的远程 Web 壳 APK **必须升级**，仅更新网页不生效。远程 origin 切到 `https://localhost` 后可能需要重新登录，本地缓存会重新建立；云端记录不会因此被删除。
- 真机覆盖升级须保持签名一致，不要用卸载正式包来绕过 debug 签名不匹配。
- Java 21 / Android SDK 是原生构建前置条件；`npm run apk:verify` 核对实际 APK 的启动配置和全部运行时资源。
- 修复、测试、资源体积及待验证项：[启动修复报告](docs/startup-fix.md)；[新版 APK 安装说明](docs/startup-apk.md)。
- 版本规范：每次安装新包前请确认已递增 `android/app/build.gradle` 的 `versionCode` 与 `versionName`（当前基线为 `3` / `1.0.2`）。

---

## 📂 项目结构

```
src/
├── App.tsx              # 根组件，Tab 切换 + 认证守卫 + 懒加载分包
├── api.ts               # Supabase Auth + Postgres 封装
├── lib/supabase.ts      # Supabase 客户端
├── native.ts            # Capacitor 原生交互（相机/相册/返回键/状态栏）
├── types.ts             # TypeScript 类型定义
├── index.css            # 全局样式（brutalist 主题变量 + 安全区域适配）
├── main.tsx             # 入口
└── components/
    ├── AuthScreen.tsx       # 登录/注册表单
    ├── Feed.tsx             # 实时动态流与级联删除
    ├── WorkoutLogger.tsx    # 训练打卡表单与幂等提交
    ├── Statistics.tsx       # 数据统计面板与实时排行榜
    ├── Profile.tsx          # 个人中心 + 设置
    ├── SharePoster.tsx      # 战绩海报组件
    ├── SharePosterModal.tsx # 海报预览弹窗
    ├── Toast.tsx            # 通知组件
    └── ErrorBoundary.tsx    # 错误边界
```

---

## 📝 路线图与特性

- [ ] Storage bucket 已配置头像/打卡图权限；客户端上传功能尚未接入
- [x] 动态实时流与删除级联清理（Likes, Comments）
- [x] 训练记录为单一事实源：连续天数 / PR / 总次数由数据库触发器重算
- [x] 提交幂等性防重复记录
- [x] 生产包代码分割与懒加载优化
- [x] Android 沉浸式安全区域适配与本地资源打包架构
- [x] APK 自动化构建守卫、生产安全防线与显式远程热更新模式

---

## 📄 License

Apache-2.0