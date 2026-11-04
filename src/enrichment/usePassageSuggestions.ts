import { useEffect, useRef, useState } from 'react';
import { request } from '../app/client';
import type { Section, Source, SaveState } from '../app/types';
import type { VisibleText } from '../editor/Editor';
import { passageKey, visiblePassages, type Passage } from './passages';

interface Entry {
  signature: string;
  version: string;
  sources: Source[];
}
export function usePassageSuggestions(
  path: string | undefined,
  sections: Section[],
  viewport: VisibleText | null,
  status: SaveState,
  enabled: boolean,
  depth: number,
  version: string,
  onSources: (sources: Source[]) => void,
  onStatus: (status: 'loading' | 'ready' | 'error') => void,
) {
  const cache = useRef(new Map<string, Entry>());
  const scope = useRef(path);
  if (scope.current !== path) {
    scope.current = path;
    cache.current.clear();
  }
  const blocks = viewport ? visiblePassages(sections, viewport) : [];
  const signature = JSON.stringify(blocks.map((p) => [passageKey(p), p.signature]));
  const [revision, setRevision] = useState(0);
  const latest = useRef(blocks);
  latest.current = blocks;
  const current = blocks
    .map((block) => ({ block, entry: cache.current.get(passageKey(block)) }))
    .filter(
      (v): v is { block: Passage; entry: Entry } =>
        !!v.entry && v.entry.signature === v.block.signature,
    );

  useEffect(() => {
    const values = latest.current.flatMap((p) => {
      const entry = cache.current.get(passageKey(p));
      return entry?.signature === p.signature ? entry.sources : [];
    });
    onSources(enabled ? values : []);
  }, [signature, revision, enabled, path, onSources]);

  useEffect(() => {
    if (!path || !enabled || status !== 'saved') return;
    let alive = true;
    const pending = blocks.filter((p) => {
      const old = cache.current.get(passageKey(p));
      return old?.signature !== p.signature || old.version !== version;
    });
    if (!pending.length) {
      onStatus('ready');
      return;
    }
    onStatus('loading');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          for (const block of pending) {
            const sources = block.text.trim()
              ? await request<Source[]>('suggest', {
                  text: block.text.slice(0, 8000),
                  depth,
                  allowEnd: true,
                  anchor: passageKey(block),
                })
              : [];
            if (!alive || scope.current !== path) return;
            cache.current.set(passageKey(block), { signature: block.signature, version, sources });
            setRevision((n) => n + 1);
          }
          onStatus('ready');
        } catch {
          if (alive) onStatus('error');
        }
      })();
    }, 100);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path, signature, status, enabled, depth, version, onStatus]);
  return current.map(({ block, entry }) => ({ block, sources: entry.sources }));
}
