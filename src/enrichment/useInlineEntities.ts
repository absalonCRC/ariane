import { useEffect, useRef, useState } from 'react';
import { native, request } from '../app/client';
import type { Workspace } from '../app/useWorkspace';
import type { Source } from '../app/types';
import type { EntityBatch, SelectedEntity } from './entityTypes';
import { rebaseEntities } from './entityBatches';

export function useInlineEntities(
  workspace: Workspace,
  memoryResult: unknown,
  analysisError = '',
  analysisRevision = 0,
) {
  const { p, doc } = workspace;
  const [batches, setBatches] = useState<EntityBatch[]>([]);
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const latest = useRef(workspace);
  latest.current = workspace;
  const inFlight = useRef(false);
  const fetched = useRef(new Map<string, string>());
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
    fetched.current.clear();
    setBatches([]);
    setSelected(null);
    setError('');
  }, [p?.path]);
  useEffect(() => {
    if (doc.status !== 'saved' || !doc.settings.enrichment) {
      setSelected(null);
      if (!doc.settings.enrichment) setBatches([]);
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
          const active = workspace.editor?.current?.context()?.section ?? scenes[0]?.id;
          const stamp = `${section.revision}:${workspace.sourceVersion}:${workspace.enrichmentVersion}:${refresh}:${analysisRevision}:${section.id === active ? JSON.stringify(memoryResult) : ''}`;
          if (fetched.current.get(section.id) === stamp) continue;
          const value = await request<
            Omit<EntityBatch, 'section' | 'revision'> & { created?: boolean }
          >('inlineEntities', {
            projectPath: p.path,
            section: section.id,
            revision: section.revision,
            autoCreate: true,
          });
          if (!alive || latest.current.p?.path !== p.path) return;
          if (value.created) workspace.setSourceVersion((v) => v + 1);
          if (value.text === section.text) {
            values.push({
              ...value,
              section: section.id,
              revision: section.revision,
              outline: section.outline,
            });
            fetched.current.set(section.id, stamp);
          }
        }
        setBatches((old) => [
          ...old.filter((batch) => !values.some((v) => v.section === batch.section)),
          ...values.map((value) => {
            const previous = old.find((b) => b.section === value.section);
            const section = scenes.find((s) => s.id === value.section);
            const retained = previous && section ? rebaseEntities(previous, section).mentions : [];
            return {
              ...value,
              mentions: [
                ...value.mentions,
                ...retained.filter(
                  (m) => !value.mentions.some((n) => m.from < n.to && m.to > n.from),
                ),
              ],
            };
          }),
        ]);
        setError('');
      } catch (e) {
        if (alive) {
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
    workspace.enrichmentVersion,
    memoryResult,
    analysisRevision,
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
  async function choose(source: string) {
    if (!selected || !p || busy || doc.status !== 'saved') return;
    const path = p.path;
    setBusy(true);
    setError('');
    try {
      const value = await request<Source>('resolveDetectedEntity', {
        projectPath: path,
        section: selected.section,
        revision: selected.revision,
        from: selected.from,
        to: selected.to,
        source,
      });
      if (latest.current.p?.path !== path) return;
      setSelected(null);
      setRefresh((v) => v + 1);
      workspace.setReader(value);
      workspace.setSourceVersion((v) => v + 1);
    } catch (e) {
      if (latest.current.p?.path === path) setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!selected || !p || busy || doc.status !== 'saved') return;
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
    batches: batches.flatMap((batch) => {
      const section = workspace.scenes.find((s) => s.id === batch.section);
      return section ? [rebaseEntities(batch, section)] : [];
    }),
    selected,
    busy,
    error: error || analysisError,
    create,
    choose,
    open: openSource,
    close: () => setSelected(null),
  };
}
export type InlineEntitiesController = ReturnType<typeof useInlineEntities>;
