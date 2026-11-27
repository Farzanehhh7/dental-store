import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(isOpen: boolean, containerRef: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    const focusFirst = () => {
      if (!container) return;
      const autoTarget = container.querySelector<HTMLElement>('[data-autofocus="true"], input:not([disabled]), button:not([disabled])');
      if (autoTarget) {
        autoTarget.focus();
      } else {
        container.focus();
      }
    };
    const timer = window.setTimeout(focusFirst, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el.getClientRects().length > 0
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      if (prevFocused && typeof prevFocused.focus === 'function' && document.contains(prevFocused)) {
        prevFocused.focus();
      }
    };
  }, [isOpen, containerRef]);
}

export interface AccessibleModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: React.ReactNode;
  containerClassName?: string;
  panelClassName?: string;
  align?: 'center' | 'top' | 'end' | 'start';
}

export function AccessibleModal({
  open,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  children,
  containerClassName,
  panelClassName,
  align = 'center',
}: AccessibleModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  const alignClasses =
    align === 'top'
      ? 'items-start justify-center pt-16 px-4'
      : align === 'end'
      ? 'justify-end'
      : align === 'start'
      ? 'justify-start'
      : 'items-center justify-center p-4';

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex ${alignClasses} ${containerClassName ?? ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative z-10 outline-none ${panelClassName ?? 'bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto'}`}
      >
        {children}
      </div>
    </div>
  );
}
