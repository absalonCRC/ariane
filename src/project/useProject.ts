import { stageDraft, type SectionDraft } from './draft';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../platform/client';
import { defaultSettings, type Settings } from '../contracts/settings';
import { type Project, type Section, type Outline } from '../contracts/project';
import { type SaveState } from '../app/workspace/types';
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
              ? { ...s, text: live.text, outline: live.outline, revision: live.revision }
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
  return {
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
