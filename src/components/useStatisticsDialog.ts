import { useEffect } from 'react';
import { pushBackHandler } from '../backStack';

export function useStatisticsDialog(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const active = document.activeElement as HTMLElement | null;
    const focusDialog = () => document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    const timer = setTimeout(focusDialog, 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const items = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] [tabindex="0"]')].filter(item => !item.hasAttribute('disabled'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    const pop = pushBackHandler(() => { close(); return true; });
    return () => { clearTimeout(timer); document.body.style.overflow = previous; document.removeEventListener('keydown', key); pop(); active?.focus(); };
  }, [open, close]);
}
