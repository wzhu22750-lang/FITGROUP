# FITGROUP V4 统计优化与隐私验证报告

本轮以 main 的 f60eafdc2f03ba78e45d9b081fe5f47fa18c3311 为基线，完成统计缓存与渐进加载、训练事件过滤、进步证据分级、移动端收敛，以及训练照片 Storage 权限修复。没有新增依赖，没有修改核心评分权重，没有删除原始训练数据。

## 范围与授权

授权来源：本轮用户要求直接修改 main，优先处理性能、数据可靠性、照片权限、统计可信度及移动端体验，测试后提交并正常推送。

范围：本仓库统计与照片链路、项目已有 Supabase 的 workouts bucket 和对应 RLS。远程测试在事务中建立临时账号、打卡与对象元数据，最终全部回滚；未删除任何生产照片或训练记录。报告使用通用验证结构，不涉及恶意软件或外部攻击目标。

## 复现与验收

```bash
npm run lint
npm test
npm run build
npm run benchmark:statistics
npx tsx scripts/supabase-admin.ts --file tests/storage-privacy-probe.sql
```

最后一条需要项目现有的 Supabase 管理凭据。SQL 文件会创建临时测试数据并全部回滚。照片权限迁移 `supabase/migrations/20261012033036_statistics_and_photo_reliability.sql` 已在本轮应用到项目数据库；不要为复现测试重跑全部旧迁移。

## 性能对比

数据来自 [statistics-performance.json](statistics-performance.json)，含六次原始结果。前后版本交替运行三轮，表中耗时取三轮中位数。模拟 Supabase 查询使用同一组 5,000 条记录，每页固定 5ms 延迟；其中两条未来时间记录被两个版本共同排除。传输量为未压缩 UTF-8 JSON 响应字节数，不含 HTTP 头及 TLS。首批可用耗时包括数据回调与统计计算，不等于浏览器完成绘制的时间。

| 指标 | 基线 main | 本轮优化 |
| --- | ---: | ---: |
| 冷启动统计请求 | 16 | 16 |
| 冷启动 JSON 响应字节 | 1,089,663 | 934,725 |
| 首批可用数据与计算 | 231.71ms | 34.61ms |
| 完整历史与统计就绪 | 233.08ms | 172.72ms |
| 新鲜缓存下再次进入：请求 | 16 | 0 |
| 新鲜缓存下再次进入：JSON 字节 | 1,089,663 | 0 |
| 新鲜缓存下再次进入：数据与计算 | 207.04ms | 0.01ms |
| 单次点赞/评论计数更新触发的统计请求 | 16 | 0 |
| 用于反复计算的记录数 | 4,998 | 120 |
| 单次统计计算中位数 | 115.06ms | 6.99ms |

冷启动仍需补齐完整历史，不宣称减少了第一次读取的请求数。改善来自近期数据先返回、精简字段、跨页面内存缓存，以及保留真实历史证据后减少重复计算。近期缓存期限为 30 秒，历史复核期限为 5 分钟；登录退出或切换账号清空缓存。期限内的零请求结论不能外推为永久不请求。

基准可这样复现旧版本：

```bash
git worktree add --detach /tmp/fitgroup-statistics-baseline f60eafd
ln -s /Users/kuangqie/Documents/VibeCoding/Fitgroup/node_modules /tmp/fitgroup-statistics-baseline/node_modules
cp scripts/statistics-benchmark.ts /tmp/fitgroup-statistics-baseline/scripts/statistics-benchmark.ts
npx tsx /tmp/fitgroup-statistics-baseline/scripts/statistics-benchmark.ts
npm run benchmark:statistics
```

上述数字是本机受控实验，不代表真实移动网络、实体 Android、线上首屏绘制或 p95。

## 证据与结论

| Evidence | 来源与复现 | 观察 |
| --- | --- | --- |
| E-001 | 基线 `src/api.ts`；`scripts/statistics-benchmark.ts` | 历史缓存随一次订阅销毁，重新进入重复请求，社交计数更新也触发统计读取。 |
| E-002 | 远程 Storage 策略核查；本轮迁移；`tests/storage-privacy-probe.sql` | bucket 本已私有，但原 SELECT 策略允许全部登录用户读取所有 workouts 对象。新策略依据照片所属者及打卡 RLS 判断。 |
| E-003 | `npx tsx tests/statistics-cache.test.ts` 与 `tests/statistics-subscription.test.ts` | 5,000 条历史、渐进交付、重复订阅、取消、超时、缓存过期、重连、账号隔离、JSON 键序变化与历史 PR 删除均有回归。 |
| E-004 | `npx tsx tests/progression-confidence.test.ts` | 两周期多训练日、估算可靠性与典型表现共同支持明确进步；单次峰值、同日重复、低置信度次数和未记录历史体重的自重负荷不能直接确认持续提高。 |
| E-005 | `npx tsx tests/workout-photo-privacy.test.ts`；远程 RLS 事务探针 | 陌生人、小队成员、所有者、匿名身份的照片读权限及引用中对象的删除策略均检查通过。公开打卡伪造他人私人照片链接不能扩大权限。 |
| E-006 | 生产浏览器预览：320px / 390px / 1280px | 无横向溢出；初始不加载图表库；展开后图表、评分标准与肌群弹窗可用；弹窗可滚动、Escape 可关闭。 |

