import { useEffect, useRef, useState } from 'react';
import { request } from '../platform/client';
import { CaptureDraft } from './draft';
import type { CaptureSelection } from '../contracts/inbox';
export function useCaptureDraft(onError: (e: unknown) => void) {
  const [draft, setDraft] = useState<CaptureDraft | null>(null),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const current = useRef(draft),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    error = useRef(onError);
  error.current = onError;
  current.current = draft;
  const reload = async () => {
    const value = await request('inboxDraft');
    const next = new CaptureDraft(value, request);
    current.current = next;
    setDraft(next);
    setStatus('Enregistré');
  };
  useEffect(() => {
    let disposed = false;
    void request('inboxDraft')
      .then((value) => {
        if (!disposed) {
          const next = new CaptureDraft(value, request);
          current.current = next;
          setDraft(next);
          setStatus('Enregistré');
        }
      })
      .catch((e) => error.current(e));
    return () => {
      disposed = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!current.current) throw Error('Ouverture de la capture en cours. Réessayez.');
    setStatus('Enregistrement…');
    try {
      await current.current.flush();
      if (current.current.uncertainFinish)
        throw Error('La finalisation doit être confirmée avant de reprendre.');
      setStatus('Enregistré');
    } catch (e) {
      setStatus('Enregistrement impossible');
      throw e;
    }
  };
  const change = (text: string, selection: CaptureSelection) => {
    current.current?.edit(text, selection);
    setStatus('Enregistrement…');
    // A fixed timer, rather than a reset-on-every-keystroke debounce, bounds the delay.
    timer.current ??= setTimeout(() => void flush().catch((e) => error.current(e)), 200);
  };
  const finish = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setBusy(true);
    try {
      if (!current.current) return;
      const next = await current.current.finish();
      const buffer = new CaptureDraft(next, request);
      current.current = buffer;
      setDraft(buffer);
      setStatus('Enregistré');
    } catch (e) {
      setStatus('Enregistrement impossible');
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return {
    draft,
    change,
    flush,
    finish,
    reload,
    status,
    busy,
    locked: busy || !!draft?.uncertainFinish,
  };
}
