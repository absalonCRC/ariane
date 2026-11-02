import { useEffect, useRef, useState } from 'react';
import { native, request } from '../app/client';
import type { Workspace } from '../app/useWorkspace';
import type { Source } from '../app/types';
import type { EntityBatch, SelectedEntity } from './entityTypes';

export function useInlineEntities(workspace: Workspace, memoryResult: unknown, analysisError = '') {
  const { p, doc } = workspace;
  const [batches, setBatches] = useState<EntityBatch[]>([]);
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const latest = useRef(workspace);
  latest.current = workspace;
  const inFlight = useRef(false);
  // Continuous manuscripts may contain hundreds of scenes. Only request the
  // sections intersecting the editor's bounded visible sample.
  let offset = 0;
  const visible = workspace.viewport;
  const scenes = workspace.scenes.filter((scene, index) => {
    const from = offset;
    offset += scene.text.length;
    if (index < workspace.scenes.length - 1 && !scene.text.endsWith('\n\n')) offset += 2;
    return visible
      ? from <= visible.from + visible.text.length && offset >= visible.from
      : index === 0;
  });
  const signature = scenes.map((s) => `${s.id}:${s.revision}`).join('|');
  useEffect(() => {
    setBatches([]);
    setSelected(null);
    setError('');
  }, [p?.path]);
  useEffect(() => {
    if (doc.status !== 'saved' || !doc.settings.enrichment) {
      setSelected(null);
      setBatches([]);
    }
  }, [doc.status, doc.settings.enrichment]);
  useEffect(() => {
    if (!native || !p || doc.status !== 'saved' || !doc.settings.enrichment) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (inFlight.current) {
        timer = setTimeout(() => void run(), 250);
        return;
      }
      inFlight.current = true;
      try {
        const values: EntityBatch[] = [];
        for (const section of scenes) {
          if (!alive) return;
          const value = await request<Omit<EntityBatch, 'section' | 'revision'>>('inlineEntities', {
            projectPath: p.path,
            section: section.id,
            revision: section.revision,
          });
          if (!alive || latest.current.p?.path !== p.path) return;
          if (value.text === section.text)
            values.push({ ...value, section: section.id, revision: section.revision });
        }
        setBatches(values);
        setError('');
      } catch (e) {
        if (alive) {
          setBatches([]);
          setError(String(e));
        }
      } finally {
        inFlight.current = false;
      }
    };
    timer = setTimeout(() => void run(), 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    p?.path,
    signature,
    doc.status,
    doc.generation,
    doc.settings.enrichment,
    workspace.sourceVersion,
    memoryResult,
    refresh,
  ]);
  async function openSource(mention: SelectedEntity) {
    const path = p?.path;
    if (!mention.sourceId) {
      workspace.setCard(null);
      workspace.setReader(null);
      setSelected(mention);
      return;
    }
    try {
      const source = await request<Source>('source', { id: mention.sourceId });
      if (latest.current.p?.path !== path) return;
      workspace.setCard(null);
      workspace.setReader(source);
      setSelected(null);
    } catch (e) {
      if (latest.current.p?.path === path) setError(String(e));
    }
  }
  async function create() {
    if (!selected || !p || busy) return;
    const path = p.path;
    setBusy(true);
    setError('');
    try {
      const source = await request<Source>('createDetectedEntity', {
        projectPath: path,
        section: selected.section,
        revision: selected.revision,
        from: selected.from,
        to: selected.to,
        kind: selected.kind,
      });
      if (latest.current.p?.path !== path) return;
      setSelected(null);
      workspace.setSourceVersion((v) => v + 1);
      setRefresh((v) => v + 1);
      workspace.setCard(null);
      workspace.setReader(source);
    } catch (e) {
      if (latest.current.p?.path === path) setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    batches,
    selected,
    busy,
    error: error || analysisError,
    create,
    open: openSource,
    close: () => setSelected(null),
  };
}
export type InlineEntitiesController = ReturnType<typeof useInlineEntities>;
