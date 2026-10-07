# FITGROUP 统计体系算法审计报告（V3）

> 审计范围：训练能力指数 → 肌群能力评分 → 训练频率 → 有效训练量 → 渐进超负荷 → PR → Estimated 1RM → 体重/性别归一化 → 动作标准 → 力量等级 → 肌群综合力量 → 雷达图 → 均衡度 → 置信度 → 用户提示。
> 基准来源快照：Strength Level 社区分位数据 `2026-03`（社区自报成绩精选，community percentile）。
> 验证：`npm run lint` ✅ · `npm test`（18 个测试文件、805 项断言）✅ · `npm run build` ✅

---

## A. Current Model Problems（旧算法问题清单）

| # | 问题 | 严重度 | 位置（旧） |
|---|------|--------|-----------|
| A1 | **同一成绩两个等级（P0）**：`calculateStandardizedScore` 把五档阈值映射为 20/40/60/80/100 分，`getStrengthTier` 按分数段判级；而 `resolveStrengthAssessment` 又按 threshold→tier 直接判级。成绩恰在阈值上时两个 UI 给出不同等级 | P0 | workoutAnalytics.ts |
| A2 | **等级语义错位**：tier 顺序 novice<beginner，而 Strength Level 源数据的顺序是 Beginner<Novice<Intermediate<Advanced<Elite；中文标签 新手/入门/进阶/熟练/精英 与源 tiers 无法对齐 | P0 | strengthStandards.ts |
| A3 | **分数=满分错位**：达到 Elite 阈值即 100 分，把"人群 95 分位"曲解成"世界满分" | P1 | calculateStandardizedScore |
| A4 | **coverage 直接改写力量分**：数据不足被解释成"你力量更差"（top3 加权 ×0.65–1.0） | P0 | 部位力量聚合 |
| A5 | **Weight Score 实为容量比值**：currentPeriodVolume/baselinePeriodVolume，训练容量在 Volume 与 Weight 两个维度重复计入；"无历史=50 分"伪装成中性 | P0 | 子肌群评分 |
| A6 | **频率跳变**：`25 + weekly×25`，28 天练 1 次也得 ~31 分 | P1 | frequencyScore |
| A7 | **容量模型单一**：所有肌群 12 组=100 分线性单调，练越多越强，无目标区间、无上限 | P1 | VOLUME_TARGET_PER_WEEK |
| A8 | **训练等级复用力量等级**：trainingScore → getStrengthTier → 高频用户显示"精英" | P0 | categoryDetails.tier |
| A9 | **Epley reps>10 静默截断**：80kg×20 偷偷按 ×10 估算 | P0 | estimateOneRepMax |
| A10 | **自重动作失效**：俯卧撑/双杠 weight=0 → effectiveLoad=0 → 永远无法产生力量分；引体以外自重动作无模型 | P0 | validateExercisePerformance |
| A11 | **负荷语义缺失**：哑铃记录按单只，容量少算一半（未×2）；单臂/器械/绳索与杠铃等价对待 | P0 | 容量/tonnage |
| A12 | **器械=自由重量**：蝴蝶机 50kg 直接参与人口基准对比，忽略滑轮倍率/力臂/品牌差异 | P1 | 全部基准 |
| A13 | **肌群映射两套矛盾数据**：传统硬拉 standards=腿55/背45，coefficients=纯背，keyword fallback 又是腿+背三处互相打架 | P0 | 两个常量文件 |
| A14 | **动作未 canonicalize**：'引体' 匹配不上任何 standard；'卧推'/'杠铃卧推' 在 top3 中可重复计数；substring 匹配无长度守卫 | P0 | findExerciseStandard |
| A15 | **share 惩罚失真**：`score×(0.8+0.2×share)`，20% 参与度的肌群拿到 84% 力量分 | P1 | recordStrengthCandidate |
| A16 | **异常 PR 永久污染**：卧推 800kg 无任何校验，直接成为 PR 并污染部位分 | P0 | PR 扫描 |
| A17 | **legacy PR 与 log e1RM 同权**：profile.prs（无次数/时间戳）与实测记录同等置信度 | P1 | PR 合并 |
| A18 | **缺资料静默按 70kg 男**：无任何 UI 提示这是通用估算 | P1 | bodyContextFromProfile |
| A19 | **均衡度混构念**：5 个阻力部位（三维算法）+ 有氧（五维算法）标准差混算 | P1 | balanceScore |
| A20 | **lagging 无资格门槛**：从未训练的小肌群永远"薄弱" | P1 | insights |
| A21 | **雷达图 0 分画 6 分**：视觉 padding 写进数据点，标签/可访问性读到假值 | P2 | Statistics.tsx |
| A22 | **无置信度体系**：任何地方都看不出"系统对这个数字有多大把握" | P0 | 全局 |
| A23 | **基准无出处**：仅代码注释提及 StrengthLevel/ExRx，无快照版本可追溯 | P2 | standards |
| A24 | **无年龄声明**：基准未做年龄修正且未告知 | P2 | UI |

