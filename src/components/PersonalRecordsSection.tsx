import React, { useState, useMemo } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkoutCategory } from '../types';
import { CategorizedPrItem } from '../utils/workoutAnalytics';
import { CATEGORY_META } from '../constants/workoutPresets';

interface PersonalRecordsSectionProps {
  prs: CategorizedPrItem[];
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

export default function PersonalRecordsSection({ prs }: PersonalRecordsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | 'ALL'>('ALL');

  const filteredPrs = useMemo(() => {
    if (selectedCategory === 'ALL') return prs;
    return prs.filter((p) => p.category === selectedCategory);
  }, [prs, selectedCategory]);

  return (
    <div className="card p-4 sm:p-5 bg-white border-2 border-ink">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between text-left cursor-pointer group gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TrendingUp size={18} className="text-ink shrink-0" />
          <h3 className="font-bold text-ink italic text-sm sm:text-base whitespace-nowrap truncate">
            巅峰档案 <span className="text-xs text-ink/50 font-normal not-italic ml-0.5">/ PR</span>
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black bg-paper px-2 py-0.5 border-2 border-ink text-ink shrink-0 whitespace-nowrap">
            {prs.length} 项纪录
          </span>
          <div className="p-1 bg-paper border-2 border-ink group-hover:bg-neon transition-colors shrink-0">
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-3.5 border-t-2 border-ink/20 mt-3">
              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3.5 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-2.5 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
                    selectedCategory === 'ALL'
                      ? 'bg-neon text-ink'
                      : 'bg-white text-ink/70 hover:bg-paper'
                  }`}
                >
                  全部 ({prs.length})
                </button>
                {Object.values(WorkoutCategory).map((cat) => {
                  const count = prs.filter((p) => p.category === cat).length;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-neon text-ink'
                          : 'bg-white text-ink/70 hover:bg-paper'
                      }`}
                    >
                      {CATEGORY_META[cat].zh} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Records List */}
              <div className="space-y-2">
                {filteredPrs.length > 0 ? (
                  filteredPrs.map((pr) => (
                    <div
                      key={pr.name}
                      className="py-3 border-b border-ink/10 last:border-0 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <span className="font-black text-ink text-xs sm:text-sm tracking-tight truncate" title={pr.name}>
                          {pr.name}
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 bg-white border border-ink/40 text-ink/70 shrink-0 whitespace-nowrap">
                          {CATEGORY_META[pr.category]?.zh || pr.category}
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 border border-ink shrink-0 whitespace-nowrap ${pr.tier.badgeBg} ${pr.tier.badgeText}`}>
                          {pr.tier.zh}
                        </span>
                        {pr.confidence && (
                          <span className={`text-[9px] font-black px-1.5 py-0.2 border border-ink/40 shrink-0 whitespace-nowrap ${CONFIDENCE_STYLES[pr.confidence]}`}>
                            {CONFIDENCE_LABEL[pr.confidence]}
                          </span>
                        )}
                        {pr.excludeFromScoring && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 bg-red-100 text-red-800 border border-red-400 shrink-0 whitespace-nowrap">
                            ⚠ 疑似录入异常，未计入力量分
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-ink font-black text-lg tabular-nums whitespace-nowrap">
                          {pr.weight} {pr.unit.toUpperCase()}
                          {pr.loadMode === 'dumbbell_per_hand' ? <span className="text-[10px] text-ink/50">/只</span> : pr.loadMode === 'unilateral' ? <span className="text-[10px] text-ink/50">/侧</span> : null}
                        </div>
                        {pr.estimated1RM && pr.estimated1RM > 0 && Math.abs(pr.estimated1RM - pr.weight) > 0.05 && (
                          <div className="text-[9px] font-bold text-ink/50 tabular-nums whitespace-nowrap">
                            e1RM ≈ {pr.estimated1RM} {pr.unit.toUpperCase()}
                            {pr.loadMode === 'dumbbell_per_hand' ? '/只' : pr.loadMode === 'unilateral' ? '/侧' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-ink/20">
                    <Award size={22} className="text-ink/20 mx-auto mb-1.5" />
                    <p className="text-ink/30 font-medium text-xs">
                      {selectedCategory === 'ALL' ? '打卡记录重量将自动录入 PR 档案' : '该部位暂无 PR 纪录'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
