import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { isTopBackHandler, pushBackHandler } from '../backStack';
import type { WorkoutLog } from '../types';
import { getWorkoutLogDetail } from '../utils/workoutDetail';
import LogCard from './LogCard';

interface Props {
  logId: string;
  accountId: string;
  onClose: () => void;
}
type Result = { logId: string; accountId: string } & (
  | { status: 'loading' | 'missing' | 'error' }
  | { status: 'ready'; log: WorkoutLog }
);

export default function WorkoutDetailModal({ logId, accountId, onClose }: Props) {
  const [result, setResult] = useState<Result>({ logId, accountId, status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    request.current?.abort();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setResult({ logId, accountId, status: 'loading' });
    void getWorkoutLogDetail(logId, { signal: controller.signal }).then(log => {
      if (!controller.signal.aborted) setResult(log
        ? { logId, accountId, status: 'ready', log }
        : { logId, accountId, status: 'missing' });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ logId, accountId, status: 'error' });
    });
    return () => { controller.abort(); };
  }, [logId, accountId, attempt]);

  const closeRef = useRef(close);
  closeRef.current = close;
  // Keep stack identity/order stable even when onClose changes during a render.
  const backHandler = useCallback(() => { closeRef.current(); return true; }, []);
  useEffect(() => pushBackHandler(backHandler), [backHandler]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      // Decide at window capture, before a nested document Escape handler can
      // close/unregister itself. Never cancel a nested native dialog's Escape:
      // its cancel handler owns the edit busy guard.
      if (event.key === 'Escape' && !event.defaultPrevented && isTopBackHandler(backHandler)) {
        event.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', escape, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [backHandler]);

  // Never render the previous identity's data even before effect cleanup runs.
  const visible = result.logId === logId && result.accountId === accountId ? result : null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="workout-detail-title" className="bg-paper border-2 border-ink w-full max-w-lg max-h-[85dvh] flex flex-col shadow-[4px_4px_0px_0px_#000]">
        <header className="bg-neon border-b-2 border-ink p-3 flex items-center justify-between">
          <h2 id="workout-detail-title" className="font-black">训练详情</h2>
          <button ref={closeButton} type="button" aria-label="关闭训练详情" onClick={close} className="min-w-11 min-h-11 flex items-center justify-center border-2 border-ink bg-white"><X size={20} /></button>
        </header>
        <div className="overflow-y-auto overscroll-contain p-3" aria-live="polite">
          {(!visible || visible.status === 'loading') && <p className="py-8 text-center">加载训练详情中…</p>}
          {visible?.status === 'missing' && <p className="py-8 text-center">该训练记录不存在或暂不可访问</p>}
          {visible?.status === 'error' && <div className="py-8 text-center"><p>训练详情加载失败，请重试</p><button type="button" className="btn-neon mt-3 min-h-11" onClick={() => setAttempt(value => value + 1)}>重试</button></div>}
          {visible?.status === 'ready' && <LogCard key={`${accountId}:${logId}`} log={visible.log} onLogUpdated={updated => {
            if (updated?._deleted) setResult({ logId, accountId, status: 'missing' });
          }} />}
        </div>
      </section>
    </div>
  );
}