---

## B. V3 Algorithm（最终数学结构）

### B.1 训练能力指数（Training Capacity V3）— 回答"我最近练得怎么样"

```
部位分 = 0.25×频率 + 0.30×有效容量 + 0.25×进步 + 0.20×稳定性
（权重集中配置 TRAINING_SCORE_WEIGHTS；单维最高权重 0.30，
  任何单一指标最多贡献 30 分，无法独自把总分拉到 90+）
```

| 维度 | 输入 | 曲线 |
|------|------|------|
| 频率 25% | 每周训练日数（该肌群被触达的 distinct days / 周数） | 分段插值 [[0,0],[0.5,20],[1,45],[1.5,65],[2,80],[3,100]]，连续无跳变 |
| 有效容量 30% | 每周有效组数 = Σ(sets × 刺激系数)，per-muscle 目标区间 | 分段：0→0，min→50，target→85，upper→100 后封顶（不奖励、不扣分） |
| 进步 25% | 本期最佳 e1RM / 上期最佳 e1RM（per canonical exercise，按刺激系数聚合到肌群） | [[0.8,10],[0.9,30],[1.0,55],[1.05,80],[1.1,92],[1.2,100]]；无基线 → 中性 50 + 低置信度；轻重量加次数不产生 e1RM 提升 → 不误判 |
| 稳定性 20% | 近 4 周每周有效组数 | activeWeeks/4 × 60 + (1−CV) × 40；突击一周 ≈ 15 分 vs 均匀四周 ≈ 100 分 |

- 等级使用独立词表 `TRAINING_STATE_TIERS`：起步(0-19) / 建立习惯(20-39) / 稳定训练(40-59) / 状态良好(60-79) / 训练充足(80-100)。**绝不出现"精英"字样**。
- 刺激系数为**有效组当量**（主肌群 1.0，次要 0.25-0.6），总和可 >1，不再强制"分蛋糕"。
- 有氧保持独立五维模型（频率/时间/MET强度/加权量/持续性），固定 28 天窗口。

### B.2 极限力量水平 — 回答"我现在有多强"

```
WorkoutLog ──resolvePerformanceLoad（负荷语义）──▶ benchmarkLoad
       ──estimateOneRepMaxDetailed（公式共识+次数置信）──▶ e1RM
       ──checkPlausibility（绝对上限 + 个人跳变）──▶ 可信成绩
       ──scaleThresholds（性别+体重幂函数缩放）──▶ 五档阈值
       ──scoreFromBenchmarkValue（百分位锚点插值）──▶ 相对力量指数 0-100
       ──aggregateCategoryStrength（按可靠性加权）──▶ 部位力量分 + tier + confidence
```

**分数定义**（相对力量指数，不声称精确百分位）：
五档阈值锚定 **[5, 20, 50, 80, 95]**，阈值之间线性插值；Elite 以上 `95 + 5×(1−e^(−2(v/t5−1)))` 渐近逼近 100（2×Elite ≈ 99.3），**到达 Elite ≠ 100**。

**等级唯一源**：`STRENGTH_TIERS`（Beginner 初学 < Novice 入门 < Intermediate 进阶 < Advanced 高阶 < Elite 精英）。阈值判级 `getTierForBenchmarkValue` 与分数判级 `getStrengthTier` 由锚点对齐（测试断言全值域一致），P0-A1 不可能在架构上复发。

**部位聚合**（替代 top3×coverage）：每个 canonical 动作一个评估，按基准可靠性加权平均——A(杠铃大项)=1.0、B(可靠自由重量)=0.7、C(器械/绳索)=0.4、D=0（只参与进步追踪，不参与人口力量）。**benchmark 只计入 primary category**（跨部位 share 惩罚删除）。coverage 仅作展示字段，永不乘入分数。

