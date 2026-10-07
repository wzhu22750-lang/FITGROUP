import { useState } from 'react';
import { Check } from 'lucide-react';
import type { WorkoutLog } from '../../types';
import { describeExercise, DraftExercise, fromRecordedExercise } from '../../utils/workoutDraft';
import WorkoutSheet from './WorkoutSheet';

export default function HistoryPicker({ logs, currentCount, onImport, onClose }: {
  logs: WorkoutLog[]; currentCount: number;
  onImport: (exercises: DraftExercise[], mode: 'append' | 'replace') => void; onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(logs[0]?.id || '');
  const [mode, setMode] = useState<'append' | 'replace'>(currentCount ? 'append' : 'replace');
  const selected = logs.find(log => log.id === selectedId);
  const count = selected?.exercises.length || 0;
  const tooMany = count + (mode === 'append' ? currentCount : 0) > 10;
  return (
    <WorkoutSheet title="沿用一次训练" onClose={onClose} footer={
      <div className="space-y-3">
        {tooMany && <p role="alert" className="text-sm text-red-700">合计超过 10 项，请选择替换或换一次训练。</p>}
        <button type="button" className="btn-neon-lg w-full" disabled={!count || tooMany}
          onClick={() => selected && onImport(selected.exercises.map(fromRecordedExercise), mode)}>
          {mode === 'append' ? '追加' : currentCount ? '确认替换为' : '沿用'} {count} 个动作
        </button>
      </div>
    }>
      <p className="workout-helper mb-4">只复制动作与数据，不复制心得和可见范围。记得按今天的训练调整。</p>
      {currentCount > 0 && (
        <div className="workout-import-mode" role="group" aria-label="导入方式">
          <button type="button" aria-pressed={mode === 'append'} onClick={() => setMode('append')}>追加到当前训练</button>
          <button type="button" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>替换当前 {currentCount} 项</button>
        </div>
      )}
      {currentCount > 0 && mode === 'replace' && <p className="text-sm text-red-700 mb-4">确认后将覆盖当前动作；下方内容就是将要导入的训练。</p>}
      <div className="space-y-3">
        {logs.slice(0, 8).map(log => (
          <button type="button" key={log.id} className="workout-history-item" aria-pressed={selectedId === log.id} onClick={() => setSelectedId(log.id)}>
            <span className="flex items-center justify-between gap-3 mb-2">
              <strong>{new Date(log.timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · {log.exercises.length} 个动作</strong>
              {selectedId === log.id && <Check size={18} className="shrink-0" />}
            </span>
            {log.exercises.map((ex, index) => (
              <span className="block py-1" key={`${ex.id}-${index}`}>
                <span className="block text-sm font-bold">{ex.name}</span>
                <span className="text-xs text-ink/60">{describeExercise(ex)}</span>
              </span>
            ))}
          </button>
        ))}
      </div>
    </WorkoutSheet>
  );
}