| Finding | 级别、状态与置信度 | Evidence | 修复位置与结果 |
| --- | --- | --- | --- |
| F-001 | P0 / validated / high | E-001、E-003 | `src/utils/statisticsData.ts`：账号隔离的共享订阅、内存缓存、近期优先、历史证据复用、版本检查与取消；出错保留最后成功数据。 |
| F-002 | P0 / validated / high | E-002、E-005 | Storage RLS + `workoutPhotos.ts` / `WorkoutPhoto.tsx`：带 JWT 下载，照片地址仅作对象引用；无永久公开读取或持久化签名链接。原始数据库照片字段保持兼容。 |
| F-003 | P1 / validated / high | E-004、E-003 | `progressAnalytics.ts`：新增证据结论，保留原评分体系；保留资料转换中的假定标记，修复缺失性别/体重被误标为完整个性化置信度；每项变化包含真实训练日、记录 ID 和表现依据。历史证据压缩与全量计算做差分检查。 |
| F-004 | P1 / validated / high | E-006、E-003 | `Statistics.tsx` / `AbilityRadarCard.tsx`：近期表现与下一步优先，复杂图表及规则按需展开，移除开发者层级标签；修复 320px 模式按钮溢出。 |

### P-001：统计数据调用路径

- path_type：callflow。
- 开始：登录用户进入统计页。
- 目标：近期结论先可用，历史 PR 完整且账号隔离。
- 步骤：用户专属缓存或近期窗口先交付（E-001、E-003 / F-001）；历史完整读取在后台补齐，并保留来源记录的代表性力量证据（E-003 / F-001、F-003）；训练修改使缓存失效，社交及资料更新不触发重算（E-003 / F-001）；自己资料中的总次数下降检测历史删除，避免订阅其他用户的未过滤 DELETE ID（E-003 / F-001）。
- 剩余风险：分页不是数据库事务快照，依赖实时事件和后续复核收敛。

### P-002：训练照片调用路径

- path_type：callflow。
- 开始：上传训练照片或打开已保存照片。
- 目标：权限跟随真实记录，安全清理未引用照片。
- 步骤：新文件不可覆盖已有文件（E-005 / F-002）；JWT 下载通过 Storage SELECT 与打卡 RLS（E-002、E-005 / F-002）；更换、移除或清空草稿产生清理队列，恢复草稿与不确定提交被保留（E-005 / F-002）；Storage DELETE 策略拒绝删除已被保存记录引用的照片（E-005 / F-002）。
- 剩余风险：用户卸载应用或永久不再回访时，本地清理队列不能代替服务端定期 GC。

## 验证时间线

- 2026-10-12：核对 main 与 origin/main，工作区干净，以 f60eafd 建立独立基准副本。
- 2026-10-12：核查远程 bucket、策略及对象数量；应用照片权限迁移。
- 2026-10-12：远程 RLS 探针通过，临时用户、打卡及对象元数据已回滚；最终核查测试用户与 workouts 对象均为零。
- 2026-10-12：缓存、订阅、算法可信度和图片处理回归通过；生产预览检查小屏、弹窗和按需加载。
- 2026-10-12：三轮交替受控基准完成，原始结果存入仓库。

## 仍需验证的边界

1. 浏览器代理环境出现实际 Supabase WebSocket 连接失败。重连机制在生产适配器的模拟传输中验证，尚不能宣称真实 socket 在该网络下成功恢复。
2. 远程权限验证使用真实 RLS 与事务测试对象元数据，未进行真实文件上传到两个实体账号再读取的完整链路测试。
3. 没有实体低性能 Android 测量；构建及已有 APK 守卫通过不等于实体设备流畅度证明。
4. 永久不回访或卸载导致的长期孤立文件需要服务端 GC；本轮未增加新的后台服务或依赖。当前远程 workouts 对象为零，无历史孤立文件需要删除。
5. 首次完整读取历史仍有网络与内存成本。缓存与证据复用降低重复成本，不是服务端聚合的替代承诺。

## 证据文件校验

| 文件 | SHA-256 |
| --- | --- |
| statistics-performance.json | 3ef079803b80c448d344dcafc40c00c9063b2dcc8254a9482ffd18359d05d6ea |
| tests/storage-privacy-probe.sql | 090b5154c847548ce555ad8a22a3f4eae7095675327a8941f9622c41b447d8c8 |