### B.3 训练/力量两链路严格分离

高级训练者 deload：Training 55 / Strength 90 合法；新手猛练：Training 80 / Strength 35 合法。UI 两模式各用各的等级词表。

---

## C. Strength Benchmark（体重/性别/动作/1RM/自重处理）

- **锚点数据**：每动作五档阈值（70kg 男性锚），元数据 `BENCHMARK_PROVENANCE = { source: 'Strength Level', sourceSnapshot: '2026-03', sourceType: 'community percentile' }`（spec #28）。
- **性别+体重缩放**（spec #26 fallback 模型）：负荷基准 `v ∝ (bw/70)^b`（男 b=0.92，女 b=0.70）× 女性分档比值曲线 G（upper/lower 分族）；次数基准反比 `∝ (70/bw)^0.4`。该近似按族校准而非每动作独立校准——已在测试中固定多锚点行为，未来升级为每动作体重表（spec #25 优先方案）时只需替换 `STRENGTH_BENCHMARKS` 数据。
- **负荷语义 loadMode**（spec #8/#15）：`barbell_total / dumbbell_per_hand / unilateral / bodyweight / bodyweight_plus_external / machine_stack / cable_stack`。全部经 `resolvePerformanceLoad` 解析：哑铃容量 ×2（PR 显示保持单只）；单臂按"记录组数=单侧功"计数（录入语义写入 UI 说明）；自重类 effectiveLoad = 体重±外部负重。
- **自重模型**（spec #9）：引体/双杠 = 体重+外部负重的有效负荷 kg 基准（自重引体≈74kg→入门~进阶）；俯卧撑/卷腹/健腹轮/悬垂举腿 = 次数基准，山羊挺身改为次数基准，平板支撑 = 秒基准。weight=0 不再失效。
- **1RM 估算**（spec #10/#11）：1 次=实测（高）；2-5 次=Epley/Brzycki 共识中位（高）；6-10 次=共识（中）；11-12 次=Epley 单公式（低，保留）；**>12 次一律不用于力量评分**（不静默截断，仍计容量）。公式差 estimateSpread>6% 降置信。
- **器械**（spec #7）：machine/cable 基准 mode=`machine_relative`，人口含义弱，置信度封顶 60；UI 显示"器械配重受设备差异影响，等级仅供参考"。
- **年龄**（spec #27）：不做年龄修正，UI 明示"基于成年训练者参考标准"。

## D. Confidence System（高/中/低由什么决定）

`confidenceScore ∈ [0,100]`，标签 ≥75 高 / ≥50 中 / 否则低：

```
基础(次数质量): 实测1RM 95 · 2-5次 90 · 6-10次 70 · 11-12次 45
× 基准可靠性:  A 1.0 · B 0.85 · C 0.6 · D 0.2
− 公式分歧:    spread > 6% → ×0.8
× 身体资料:    缺性别 ×0.85 · 缺体重 ×0.85（双缺 ≈ ×0.72）
封顶:          器械基准 ≤ 60 · legacy PR ≤ 45
部位聚合:      = 最佳证据置信度 + min(15, 5×额外A/B证据数)；纯器械证据封顶 60；generic ×0.72 / partial ×0.85
```

**分数与置信度完全解耦**：数据不足降置信度，永不降分数（spec #5/#43，测试断言"新增有效证据置信度不降"）。

## E. Migration（兼容策略）

- `userProfile.prs`（name→weight，无次数）→ 定位为 **legacy fallback**：仅当该 canonical 动作无任何 log 记录时使用；自重类 legacy 值按外部负重解释（负数=辅助，沿用旧语义）；`source='legacy_profile_pr'` 置信度封顶 45（低）。未迁移删除，老用户 PR 无缝可见。
- 历史 WorkoutLog 全量参与：PR 取全部历史最佳 e1RM；进步分用时间窗口区分本期/基线，无需任何数据回填。
- `Exercise.weight` 语义由动作定义的 loadMode 决定，**老记录无需迁移**：杠铃=总负重（不变），哑铃=单只（不变，容量计算侧 ×2），引体=外部负重可为负（不变）。
- 数据导出：容量语义升级（哑铃×2），PR 值保持录入口径；导出测试同步更新。
- 兼容 API 全部保留：`resolveExerciseMuscles / findExerciseStandard / calculateEffectiveLoad / resolveEffectiveExerciseWeight / isPullUpExercise / estimateOneRepMax / calculateStandardizedScore / resolveStrengthAssessment / getNextMilestone / bodyContextFromProfile`（内部改由统一定义驱动）。

