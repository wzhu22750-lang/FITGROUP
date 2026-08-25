# FitGroup

<div align="center">

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38BDF8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)

<br>

</div>

**一个 brutalist 风格的健身打卡群组应用。** 用 React + Firebase 构建，支持训练记录、实时动态、点赞评论、数据统计和战绩海报分享。

---

## 🏋️ 功能

| 模块 | 说明 |
|---|------|
| **认证** | 邮箱/密码注册登录，自动登录，会话实时监听 |
| **打卡记录** | 力量训练（重量/组数/次数）+ 有氧（时长/距离/卡路里），支持多项目、拍照或图片链接 |
| **实时动态** | Firestore 实时卡片流，下拉刷新，点赞/取消点赞 |
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
| 后端 | Firebase Auth + Firestore |
| 移动端 | Capacitor（Android） |
| 部署 | Firebase Hosting / Vercel |

---

## 🚀 快速开始

**前置条件：** Node.js 18+

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 即可。

### 生产部署

```bash
# 构建
npm run build

# 预览构建结果
npm run preview
```

---

## 📂 项目结构

```
src/
├── App.tsx              # 根组件，Tab 切换 + 认证守卫 + 懒加载分包
├── firebase.ts          # Firebase Auth + Firestore + Storage 封装与统计重算
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
    ├── PhotoSourceSheet.tsx # 拍照/相册选择底栏
    ├── Toast.tsx            # 通知组件
    └── ErrorBoundary.tsx    # 错误边界
```

---

## 📝 路线图与特性

- [x] 真实图片压缩上传（Firebase Storage）
- [x] 动态实时流与删除级联清理（Likes, Comments, Storage 图片）
- [x] 训练记录为单一事实源的自愈统计系统（连续天数、PR、总次数）
- [x] 提交幂等性防重复记录
- [x] 生产包代码分割与懒加载优化
- [x] Android 沉浸式安全区域适配与全自动热更新模式

---

## 📄 License

Apache-2.0