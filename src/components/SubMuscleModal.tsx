import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutCategory } from '../types';
import { CategoryScoreDetail } from '../utils/workoutAnalytics';
import { CATEGORY_META } from '../constants/workoutPresets';
import { getExerciseStimulusTable } from '../constants/muscleCoefficients';

interface SubMuscleModalProps {
  category: WorkoutCategory | null;
  detail: CategoryScoreDetail | null;
  onClose: () => void;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高置信度',
  medium: '中置信度',
  low: '低置信度',
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-amber-100 text-amber-900',
};

export default function SubMuscleModal({ category, detail, onClose }: SubMuscleModalProps) {
  if (!category || !detail) return null;

  const categoryExercises = getExerciseStimulusTable().filter(
    (entry) => entry.primaryCategory === category
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border-4 border-ink p-4 sm:p-5 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="flex items-center justify-between pb-3 border-b-2 border-ink mb-3.5">
          <div className="flex items-center gap-2">
            <div className="bg-neon p-1.5 border-2 border-ink font-black text-sm">
              {CATEGORY_META[category].iconLabel}
            </div>
            <div>
              <h4 className="font-black text-ink text-base uppercase flex items-center gap-1.5">
                {detail.zh}训练深度解析
                <span className={`text-[9px] font-black px-1.5 py-0.2 border border-ink ${detail.tier.badgeBg} ${detail.tier.badgeText}`}>
                  {detail.tier.zh}
                </span>
              </h4>
              <p className="text-[10px] sm:text-[11px] text-ink/60 font-bold">
                {category === WorkoutCategory.Cardio ? (
                  <>28天有氧评分: <strong className="text-ink">{detail.cardioScore ?? detail.trainingScore} 分</strong></>
                ) : (
                  <>28天训练状态: <strong className="text-ink">{detail.trainingScore} 分</strong> · 相对力量: {detail.strengthAssessment ? `${detail.strengthScore} 分` : '无数据'}{detail.strengthConfidence ? ` · ${CONFIDENCE_LABEL[detail.strengthConfidence]}` : ''}</>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-black text-ink p-1 hover:bg-paper border-2 border-transparent hover:border-ink cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {category === WorkoutCategory.Cardio ? (
          <div className="space-y-3.5 text-xs font-bold text-ink">
            <div className="bg-paper p-3 border-2 border-ink space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black">28天有氧消耗目标</span>
                <span className="font-black text-neon bg-ink px-2 py-0.5 text-xs">
                  {detail.cardioCalories?.actual || 0} / {detail.cardioCalories?.target || 2000} kcal
                </span>
              </div>
              <div className="w-full h-3 bg-white border-2 border-ink overflow-hidden">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${Math.min(100, detail.cardioCalories?.completionRate || 0)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink/70">
                <span>完成度: {detail.cardioCalories?.completionRate || 0}%</span>
                <span>周均训练: {detail.weeklyWorkouts || 0} 次/周</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-white border border-ink p-2">频率 {detail.cardioMetrics?.frequencyScore || 0}</div>
              <div className="bg-white border border-ink p-2">时间 {detail.cardioMetrics?.durationScore || 0}</div>
              <div className="bg-white border border-ink p-2">强度 {detail.cardioMetrics?.intensityScore || 0}</div>
              <div className="bg-white border border-ink p-2">运动量 {detail.cardioMetrics?.volumeScore || 0}</div>
              <div className="bg-white border border-ink p-2">持续性 {detail.cardioMetrics?.consistencyScore || 0}</div>
              <div className="bg-white border border-ink p-2">有效时间 {detail.cardioMetrics?.effectiveMinutes || 0} min</div>
            </div>

            <p className="text-ink/80 text-[11px] leading-relaxed">
              有氧评分由频率、有效时间、MET 强度、加权运动量和四周持续性共同构成；卡路里仅作为消耗统计与目标完成度，不直接决定有氧能力分。
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 text-xs font-bold text-ink">
            {/* Strength assessment block */}
            {detail.strengthAssessment ? (
              <div className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-ink">⚡️ 极限力量评估</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.2 border border-ink ${detail.strengthAssessment.tier.badgeBg} ${detail.strengthAssessment.tier.badgeText}`}>
                    {detail.strengthAssessment.tier.zh}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-2xl font-black italic leading-none">
                    {detail.strengthAssessment.score}
                    <span className="text-[10px] text-ink/60 not-italic ml-1">相对力量指数</span>
                  </div>
                  <span className={`text-[9px] font-black px-1.5 py-0.2 border border-ink/40 shrink-0 ${CONFIDENCE_STYLES[detail.strengthAssessment.confidence]}`}>
                    置信度：{CONFIDENCE_LABEL[detail.strengthAssessment.confidence]}
                  </span>
                </div>
                {(() => {
                  const evidence = [
                    ...detail.strengthAssessment!.primaryEvidence,
                    ...detail.strengthAssessment!.secondaryEvidence,
                  ].slice(0, 3);
                  if (evidence.length === 0) return null;
                  return (
                    <div className="space-y-1">
                      <p className="text-[10px] text-ink/60 font-bold">主要依据：</p>
                      {evidence.map((item) => (
                        <div key={item.exerciseId} className="flex items-center justify-between bg-white px-2 py-1 border border-ink/30 text-[10px]">
                          <span className="font-black text-ink truncate mr-1">{item.exerciseName}</span>
                          <span className="text-ink/70 shrink-0 tabular-nums">
                            e1RM ≈ {Number(item.assessment.benchmarkValue.toFixed(1))}
                            {item.assessment.unit === 'kg' ? 'kg' : item.assessment.unit === 'sec' ? 's' : ' 次'}
                            {item.assessment.repRange && item.assessment.repRange > 1 && item.assessment.unit === 'kg' ? ` (${item.assessment.repRange}RM组)` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <p className="text-[10px] text-ink/60 leading-relaxed">
                  {detail.strengthAssessment.assessmentMode === 'personalized'
                    ? '基于你的性别与体重个性化基准。'
                    : detail.strengthAssessment.assessmentMode === 'partial'
                    ? '身体资料不完整，按参考值估算，置信度已降低。'
                    : '未填写身体资料，按男 70kg 通用参考标准估算。'}
                  {detail.strengthAssessment.machineOnly && ' 该部位仅有器械/绳索动作证据，器械配重受设备差异影响，等级仅供参考。'}
                </p>
              </div>
            ) : (
              <div className="bg-paper p-2.5 border-2 border-ink text-[11px] text-ink/70">
                暂无可靠的极限力量证据（含基准动作的训练记录），完成含杠铃/哑铃等标准动作的打卡后自动评估。
              </div>
            )}

            {/* Top Formula Hint */}
            <div className="bg-paper p-2.5 border-2 border-ink text-[11px] text-ink/80">
              <p className="font-black text-ink mb-0.5">📐 训练状态评分法则（近28天）：</p>
              <p>部位得分 = 频率分 × 25% + 有效容量分 × 30% + 进步分 × 25% + 稳定性 × 20%</p>
            </div>

            {/* Sub-muscles breakdown */}
            <div className="space-y-2">
              <h5 className="font-black text-ink text-xs uppercase flex items-center justify-between">
                <span>各子肌群训练状态明细</span>
                <span className="text-[10px] text-ink/50 font-normal">加权汇总构成总分</span>
              </h5>

              {(detail.subMuscleScores || []).map((sm) => (
                <div key={sm.subMuscle} className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-sm text-ink">{sm.zh}</span>
                      <span className="text-[9px] bg-white px-1.5 py-0.2 border border-ink/40 text-ink/70 font-black">
                        权重 {Math.round(sm.weight * 100)}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-base italic text-ink">{sm.score}</span>
                      <span className="text-[10px] text-ink/60 not-italic ml-0.5">分</span>
                    </div>
                  </div>

                  {/* Four sub metrics */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5 text-[9px] sm:text-[10px]">
                    <div className="bg-white p-1.5 border border-ink/30 text-center">
                      <div className="text-ink/60 font-bold">频率 25%</div>
                      <div className="font-black text-ink mt-0.5">{sm.frequencyScore}分</div>
                      <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">{sm.weeklyFrequency}次/周</div>
                    </div>
                    <div className="bg-white p-1.5 border border-ink/30 text-center">
                      <div className="text-ink/60 font-bold">容量 30%</div>
                      <div className="font-black text-ink mt-0.5">{sm.volumeScore}分</div>
                      <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">{sm.weeklyEffectiveSets}/{sm.targetSets.target}组/周</div>
                    </div>
                    <div className="bg-white p-1.5 border border-ink/30 text-center">
                      <div className="text-ink/60 font-bold">进步 25%</div>
                      <div className="font-black text-ink mt-0.5">{sm.progressionScore}分</div>
                      <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">{sm.hasProgressionBaseline ? '对比上期' : '数据不足'}</div>
                    </div>
                    <div className="bg-white p-1.5 border border-ink/30 text-center">
                      <div className="text-ink/60 font-bold">稳定 20%</div>
                      <div className="font-black text-ink mt-0.5">{sm.consistencyScore}分</div>
                      <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">周间分布</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Representative Exercises and effective-set stimulus coefficients */}
            {categoryExercises.length > 0 && (
              <div className="border-t-2 border-ink pt-2.5 space-y-1.5">
                <h5 className="font-black text-ink text-xs uppercase">
                  该部位代表动作与有效组刺激系数
                </h5>
                <p className="text-[10px] text-ink/50 font-bold">
                  系数为有效组折算（主肌群 1.0，次要肌群按贡献折算），复合动作可同时刺激多个肌群，总和可大于 1。
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {categoryExercises.slice(0, 8).map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between bg-white p-2 border border-ink/40 text-[11px]">
                      <span className="font-black text-ink truncate mr-2">{ex.name}</span>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        {Object.entries(ex.subMuscles).map(([smKey, ratio]) => (
                          <span key={smKey} className="bg-paper px-1.5 py-0.2 border border-ink/30 text-[9px] font-black">
                            {smKey}: {(ratio || 0).toFixed(1)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3.5 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs cursor-pointer hover:bg-black/80 transition-colors"
        >
          返回图谱
        </button>
      </motion.div>
    </div>
  );
}
