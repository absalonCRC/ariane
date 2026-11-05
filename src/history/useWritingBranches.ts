import { useEffect, useRef, useState } from 'react';
import { request } from '../platform/client';
import type { HistoryState } from '../contracts/history';
import type { Project } from '../contracts/project';

export function useWritingBranches(p: {
  path: string | null;
  generation: number;
  checkpoint: () => Promise<void>;
  onChanged: (project: Project) => void;
  onError: (error: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<{ path: string; state: HistoryState } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const context = useRef({ path: p.path, generation: p.generation });
  context.current = { path: p.path, generation: p.generation };
  useEffect(() => {
    if (!p.path) return;
    let alive = true;
    const path = p.path;
    void request('historyState', { projectPath: path })
      .then((state) => {
        if (alive) setLoaded({ path, state });
      })
      .catch((error) => {
        if (alive) p.onError(error);
      });
    return () => {
      alive = false;
    };
  }, [p.path, p.generation, p.onError]);
  const state = loaded?.path === p.path ? loaded.state : null;
  async function switchBranch(id: string) {
    if (!p.path || !state || id === state.activeBranch || busyRef.current) return;
    const { path, generation } = context.current;
    const current = () =>
      context.current.path === path && context.current.generation === generation;
    busyRef.current = true;
    setBusy(true);
    try {
      await p.checkpoint();
      if (!current()) return;
      const project = await request('switchBranch', { projectPath: p.path, id });
      if (!current()) return;
      setLoaded({ path: p.path, state: { ...state, activeBranch: id } });
      p.onChanged(project);
    } catch (error) {
      if (current()) p.onError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return { state, busy, switchBranch };
}
