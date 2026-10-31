import { stageDraft, type SectionDraft } from './draft';
import { useCallback, useRef, useState } from 'react';
import { request } from '../app/client';
import {
  defaultSettings,
  type Project,
  type Section,
  type Settings,
  type SaveState,
  type Outline,
} from '../app/types';
export function useProject(onError: (e: unknown) => void) {
  const [project, setProject] = useState<Project | null>(null);
  const ref = useRef<Project | null>(null);
  const sectionIndex = useRef(new Map<string, Section>());
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const settingsRef = useRef(settings);
  const [status, setStatus] = useState<SaveState>('saved');
  const [generation, setGeneration] = useState(0);
  const dirty = useRef(new Map<string, SectionDraft>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const activate = useCallback((p: Project) => {
    ref.current = p;
    sectionIndex.current = new Map(p.sections.map(section => [section.id, section]));
    setProject(p);
    const s = { ...defaultSettings, ...p.settings };
    settingsRef.current = s;
    setSettingsState(s);
    dirty.current.clear();
    setStatus('saved');
    setGeneration((x) => x + 1);
  }, []);
  const flush = useCallback(async (): Promise<void> => {
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
        const result = await request<{ id: string; revision: number }[]>('save', { patches });
        for (const ack of result) {
          const s = sectionIndex.current.get(ack.id);
          if (s) s.revision = ack.revision;
          if (dirty.current.get(ack.id) === values.get(ack.id)) dirty.current.delete(ack.id);
        }
        setStatus(dirty.current.size ? 'editing' : 'saved');
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
      setStatus('editing');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => {}), 650);
    },
    [flush],
  );
  const editDraft = useCallback(
    (drafts: Map<string, SectionDraft>) => {
      for (const [id, draft] of drafts) {
        const section = sectionIndex.current.get(id);
        if (section) stageDraft(section, draft);
        dirty.current.set(id, draft);
      }
      setStatus('editing');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush().catch(() => {}), 650);
    },
    [flush],
  );
  const configure = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettingsState(next);
      if (ref.current) {
        ref.current.settings = next;
        void request('settings', { value: next }).catch(onError);
      }
    },
    [onError],
  );
  const replaceSections = useCallback((sections: Section[], reset = true) => {
    if (ref.current) {
      if (!reset) {
        sections = sections.map((s) => {
          const live = ref.current!.sections.find((v) => v.id === s.id);
          return live
            ? { ...s, text: live.text, outline: live.outline, revision: live.revision }
            : s;
        });
      }
      ref.current = { ...ref.current, sections };
      sectionIndex.current = new Map(sections.map(section => [section.id, section]));
      setProject(ref.current);
      if (reset) setGeneration((x) => x + 1);
    }
  }, []);
  return {
    project,
    ref,
    activate,
    settings,
    settingsRef,
    configure,
    status,
    generation,
    edit,
    editDraft,
    flush,
    replaceSections,
  };
}
