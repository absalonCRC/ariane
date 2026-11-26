import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '../../contracts/project';
import { t } from '../../i18n';
import { descendants } from '../tree';

interface Preview {
  id: string;
  x: number;
  y: number;
  width: number;
}
export function useBinderPreview(project: string, view: string, busy = false) {
  const [current, setCurrent] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(() => {
    clear();
    setCurrent(null);
  }, [clear]);
  useEffect(() => {
    close();
    return clear;
  }, [project, view, busy, close, clear]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (current || timer.current !== null)) {
        event.stopPropagation();
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', close);
    };
  }, [current, close]);
  function show(id: string, trigger: HTMLElement) {
    clear();
    if (busy || !trigger.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const edge = trigger.closest('aside')?.getBoundingClientRect().right ?? rect.right;
    const width = Math.min(300, window.innerWidth - 20);
    const x = Math.max(10, Math.min(edge, window.innerWidth - width - 10));
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 198));
    setCurrent((old) => (old ? { ...old, id } : { id, x, y, width }));
  }
  return {
    current,
    close,
    clear,
    show,
    enter(id: string, trigger: HTMLElement) {
      clear();
      if (current) show(id, trigger);
      else timer.current = setTimeout(() => show(id, trigger), 420);
    },
    leave() {
      clear();
      if (current) timer.current = setTimeout(close, 140);
    },
  };
}
export function BinderPreview({
  project,
  preview,
}: {
  project: Project;
  preview: ReturnType<typeof useBinderPreview>;
}) {
  const item = preview.current;
  if (!item) return null;
  const section = project.sections.find((s) => s.id === item.id);
  if (!section) return null;
  const scenes =
    section.kind === 'scene'
      ? [section]
      : descendants(project.sections, section.id).filter((s) => !s.trashed && s.kind === 'scene');
  const first = scenes.find((s) => s.text.trim());
  const last = [...scenes].reverse().find((s) => s.text.trim());
  const opening = first?.text.trim().split('\n', 3).join('\n').slice(0, 200) ?? '';
  const ending = last?.text.trim().slice(-240).split('\n').slice(-3).join('\n') ?? '';
  return createPortal(
    <aside
      id="binder-page-preview"
      className="binder-page-preview"
      role="status"
      aria-label={t('Aperçu de la page')}
      style={{ left: item.x, top: item.y, width: item.width }}
      onPointerEnter={preview.clear}
      onPointerLeave={preview.leave}
    >
      <strong>{section.title || t('Sans titre')}</strong>
      <p>{opening || t('Page vide')}</p>
      {ending && ending !== opening && <p>{ending}</p>}
    </aside>,
    document.body,
  );
}
