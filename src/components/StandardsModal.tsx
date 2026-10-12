import { useStatisticsDialog } from './useStatisticsDialog';
import React, { useState } from 'react';
import { Scale, X } from 'lucide-react';
import { motion } from 'motion/react';
import { StrengthBodyContext } from '../types';
import {
  STRENGTH_TIERS,
  BENCHMARK_PROVENANCE,
} from '../constants/strengthStandards';
import { getBenchmarkThresholdsForDisplay } from '../utils/workoutAnalytics';

interface StandardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bodyContext: StrengthBodyContext | null;
}

const STANDARDS_TABLE_EXERCISES = ['杠铃平板卧推', '坐姿哑铃推举', '高位下拉', '传统硬拉', '杠铃深蹲'];

export default function StandardsModal({ isOpen, onClose, bodyContext }: StandardsModalProps) {
  const [modalTab, setModalTab] = useState<'rules' | 'tiers'>('rules');
  const [standardsTableMode, setStandardsTableMode] = useState<'personalized' | 'anchor'>('personalized');

  useStatisticsDialog(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="statistics-standards-title"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border-4 border-ink p-4 sm:p-5 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-ink mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-neon p-1 border-2 border-ink">
              <Scale size={16} className="text-ink" />
            </div>
            <h4 className="font-black text-ink text-sm sm:text-base uppercase">六维量化规则与进阶标准</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="font-black text-ink min-h-11 min-w-11 shrink-0 p-1 hover:bg-paper border-2 border-transparent hover:border-ink cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex bg-paper p-1 border-2 border-ink mb-3.5 gap-1">
          <button
            type="button"
            onClick={() => setModalTab('rules')}
            className={`flex-1 py-1.5 text-xs font-black transition-colors cursor-pointer ${
              modalTab === 'rules'
                ? 'bg-ink text-neon'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            28天训练能力算法
          </button>
          <button
            type="button"
            onClick={() => setModalTab('tiers')}
            className={`flex-1 py-1.5 text-xs font-black transition-colors cursor-pointer ${
              modalTab === 'tiers'
                ? 'bg-ink text-neon'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            5档极限力量标准
          </button>
        </div>

        {modalTab === 'rules' ? (
          <div className="space-y-3 text-xs font-bold text-ink">
            <div className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1">
              <p className="font-black text-xs sm:text-sm text-ink">🎯 两套评分，回答两个不同的问题</p>
              <p className="text-ink/80 leading-relaxed text-[11px]">
                <strong>训练能力指数</strong>（近28天训练状态）回答&ldquo;我最近练得怎么样&rdquo;；
                <strong>极限力量水平</strong>回答&ldquo;我现在有多强&rdquo;。两者数学含义不同，互不混算：练得多不等于力量大，减量期力量分也不会下降。
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                <span className="font-black text-ink">训练能力指数 = 频率 25% + 有效容量 30% + 进步 25% + 稳定性 20%</span>
                <p className="text-[11px] text-ink/70">
                  频率：每周训练 0.5/1/2/3 次对应 20/45/80/100 分，连续插值无跳变。
                </p>
                <p className="text-[11px] text-ink/70">
                  有效容量：按动作的肌群刺激系数折算有效组数，对照每个肌群自身的目标区间（如中胸约 12 组/周）计分，超过上限不再加分。
                </p>
                <p className="text-[11px] text-ink/70">
                  进步分沿用周期最佳 e1RM 对比；是否持续提高另看多日样本与估算可靠性。无上期记录时采用中性分，不代表已经确认进步。
                </p>
                <p className="text-[11px] text-ink/70">
                  稳定性：统计近 4 周每周有效组数，一周突击练完一个月的量，得分会显著低于平均分布。
                </p>
              </div>

              <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                <span className="font-black text-ink">极限力量水平 = 基准动作 e1RM → 相对力量指数</span>
                <p className="text-[11px] text-ink/70">
                  1RM 采用 Epley/Brzycki 共识公式计算；1-5 次的组估算最可靠，11-12 次置信度低，超过 12 次的组不用于力量评分（仍计入训练容量）。
                </p>
                <p className="text-[11px] text-ink/70">
                  体重与性别会影响基准：未填写时使用通用参考标准（男 70kg）并标注为估算。器械/绳索动作因配重受设备差异影响，力量等级仅供参考。
                </p>
              </div>

              <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                <span className="font-black text-ink">4. 有氧维度</span>
                <p className="text-[11px] text-ink/70">
                  有氧评分由频率、时间、MET 强度、加权运动量和四周持续性共同组成；2,000 kcal 仅作为独立的消耗目标完成度。
                </p>
              </div>

              <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                <span className="font-black text-ink">5. 数据说明</span>
                <p className="text-[11px] text-ink/70">
                  力量水平基于成年训练者参考标准，未进行年龄修正。人口基准来自社区训练数据（{BENCHMARK_PROVENANCE.source} · {BENCHMARK_PROVENANCE.sourceSnapshot} 快照），仅作参考，不是医学诊断或竞技认证。分数为相对力量指数，不代表精确的人群百分位。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs font-bold text-ink">
            <div className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1">
              <p className="font-black text-xs sm:text-sm text-ink">⚡️ 五档力量参考标准</p>
              <p className="text-ink/80 leading-relaxed text-[11px]">
                档位锚点来自社区力量数据的人群分位（初学≈5%、入门≈20%、进阶≈50%、高阶≈80%、精英≈95%），按<strong>你的性别与体重</strong>缩放（基准锚点：{BENCHMARK_PROVENANCE.source} {BENCHMARK_PROVENANCE.sourceSnapshot} 男性 70kg 数据，幂函数缩放到个人）。未填写身体数据时按男 70kg 通用参考标准估算。
              </p>
            </div>

            <div className="space-y-1.5">
              {Object.values(STRENGTH_TIERS).map((t) => (
                <div key={t.key} className="p-2 border-2 border-ink bg-paper flex items-start gap-2">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 border border-ink shrink-0 ${t.badgeBg} ${t.badgeText}`}>
                    {t.zh} ({t.anchorScore}分)
                  </span>
                  <span className="text-ink/80 text-[10px] sm:text-[11px] leading-snug">{t.description}</span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-ink pt-2.5">
              <div className="flex items-center justify-between mb-2 gap-2">
                <h5 className="font-black text-ink text-xs uppercase">代表动作各档位参考对照</h5>
                <div className="flex bg-paper border-2 border-ink p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setStandardsTableMode('personalized')}
                    className={`px-1.5 py-0.5 text-[9px] font-black cursor-pointer transition-colors ${
                      standardsTableMode === 'personalized' ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    我的标准
                  </button>
                  <button
                    type="button"
                    onClick={() => setStandardsTableMode('anchor')}
                    className={`px-1.5 py-0.5 text-[9px] font-black cursor-pointer transition-colors ${
                      standardsTableMode === 'anchor' ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    男70kg参考
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-ink/60 mb-1.5 font-bold">
                {standardsTableMode === 'personalized'
                  ? bodyContext
                    ? `💡 当前展示：${bodyContext.sex === 'female' ? '女性' : '男性'} ${bodyContext.bodyweightKg}kg 专属力量阈值`
                    : '💡 当前展示：暂未设置身体数据，默认采用男 70kg 通用参考标准'
                  : '💡 当前展示：' + BENCHMARK_PROVENANCE.source + ' 70kg 男性锚点对照表'}
              </p>

              <div className="overflow-x-auto border-2 border-ink">
                <table className="w-full text-[9px] sm:text-[10px] text-left">
                  <thead className="bg-ink text-white font-black">
                    <tr>
                      <th className="p-1 sm:p-1.5">动作</th>
                      <th className="p-1 sm:p-1.5">初学</th>
                      <th className="p-1 sm:p-1.5">入门</th>
                      <th className="p-1 sm:p-1.5">进阶</th>
                      <th className="p-1 sm:p-1.5">高阶</th>
                      <th className="p-1 sm:p-1.5">精英</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/20">
                    {STANDARDS_TABLE_EXERCISES.map((name) => {
                      const table = getBenchmarkThresholdsForDisplay(
                        name,
                        standardsTableMode === 'personalized' ? bodyContext : null
                      );
                      if (!table) return null;
                      return (
                        <tr key={table.name}>
                          <td className="p-1 sm:p-1.5 font-black">{table.name}</td>
                          {table.thresholds.map((t, idx) => (
                            <td key={idx} className="p-1 sm:p-1.5">
                              {t}
                              {table.unit}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3.5 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs cursor-pointer hover:bg-black/80 transition-colors"
        >
          我知道了
        </button>
      </motion.div>
    </div>
  );
}
