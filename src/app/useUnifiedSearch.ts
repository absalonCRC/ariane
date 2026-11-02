import { useLocale } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { request } from './client';
import type { Project, Source } from './types';
import { searchManuscript } from './projectSearch';
export function useUnifiedSearch(project: Project | null, query: string, version = 0) {
  const locale = useLocale();
  const term = query.trim();
  const manuscript = useMemo(
    () => searchManuscript(project?.sections ?? [], term),
    [project?.sections, term, locale],
  );
  const [result, setResult] = useState<{
    path: string;
    query: string;
    sources: Source[];
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!project || !term) return;
    let alive = true;
    setResult(null);
    const timer = setTimeout(() => {
      void request<Source[]>('search', { query: term })
        .then((sources) => {
          if (alive) setResult({ path: project.path, query: term, sources, error: '' });
        })
        .catch((error) => {
          if (alive)
            setResult({ path: project.path, query: term, sources: [], error: String(error) });
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [project?.path, term, version]);
  const current = result?.path === project?.path && result?.query === term ? result : null;
  return {
    manuscript,
    sources: current?.sources ?? [],
    error: current?.error ?? '',
    busy: !!term && !current,
  };
}
