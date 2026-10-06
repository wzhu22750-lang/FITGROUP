import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { pushBackHandler } from '../../backStack';

export default function WorkoutSheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const covered = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      dialog.style.setProperty('--workout-viewport-height', `${height}px`);
      dialog.style.setProperty('--workout-viewport-bottom', `${covered}px`);
    };
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    const removeBack = pushBackHandler(() => { closeRef.current(); return true; });
    return () => {
      removeBack();
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={dialogRef} className="workout-sheet" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="workout-sheet-layout">
        <header className="workout-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} className="workout-icon-button" aria-label={`关闭${title}`}><X size={20} /></button>
        </header>
        <div className="workout-sheet-body">{children}</div>
        {footer && <footer className="workout-sheet-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
