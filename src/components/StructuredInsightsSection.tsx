import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DeterministicInsight } from '../utils/progressAnalytics';

interface StructuredInsightsSectionProps {
  insights: DeterministicInsight[];
}

export default function StructuredInsightsSection({ insights }: StructuredInsightsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="card p-4 sm:p-5 bg-paper border-2 border-ink">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between text-left cursor-pointer group gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 bg-ink text-neon border-2 border-ink shrink-0">
            <Sparkles size={15} />
          </div>
          <h3 className="font-bold text-ink text-xs sm:text-sm whitespace-nowrap truncate">
            训练分析与建议 <span className="text-[11px] font-normal text-ink/50">/ 规则引擎</span>
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black bg-white px-2 py-0.5 border-2 border-ink/40 text-ink/80 shrink-0 whitespace-nowrap">
            {insights.length} 项分析
          </span>
          <div className="p-1 bg-white border-2 border-ink group-hover:bg-neon transition-colors shrink-0">
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
            <div className="pt-3.5 space-y-3 text-xs leading-relaxed border-t-2 border-ink/20 mt-3">
              {insights.map((item, index) => {
                const isHighlight = item.level === 'highlight';
                const isSuggestion = item.level === 'suggestion';

                return (
                  <div
                    key={index}
                    className="bg-white p-3 border-2 border-ink space-y-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {/* Header: Type and Observation */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.2 border border-ink shrink-0 ${
                            isHighlight
                              ? 'bg-neon text-ink'
                              : isSuggestion
                              ? 'bg-ink text-neon'
                              : 'bg-paper text-ink'
                          }`}
                        >
                          {isHighlight ? '亮点' : isSuggestion ? '建议' : '观察'}
                        </span>
                        <h4 className="font-black text-ink text-xs sm:text-sm truncate">
                          {item.observation}
                        </h4>
                      </div>
                    </div>

                    {/* 4-Step Breakdown Table/Grid */}
                    <div className="space-y-1.5 pt-1 border-t border-ink/10 text-[11px]">
                      <div>
                        <strong className="text-ink font-black">【证据依据】</strong>
                        <span className="text-ink/80 ml-1">{item.evidence}</span>
                      </div>
                      <div>
                        <strong className="text-ink font-black">【原理解释】</strong>
                        <span className="text-ink/70 ml-1">{item.interpretation}</span>
                      </div>
                      <div className="bg-paper p-2 border border-ink/30 mt-1">
                        <strong className="text-ink font-black">【可选行动】</strong>
                        <span className="text-ink/90 ml-1">{item.action}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
