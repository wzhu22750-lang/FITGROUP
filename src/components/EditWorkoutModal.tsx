import { useState } from 'react';
import { getCurrentUser } from '../api';
import type { WorkoutLog } from '../types';
import { WorkoutSession } from './WorkoutLogger';
import WorkoutSheet from './workout/WorkoutSheet';

interface EditWorkoutModalProps {
  log: WorkoutLog;
  onClose: () => void;
  onSuccess: (updatedLog: Partial<WorkoutLog>) => void;
}

export default function EditWorkoutModal({ log, onClose, onSuccess }: EditWorkoutModalProps) {
  const [busy, setBusy] = useState(false);
  const owner = getCurrentUser()?.uid;
  return (
    <WorkoutSheet title="编辑打卡记录" onClose={() => { if (!busy) onClose(); }}>
      {owner === log.userId ? <WorkoutSession key={`${owner}:${log.id}`} owner={owner} onSuccess={onClose}
        editing={{ log, onBusy: setBusy, onSuccess: updated => { onSuccess(updated); onClose(); } }} />
        : <p role="alert">只能编辑自己的打卡记录。</p>}
    </WorkoutSheet>
  );
}
