import { useCallback, useRef, useState } from 'react';

export interface UndoMessage {
  message: string;
  /** Put things back. Leave out for a plain confirmation. */
  undo?: () => void;
  /** It stuck (timed out, or another message replaced it). */
  commit?: () => void;
}

/** One "Removed · Undo" message at a time. A new message commits the previous one. */
export function useUndoToast() {
  const [toast, setToast] = useState<(UndoMessage & { id: number }) | null>(null);
  const current = useRef<(UndoMessage & { id: number }) | null>(null);

  const show = useCallback((m: UndoMessage) => {
    current.current?.commit?.();
    const next = { ...m, id: Date.now() };
    current.current = next;
    setToast(next);
  }, []);
  const undo = useCallback(() => {
    current.current?.undo?.();
    current.current = null;
    setToast(null);
  }, []);
  const expire = useCallback(() => {
    current.current?.commit?.();
    current.current = null;
    setToast(null);
  }, []);

  return { toast, show, undo, expire };
}
