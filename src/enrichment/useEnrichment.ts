import { useEffect, useRef, useState } from 'react';
import { native, request } from '../app/client';
import type { SaveState } from '../app/types';

export function useEnrichment(
  path: string | undefined,
  enabled: boolean,
  save: SaveState,
  generation: number,
  catalogVersion: number,
  onRefresh: () => void,
) {
  const [error, setError] = useState('');
  const running = useRef(false);
  useEffect(() => {
    setError('');
    if (!native || !path || !enabled || save !== 'saved') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const analyze = async () => {
      if (!alive) return;
      if (running.current) {
        timer = setTimeout(() => void analyze(), 500);
        return;
      }
      running.current = true;
      try {
        const result = await request<{ changed: boolean }>('enrich', { projectPath: path });
        if (alive && result.changed) onRefresh();
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        running.current = false;
      }
    };
    // Saving never waits for enrichment; continued typing cancels this idle window.
    timer = setTimeout(() => void analyze(), 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path, enabled, save, generation, catalogVersion, onRefresh]);
  return error;
}