## F. Changed Files

| 文件 | 变更 |
|------|------|
| `src/constants/exerciseDefinitions.ts` | **新增**：统一动作定义注册表（canonical id、别名分级匹配、loadMode、benchmarkReliability、有效组刺激系数、maxPlausibleLoad） |
| `src/constants/muscleTaxonomy.ts` | **新增**：肌群分类学叶子模块（SubMuscleGroup、分类别肌群、分肌群周目标、四维权重与曲线），消除循环依赖 |
| `src/constants/muscleCoefficients.ts` | **重写**：瘦身为 re-export 门面 + 刺激系数查询视图；删除两套矛盾映射 |
| `src/constants/strengthStandards.ts` | **重写**：唯一等级定义（初学<入门<进阶<高阶<精英，锚点 5/20/50/80/95）、TRAINING_STATE_TIERS、百分位锚点插值评分、per-exercise 基准表 + provenance |
| `src/utils/strengthAssessment.ts` | **新增**：resolvePerformanceLoad、estimateOneRepMaxDetailed（共识+次数置信+不截断）、checkPlausibility、resolveBodyContext（generic/partial/personalized）、assessExerciseStrength、aggregateCategoryStrength |
| `src/utils/trainingCapacity.ts` | **新增**：V3 四维纯函数（频率/容量/进步/稳定性）与聚合 |
| `src/utils/workoutAnalytics.ts` | **重写**：双链路编排；进步分替代容量比值；强度聚合按可靠性；均衡度仅阻力部位；lagging 三态（not_trained/insufficient_data/lagging）；雷达数据保持原值 |
| `src/utils/dataExport.ts` | 哑铃容量 ×2 语义（`resolveExerciseTonnage`） |
| `src/components/Statistics.tsx` | 训练状态/力量双等级词表、四维指标（频/容/进/稳）、力量评估块（e1RM/依据/置信度）、异常 PR 标记、雷达 Tooltip 显示真实 0 分、标准说明 Modal 重写、generic 评估横幅 |
| `tests/workout-analytics.test.ts` | **重写**：13 组模型不变量与边界测试（见 G） |
| `tests/data-export.test.ts` | 容量断言 4100→5000（哑铃×2 语义） |
| `scripts/verify-example-lifters.ts` | **新增**：三用户示例验证脚本 |

## G. Tests（新增测试与结果）

`tests/workout-analytics.test.ts` 全部通过（`npm test` 合计 805 断言 0 失败）：

1. **Canonicalization**：卧推/杠铃卧推/杠铃平板卧推/bench press → 同一 id；引体/引体向上/pull up/pullup/Pull-Up → 同一 id；哑铃卧推与卧推不合并；别名日志去重为单条 PR。
2. **Schema 一致性**：id 唯一；别名全注册表互斥；基准阈值严格递增；provenance 齐全；硬拉单一来源同时刺激腿+背；RDL 腿部基准腘绳肌主导；卧推总刺激 >1（有效组语义）。
3. **1RM 边界**：reps 1/3/5/8/10/11/12/15/20 → 置信档位与可用性逐项验证；>12 次不截断；1..12 次 e1RM 单调；共识公式带 spread。
4. **锚点与连续性**：阈值处得分=锚点（±1e-6）；Elite≠100；0..300kg 单调；阈值 ±0.1kg 至多跳一档；**全值域 score-tier 与 threshold-tier 一致**（P0 回归守卫）；等级词表 初学<入门<进阶<高阶<精英。
5. **重量单调性**：同次数加重分数不降。
6. **自重语义**：引体 -30/-15/0/+10/+30 严格单调；俯卧撑 weight=0 产生有效分数且随次数增加；双杠 0/+10/+30 单调；平板支撑秒基准。
7. **性别/体重**：女 55kg 阈值全面低于男 70kg；同绝对重量轻体重者不低于重者；男女均无 tier 反转；generic/partial/personalized 三态；体重钳制。
8. **异常值**：卧推 800kg → 标记 excludeFromScoring 且不改变部位力量分（日志保留可见）；+43% 个人跳变 → suspectedOutlier 标记但不排除（保护新手进步）。
9. **分数↔置信度分离**：单动作部位分=动作分（无 coverage 折损）；新增有效证据置信度不降；纯器械证据置信度封顶非 high。
10. **训练容量 V3**：A(月练1次)<30；B(周2次)>A 且频率≈80；C(突击一周) 稳定性与总分均低于 B；D(e1RM 提升) 进步分高于持平；E(轻重量加次数) 进步分不被误判；无基线进步=50；频率曲线无 0→25 跳变；容量分段封顶；训练等级词表与力量等级隔离（90 分→训练充足，永不"精英"）。
11. **里程碑与兼容 API**：下一档位/标签正确；未知动作回落 Others。
12. **有氧回归**：五维模型与卡路里目标不变；Cardio 永不产生力量分。
13. **端到端三用户**（见 H）。

