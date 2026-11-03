import { t, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { request } from './client';
import type { Project, Source } from './types';
import {
  ManuscriptSearch,
  emptyManuscript,
  type ManuscriptResult,
  type SearchSection,
} from './projectSearch';
export function useUnifiedSearch(
  project: Project | null,
  query: string,
  version = 0,
  subscribeEdits?: (listener: () => void) => () => void,
) {
  const locale = useLocale();
  const term = query.trim();
  const [manuscript, setManuscript] = useState<ManuscriptResult>(emptyManuscript);
  const [manuscriptBusy, setManuscriptBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const fallback = useRef<ManuscriptSearch | null>(null);
  const known = useRef(new Map<string, SearchSection>());
  const sequence = useRef(0);
  const [editVersion, setEditVersion] = useState(0);
  useEffect(() => {
    if (!term) return;
    return subscribeEdits?.(() => {
      sequence.current++;
      setEditVersion((v) => v + 1);
    });
  }, [!!term, subscribeEdits]);
  useEffect(() => {
    known.current.clear();
    if (typeof Worker === 'undefined') fallback.current = new ManuscriptSearch();
    else {
      const instance = new Worker(new URL('./manuscriptSearch.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<{ id: number; result: ManuscriptResult }>) => {
        if (event.data.id !== sequence.current) return;
        setManuscript(event.data.result);
        setManuscriptBusy(false);
      };
      instance.onerror = () => {
        setManuscriptBusy(false);
      };
    }
    return () => {
      sequence.current++;
      worker.current?.terminate();
      worker.current = null;
      fallback.current = null;
    };
  }, [project?.path]);
  useEffect(() => {
    const id = ++sequence.current;
    if (!term || !project) {
      setManuscript(emptyManuscript());
      setManuscriptBusy(false);
      return;
    }
    setManuscript(emptyManuscript());
    setManuscriptBusy(true);
    const timer = setTimeout(() => {
      const next = new Map<string, SearchSection>();
      const changes: SearchSection[] = [];
      for (const s of project.sections) {
        const old = known.current.get(s.id);
        const section = {
          id: s.id,
          text: s.text,
          title: s.title,
          parent: s.parent,
          position: s.position,
          trashed: s.trashed,
        };
        next.set(s.id, section);
        if (
          !old ||
          Object.keys(section).some(
            (key) => old[key as keyof SearchSection] !== section[key as keyof SearchSection],
          )
        )
          changes.push(section);
      }
      const removed = [...known.current.keys()].filter((key) => !next.has(key));
      known.current = next;
      const labels = { untitled: t('Sans titre'), title: t('Titre du texte ou du dossier') };
      if (worker.current) worker.current.postMessage({ id, changes, removed, query: term, labels });
      else if (fallback.current) {
        fallback.current.sync(changes, removed);
        setManuscript(fallback.current.search(term, labels));
        setManuscriptBusy(false);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [project?.path, project?.sections, term, locale, editVersion]);
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
    busy: manuscriptBusy || (!!term && !current),
  };
}
