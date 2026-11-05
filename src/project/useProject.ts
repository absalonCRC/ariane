import { stageDraft, type SectionDraft } from './draft';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../platform/client';
import { defaultSettings, type Settings } from '../contracts/settings';
import { type Project, type Section, type Outline } from '../contracts/project';
import { type SaveState } from '../app/workspace/types';
import type { SmartTag, TagOperation } from '../contracts/smartTags';
import { nextTagColor } from '../tags/model';
export function useProject(onError: (e: unknown) => void) {
  const [project, setProject] = useState<Project | null>(null);
  const ref = useRef<Project | null>(null);
  const sectionIndex = useRef(new Map<string, Section>());
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const settingsRef = useRef(settings);
  const [status, setStatus] = useState<SaveState>('saved');
  const [versionStatus, setVersionStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [versionRevision, setVersionRevision] = useState(0);
  const activation = useRef(0);
  const [generation, setGeneration] = useState(0);
  const editListeners = useRef(new Set<() => void>());
  const subscribeEdits = useCallback((listener: () => void) => {
    editListeners.current.add(listener);
    return () => {
      editListeners.current.delete(listener);
    };
  }, []);
  const dirty = useRef(new Map<string, SectionDraft>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const settingsSaving = useRef<Promise<void> | null>(null);
  const tagRemovals = useRef<Promise<void>>(Promise.resolve());
  const tagWork = useRef(new Set<Promise<void>>());
  const tagFlushers = useRef(new Set<() => Promise<void>>());
  const registerTagFlusher = useCallback((flush: () => Promise<void>) => {
    tagFlushers.current.add(flush);
    return () => {
      tagFlushers.current.delete(flush);
    };
  }, []);
  const trackTagWork = useCallback((task: Promise<void>) => {
    tagWork.current.add(task);
    void task.finally(() => tagWork.current.delete(task));
  }, []);
  const changed = useRef(new Map<string, symbol>());
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    },
    [],
  );
  const activate = useCallback((p: Project) => {
    activation.current++;
    setVersionStatus('saved');
    if (timer.current) clearTimeout(timer.current);
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    changed.current.clear();
    ref.current = p;
    sectionIndex.current = new Map(p.sections.map((section) => [section.id, section]));
    setProject(p);
    const s = { ...defaultSettings, ...p.settings };
    // Preserve projects that briefly used the second typography's earlier identifier.
    if ((s.font as string) === 'book') s.font = 'sans';
    settingsRef.current = s;
    setSettingsState(s);
    dirty.current.clear();
    setStatus('saved');
    setGeneration((x) => x + 1);
  }, []);
  const flush = useCallback(async (): Promise<void> => {
    while (tagWork.current.size) await Promise.all(tagWork.current);
    while (settingsSaving.current) await settingsSaving.current;
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      if (dirty.current.size) return flush();
      return;
    }
    if (!ref.current || !dirty.current.size) return;
    const values = new Map(dirty.current);
    const patches = Array.from(values, ([id, value]) => ({
      id,
      ...value(),
      revision: sectionIndex.current.get(id)!.revision,
    }));
    setStatus('saving');
    const task = (async () => {
      try {
        const result = await request('save', { patches });
        for (const ack of result.sections) {
          const s = sectionIndex.current.get(ack.id);
          if (s) s.revision = ack.revision;
          if (dirty.current.get(ack.id) === values.get(ack.id)) dirty.current.delete(ack.id);
        }
        setStatus(dirty.current.size ? 'editing' : 'saved');
        if (result.mirrorErrors.length)
          onError(
            'Texte sauvegardé. Copie Markdown à réparer : ' +
              result.mirrorErrors.map((e) => e.message).join('; '),
          );
      } catch (e) {
        setStatus('error');
        onError(e);
        throw e;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = task;
    await task;
    if (dirty.current.size) return flush();
  }, [onError]);
  const checkpoint = useCallback(async () => {
    const path = ref.current?.path,
      session = activation.current;
    if (!path) return;
    if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
    for (const flushTags of tagFlushers.current) await flushTags();
    await flush();
    if (ref.current?.path !== path || activation.current !== session) return;
    const pending = new Map(changed.current);
    if (!pending.size) return;
    setVersionStatus('saving');
    try {
      for (const [scope, token] of pending) {
        if (ref.current?.path !== path || activation.current !== session) return;
        if (sectionIndex.current.has(scope)) {
          const version = await request('automaticVersion', {
            projectPath: path,
            scope,
          });
          if (activation.current !== session) return;
          if (version) setVersionRevision((revision) => revision + 1);
        }
        if (activation.current !== session) return;
        if (changed.current.get(scope) === token) changed.current.delete(scope);
      }
      setVersionStatus('saved');
    } catch (e) {
      if (activation.current === session) setVersionStatus('error');
      throw e;
    }
  }, [flush]);
  const scheduleCheckpoint = useCallback(
    (ids: Iterable<string>) => {
      for (const id of ids) changed.current.set(id, Symbol());
      if (checkpointTimer.current) clearTimeout(checkpointTimer.current);
      checkpointTimer.current = setTimeout(() => void checkpoint().catch(onError), 90_000);
    },
    [checkpoint, onError],
  );
  const edit = useCallback(
    (changes: Map<string, string>, outlines?: Map<string, Outline>) => {
      for (const [id, text] of changes) {
        const s = sectionIndex.current.get(id);
        const outline = outlines?.get(id) ?? (s?.text === text ? s.outline : null);
        if (s) {
          s.text = text;
          s.outline = outline;
        }
        dirty.current.set(id, () => ({ text, outline }));
      }
      scheduleCheckpoint(changes.keys());
      for (const listener of editListeners.current) listener();
      setStatus('editing');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => {}), 650);
    },
    [flush, scheduleCheckpoint],
  );
  const editDraft = useCallback(
    (drafts: Map<string, SectionDraft>) => {
      for (const [id, draft] of drafts) {
        const section = sectionIndex.current.get(id);
        if (section) stageDraft(section, draft);
        dirty.current.set(id, draft);
      }
      scheduleCheckpoint(drafts.keys());
      for (const listener of editListeners.current) listener();
      setStatus('editing');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => {}), 650);
    },
    [flush, scheduleCheckpoint],
  );
  const configure = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettingsState(next);
      if (ref.current) {
        ref.current.settings = next;
        const task = (settingsSaving.current ?? Promise.resolve())
          .catch(() => {})
          .then(() => request('settings', { value: next }))
          .then(() => {});
        settingsSaving.current = task;
        void task.then(() => {
          if (settingsSaving.current === task) settingsSaving.current = null;
        }, onError);
      }
    },
    [onError],
  );
  const replaceSections = useCallback(
    (sections: Section[], reset = true, canUndoStructure?: boolean) => {
      if (ref.current) {
        if (!reset) {
          sections = sections.map((s) => {
            const live = ref.current!.sections.find((v) => v.id === s.id);
            return live
              ? {
                  ...s,
                  text: live.text,
                  outline: live.outline,
                  revision: live.revision,
                  tagIds: live.tagIds,
                }
              : s;
          });
        }
        ref.current = {
          ...ref.current,
          sections,
          canUndoStructure: canUndoStructure ?? ref.current.canUndoStructure,
        };
        sectionIndex.current = new Map(sections.map((section) => [section.id, section]));
        setProject(ref.current);
        if (reset) setGeneration((x) => x + 1);
      }
    },
    [],
  );
  const tagOperation = useCallback(
    async (operation: TagOperation) => {
      const path = ref.current?.path,
        session = activation.current;
      if (!path) throw new Error('Ouvrez un projet pour continuer.');
      const sectionOnly = operation.action === 'assign' && !operation.node;
      // New definitions may be created while typing. Remapping existing references
      // requires the modal administration flow and a completed manuscript save.
      const existing =
        operation.action !== 'save' ||
        ref.current!.smartTags?.some((t) => t.id === operation.tag.id);
      if (existing && !sectionOnly) await flush();
      const task = (settingsSaving.current ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          if (ref.current?.path !== path || activation.current !== session)
            throw new Error('Le projet actif a changé.');
          const next = await request('smartTagOperation', { projectPath: path, operation });
          if (ref.current?.path !== path || activation.current !== session)
            throw new Error('Le projet actif a changé.');
          ref.current = {
            ...ref.current,
            smartTags: next.smartTags,
            ...(sectionOnly
              ? {
                  sections: ref.current.sections.map((s) =>
                    s.id === operation.section ? { ...s, tagIds: operation.tagIds } : s,
                  ),
                  trash: ref.current.trash?.map((s) =>
                    s.id === operation.section ? { ...s, tagIds: operation.tagIds } : s,
                  ),
                }
              : operation.action !== 'save'
                ? { sections: next.sections, trash: next.trash }
                : {}),
          };
          if (operation.action !== 'save') {
            sectionIndex.current = new Map(ref.current.sections.map((s) => [s.id, s]));
            if (!sectionOnly) setGeneration((v) => v + 1);
          }
          setProject(ref.current);
          setVersionRevision((v) => v + 1);
        });
      settingsSaving.current = task;
      try {
        await task;
      } finally {
        if (settingsSaving.current === task) settingsSaving.current = null;
      }
    },
    [flush],
  );
  const createSmartTag = useCallback(
    async (name: string): Promise<SmartTag> => {
      while (settingsSaving.current) await settingsSaving.current;
      const found = ref.current?.smartTags?.find(
        (t) => t.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (found) return found;
      const tag = {
        id: crypto.randomUUID(),
        name: name.trim(),
        category: '',
        color: nextTagColor(ref.current?.smartTags ?? []),
      };
      await tagOperation({ action: 'save', tag });
      return tag;
    },
    [tagOperation],
  );
  const addSectionTag = useCallback(
    async (section: string, tag: string) => {
      const path = ref.current?.path,
        session = activation.current;
      while (settingsSaving.current) await settingsSaving.current;
      if (ref.current?.path !== path || activation.current !== session)
        throw new Error('Le projet actif a changé.');
      const owner = ref.current?.sections.find((s) => s.id === section);
      if (!owner) throw new Error('Section introuvable.');
      if (!owner.tagIds?.includes(tag))
        await tagOperation({ action: 'assign', section, tagIds: [...(owner.tagIds ?? []), tag] });
    },
    [tagOperation],
  );
  const removeTagAssignment = useCallback(
    (section: string, node: string | null, tag: string) => {
      const path = ref.current?.path,
        session = activation.current;
      const task = tagRemovals.current
        .catch(() => {})
        .then(async () => {
          while (settingsSaving.current) await settingsSaving.current;
          if (ref.current?.path !== path || activation.current !== session)
            throw new Error('Le projet actif a changé.');
          const owner = ref.current?.sections.find((s) => s.id === section);
          if (!owner) return;
          const ids = node ? owner.outline?.nodes.find((n) => n.id === node)?.tagIds : owner.tagIds;
          if (ids?.includes(tag))
            await tagOperation({
              action: 'assign',
              section,
              node,
              tagIds: ids.filter((id) => id !== tag),
            });
        });
      tagRemovals.current = task;
      return task;
    },
    [tagOperation],
  );
  return {
    tagOperation,
    createSmartTag,
    addSectionTag,
    removeTagAssignment,
    trackTagWork,
    registerTagFlusher,
    markChanged: scheduleCheckpoint,
    project,
    subscribeEdits,
    ref,
    activate,
    settings,
    settingsRef,
    configure,
    status,
    versionStatus,
    versionRevision,
    generation,
    edit,
    editDraft,
    flush,
    checkpoint,
    replaceSections,
  };
}

export type ProjectController = ReturnType<typeof useProject>;
