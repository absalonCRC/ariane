import type { RefObject, Dispatch, SetStateAction } from 'react';
import { t } from '../i18n';
import { libraryOperationMessage } from './library';
import { type LibraryOperation, type DocumentRole } from '../contracts/library';
import { request } from '../platform/client';
import type { ManuscriptOperation } from '../contracts/library';
import type { Project, Section } from '../contracts/project';
import type { Surface } from '../app/workspace/types';
import { ordered } from './tree';
import type { ProjectController } from './useProject';
interface OperationContext {
  beforeSwitch?: () => Promise<void>;
  libraryLock: RefObject<boolean>;
  setLibraryBusy: Dispatch<SetStateAction<boolean>>;
  doc: ProjectController;
  metadataQueue: RefObject<Promise<void>>;
  memorySessionSaver: RefObject<() => Promise<unknown>>;
  cursor: RefObject<number>;
  activate: (p: Project) => void;
  setSurface: Dispatch<SetStateAction<Surface>>;
  setBinder: Dispatch<SetStateAction<boolean>>;
  fail: (e: unknown) => void;
  setLibraryNotice: Dispatch<SetStateAction<{ message: string; undo: boolean } | null>>;
  setSourceVersion: Dispatch<SetStateAction<number>>;
  setNewSection: Dispatch<
    SetStateAction<{
      parent: string | null;
      kind: Section['kind'];
      role?: DocumentRole;
      after?: string;
    } | null>
  >;
  setNewTitle: Dispatch<SetStateAction<string>>;
  setSearch: (query: string | null) => void;
  newSection: {
    parent: string | null;
    kind: Section['kind'];
    role?: DocumentRole;
    after?: string;
  } | null;
  newTitle: string;
  p: Project | null;
}
export function createProjectOperations({
  beforeSwitch,
  libraryLock,
  setLibraryBusy,
  doc,
  metadataQueue,
  memorySessionSaver,
  cursor,
  activate,
  setSurface,
  setBinder,
  fail,
  setLibraryNotice,
  setSourceVersion,
  setNewSection,
  setNewTitle,
  setSearch,
  newSection,
  newTitle,
  p,
}: OperationContext) {
  async function openProject(path: string, section?: string) {
    if (libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.checkpoint();
      await metadataQueue.current;
      await memorySessionSaver.current();
      if (doc.ref.current)
        await request('settings', {
          value: { ...doc.settingsRef.current, cursor: cursor.current },
        });
      await beforeSwitch?.();
      const project = await request('open', { path });
      if (section)
        project.settings = {
          ...project.settings,
          active: section,
          continuous: false,
          cursor: 0,
          libraryView: 'texts',
        };
      activate(project);
      setSurface('none');
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  async function manuscriptOperation(operation: ManuscriptOperation) {
    if (libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.checkpoint();
      await metadataQueue.current;
      const next = await request('manuscriptOperation', {
        projectPath: doc.ref.current!.path,
        operation,
      });
      next.settings = {
        ...doc.settingsRef.current,
        active: operation.sourceId,
        continuous: false,
        cursor: 0,
      };
      doc.activate(next);
      setSurface('none');
      setBinder(true);
      setLibraryNotice({ message: t('Texte réorganisé.'), undo: false });
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  async function operate(operation: LibraryOperation) {
    if (libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.checkpoint();
      await metadataQueue.current;
      await request('settings', { value: { ...doc.settingsRef.current, cursor: cursor.current } });
      const message = libraryOperationMessage(doc.ref.current!, operation);
      const next = await request('libraryOperation', { operation });
      doc.activate(next);
      setLibraryNotice({ message, undo: operation.action !== 'undo' });
      setSourceVersion((v) => v + 1);
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  function startCreation(
    parent: string | null,
    kind: Section['kind'],
    role?: DocumentRole,
    after?: string,
  ) {
    if (!doc.ref.current || libraryLock.current) return;
    setNewSection({ parent, kind, role: role || 'manuscript', after });
    setNewTitle('');
    setSearch(null);
    doc.configure({ libraryView: 'texts' });
    setSurface('none');
    setBinder(true);
  }
  async function createPage(parent: string | null, role?: DocumentRole) {
    startCreation(parent, 'scene', role);
  }
  async function add() {
    if (!newSection || !newTitle.trim() || libraryLock.current) return;
    libraryLock.current = true;
    setLibraryBusy(true);
    try {
      await doc.checkpoint();
      await metadataQueue.current;
      const sections = newSection.after
        ? (
            await request('libraryOperation', {
              operation: {
                action: 'add',
                target: newSection.after,
                placement: 'after',
                kind: newSection.kind,
                role: newSection.role,
                title: newTitle.trim(),
              },
            })
          ).sections
        : await request('add', { ...newSection, title: newTitle.trim() });
      setLibraryNotice(null);
      doc.replaceSections(sections, true, true);
      const added = sections.find((s) => !p!.sections.some((old) => old.id === s.id));
      if (added) doc.configure({ active: added.id, continuous: false, cursor: 0 });
      setNewSection(null);
      setNewTitle('');
      setBinder(true);
    } catch (e) {
      fail(e);
    } finally {
      libraryLock.current = false;
      setLibraryBusy(false);
    }
  }
  async function move(id: string, target: string, inside: boolean) {
    try {
      await doc.flush();
      const all = ordered(p!.sections);
      const ids = all.map((s) => s.id).filter((x) => x !== id);
      ids.splice(ids.indexOf(target) + (inside ? 1 : 0), 0, id);
      doc.replaceSections(
        await request('reorder', {
          ids,
          id,
          parent: inside ? target : all.find((s) => s.id === target)!.parent,
        }),
      );
    } catch (e) {
      fail(e);
    }
  }
  function update(section: Section) {
    const path = doc.ref.current?.path;
    const task = metadataQueue.current
      .catch(() => {})
      .then(async () => {
        if (doc.ref.current?.path !== path) return;
        await doc.flush();
        const sections = await request('update', { section });
        if (doc.ref.current?.path === path) {
          doc.replaceSections(sections, false);
          doc.markChanged([section.id]);
        }
      });
    metadataQueue.current = task.catch(() => {});
    return task;
  }
  async function apply(id: string, text: string, revision: number) {
    await doc.flush();
    const current = doc.ref.current!.sections.find((s) => s.id === id)!;
    if (current.revision !== revision)
      throw new Error(t('Le texte a changé. Relancez la comparaison.'));
    await request('save', { patches: [{ id, text, revision }] });
    activate(await request('open', { path: p!.path }));
  }
  return {
    openProject,
    manuscriptOperation,
    operate,
    startCreation,
    createPage,
    add,
    move,
    update,
    apply,
  };
}