## H. Example（三用户模拟验证）

### 用户1 · 70kg 男性：卧推 80×8、深蹲 100×5、硬拉 120×5

| 动作 | e1RM | 力量分 | 等级 | 置信度 |
|------|------|--------|------|--------|
| 杠铃平板卧推 | 100.3kg | 68 | 进阶 Intermediate | 中（8 次组估算） |
| 杠铃深蹲 | 114.6kg | 49 | 入门 Novice | 高（5 次组） |
| 传统硬拉 | 137.5kg | 50 | 进阶 Intermediate | 高（5 次组） |

部位力量：胸 68 进阶 / 背 50 进阶 / 腿 49 入门。训练状态 15-20 "建立习惯"（单次打卡）。

**人工检查**：✅ 100kg 卧推（1.43× 体重）在社区数据中确为进阶中位附近；深蹲 114.6 距进阶线 116 一步之遥判入门，与 Strength Level 70kg 男性深蹲进阶≈115kg 一致；练得少（28 天 1 次）训练状态低但力量分不受影响——两链路分离正确。

### 用户2 · 55kg 女性：卧推 40×5、深蹲 65×6、硬拉 80×5

| 动作 | e1RM | 力量分 | 等级 | 置信度 |
|------|------|--------|------|--------|
| 杠铃平板卧推 | 45.8kg | 52 | 进阶 | 高 |
| 杠铃深蹲 | 76.7kg | 61 | 进阶 | 中（6 次组） |
| 传统硬拉 | 91.7kg | 63 | 进阶 | 高 |

**人工检查**：✅ 女性 55kg 三大项 e1RM ≈ 45/77/92，均落在社区女性进阶档（SL 女 55kg：卧推≈44、深蹲≈72、硬拉≈86 附近），女用 G 曲线未产生等级反转；"普通健身一年多的女性训练者"被判进阶符合直觉，无旧模型的高估失真。

### 用户3 · 74kg 男性：引体 自重×10、+10kg×6

| 动作 | 记录 | e1RM | 力量分 | 等级 | 置信度 |
|------|------|------|--------|------|--------|
| 引体向上 | 84kg 总负荷（74+10） | 99.2kg | 85 | 高阶 Advanced | 中 |

部位力量：背 85 高阶；其余部位 0（真实 0，非伪造）。训练状态：背 22 建立习惯。

**人工检查**：✅ 74kg 体重完成 10 个自重引体 + 6 个负重 10kg，社区数据中确为高阶水平；自重+负重有效负荷语义正确（84kg 显示）；只练背的拥护者其它部位显示真实 0 而非视觉假值。

### 四个产品问题最终各得其所

- **我最近练得怎么样？** → 训练能力指数（频率/有效容量/进步/稳定性四维，训练状态等级词表）
- **我现在有多强？** → 极限力量（相对力量指数 + 初学~精英五档）
- **我有没有持续进步？** → 进步分（e1RM 同口径对比，容量增长不再冒充力量进步）
- **系统有多大把握？** → 高/中/低置信度（次数质量 × 基准可靠性 × 身体资料完整度 × 器械/legacy 封顶）

---

*报告与实现同步于 2026-10-07；基准快照 2026-03，未来重新校准只需更新 `STRENGTH_BENCHMARKS` 与 `BENCHMARK_PROVENANCE`。*
