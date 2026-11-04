import { useEffect, useRef, useState } from 'react';
import { request } from '../platform/client';
import type { Source } from '../contracts/sources';

export function useMarginPins(path: string | undefined, section: string | undefined, version = 0) {
  const scope = `${path ?? ''}\u001f${section ?? ''}`;
  const current = useRef(scope);
  current.current = scope;
  const [value, setValue] = useState<{ scope: string; sources: Source[] }>({ scope, sources: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    const atRevision = revision.current;
    setError('');
    if (path && section)
      void request('marginPins', { projectPath: path, section })
        .then((sources) => {
          if (alive && current.current === scope && atRevision === revision.current)
            setValue({ scope, sources });
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [scope, version]);
  async function update(source: Source | string) {
    if (!path || !section || pending.current) return false;
    revision.current++;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const sources = await request(typeof source === 'string' ? 'unpinSource' : 'pinSource', {
        projectPath: path,
        section,
        id: typeof source === 'string' ? source : source.id,
      });
      if (current.current === scope) setValue({ scope, sources });
      return current.current === scope;
    } catch (e) {
      if (current.current === scope) setError(String(e));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return {
    sources: value.scope === scope ? value.sources : [],
    busy,
    error,
    pin: (source: Source) => update(source),
    remove: (id: string) => update(id),
  };
}
