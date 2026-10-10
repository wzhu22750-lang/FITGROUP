import { useRef, useState } from 'react';
import type { WorkoutLog } from '../../types';
import { createEditingDraft, createDraft, decodeDraft, draftStorageKey, WorkoutDraft } from '../../utils/workoutDraft';

const completedDrafts = new Set<string>();

export function useWorkoutDraft(owner: string, editingLog?: WorkoutLog) {
  const [initial] = useState(() => {
    // Editing stays isolated from the user's unfinished new-workout draft.
    if (editingLog) return { draft: createEditingDraft(owner, editingLog), restored: false, warning: '' };
    try {
      const raw = localStorage.getItem(draftStorageKey(owner));
      const restored = decodeDraft(raw, owner);
      if (restored && !completedDrafts.has(restored.id)) return { draft: restored, restored: true, warning: '' };
      return { draft: createDraft(owner), restored: false, warning: raw && !restored ? '旧草稿格式无法读取，请重新记录。' : '' };
    } catch {
      return { draft: createDraft(owner), restored: false, warning: '浏览器不允许保存草稿，离开页面可能丢失内容。' };
    }
  });
  const [draft, setDraft] = useState(initial.draft);
  const draftRef = useRef(draft);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [restored, setRestored] = useState(initial.restored);

  // Persist in the edit event, not a debounce: tab changes/unmounts cannot lose the last edit.
  const commit = (next: WorkoutDraft) => {
    if (next.owner !== owner) throw new Error('草稿账号不匹配');
    const updated = { ...next, updatedAt: Date.now() };
    draftRef.current = updated;
    setDraft(updated);
    if (editingLog) return updated;
    try {
      localStorage.setItem(draftStorageKey(owner), JSON.stringify(updated));
      setStorageWarning('');
    } catch {
      setStorageWarning('草稿暂时无法保存在此设备，请勿刷新或关闭页面。');
    }
    return updated;
  };
  const update = (change: (current: WorkoutDraft) => WorkoutDraft) => {
    if (draftRef.current.pending) return;
    commit(change(draftRef.current));
  };
  const finish = () => {
    if (editingLog) return;
    completedDrafts.add(draftRef.current.id);
    try { localStorage.removeItem(draftStorageKey(owner)); } catch { /* Server success must remain success. */ }
  };
  const reset = () => {
    commit(editingLog ? createEditingDraft(owner, editingLog) : createDraft(owner));
    setRestored(false);
  };
  return { draft, draftRef, update, commit, finish, reset, restored, storageWarning };
}
