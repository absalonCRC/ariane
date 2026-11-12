import { useEffect, useRef, useState, useCallback } from 'react';
import { request, native } from '../platform/client';
import type { EntityBatch } from '../contracts/entities';
import type { MemoryEntity } from '../contracts/memory';
import { emptyCatalog } from './model';
import type { EntityOperation, EntityMergeRecord } from '../contracts/entityIdentity';
import type { SavedView } from '../contracts/savedViews';
import type { Source } from '../contracts/sources';
export function useEntityManager(path: string | undefined, version = 0) {
  const [data, setData] = useState({
    path: '',
    catalog: emptyCatalog(),
    sources: [] as Source[],
    batches: [] as EntityBatch[],
    detections: [] as MemoryEntity[],
    owned: [] as string[],
    merges: [] as EntityMergeRecord[],
    views: [] as SavedView[],
    token: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = useRef(path);
  current.current = path;
  const sequence = useRef(0),
    lock = useRef(false);
  const refresh = useCallback(async () => {
    if (!path) return;
    const n = ++sequence.current;
    try {
      const [catalog, vaults, history, views, batches, detections] = await Promise.all([
        request('entityCatalog', { projectPath: path }),
        request('vaults'),
        request('entityMergeHistory', { projectPath: path }),
        request('savedViews', { projectPath: path }),
        native ? request('entityMentions', { projectPath: path }) : Promise.resolve([]),
        native ? request('memoryList', { projectPath: path }) : Promise.resolve([]),
      ]);
      const sources: Source[] = [];
      for (let offset = 0; ; offset += 50) {
        const page = await request('browseSources', { query: '', offset });
        sources.push(...page.items);
        if (offset + page.items.length >= page.total || !page.items.length) break;
        if (current.current !== path || n !== sequence.current) return;
      }
      if (current.current === path && n === sequence.current) {
        setData({
          path,
          catalog,
          sources,
          batches,
          detections,
          owned: vaults.filter((v) => v.owned && v.available).map((v) => v.id),
          merges: history,
          views: views.items,
          token: views.token,
        });
        setError('');
      }
    } catch (e) {
      if (current.current === path && n === sequence.current) setError(String(e));
    }
  }, [path, version]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  const visible: typeof data =
    data.path === path
      ? data
      : {
          path: path ?? '',
          catalog: emptyCatalog(),
          sources: [],
          batches: [],
          detections: [],
          owned: [],
          merges: [],
          views: [],
          token: '',
        };
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const context = path;
    try {
      const result = await action();
      if (context === current.current) await refresh();
      return result;
    } catch (e) {
      if (context === current.current) setError(String(e));
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const apply = (operation: EntityOperation) =>
    run(() =>
      request('entityOperation', {
        projectPath: path!,
        revision: visible.catalog.revision,
        operation,
      }),
    );
  const saveView = (view?: SavedView, remove?: string) =>
    run(() => request('saveView', { projectPath: path!, token: visible.token, view, remove }));
  return { ...visible, busy, error, refresh, apply, run, saveView };
}
export type EntityManagerController = ReturnType<typeof useEntityManager>;
