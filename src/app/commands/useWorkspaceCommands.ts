import type { Dispatch, SetStateAction, RefObject } from 'react';
import { t } from '../../i18n';
import { type DocumentRole } from '../../contracts/library';
import type { PanelOrigin } from '../../components/useSharedPanel';
import { useEffect, useRef } from 'react';
import { native } from '../../platform/client';
import type { Project, Section } from '../../contracts/project';
import type { Source } from '../../contracts/sources';
import type { Surface } from '../workspace/types';
import type { Command } from '../Palette';
import type { EditorHandle } from '../../editor/Editor';
import type { ProjectController } from '../../project/useProject';
interface CommandContext {
  p: Project | null;
  doc: ProjectController;
  toggleFocus: () => void;
  setBinder: Dispatch<SetStateAction<boolean>>;
  setPalette: Dispatch<SetStateAction<'text' | 'commands' | 'sections' | null>>;
  setSearch: (query: string | null) => void;
  editor: RefObject<EditorHandle | null>;
  openAnnotations: () => void;
  setSurface: Dispatch<SetStateAction<Surface>>;
  prepareManuscript: () => Promise<void>;
  openSurface: (value: Surface) => void;
  select: (id: string, continuous?: boolean, preserveSource?: boolean) => Promise<boolean>;
  active: string | null;
  createPage: (parent: string | null, role?: DocumentRole) => Promise<void>;
  selected: Section | undefined;
  setNewProject: Dispatch<SetStateAction<boolean>>;
  fail: (e: unknown) => void;
  libraryLock: RefObject<boolean>;
  newProject: boolean;
  setCard: Dispatch<SetStateAction<{ source: Source; top: number; origin?: PanelOrigin } | null>>;
  setReader: Dispatch<SetStateAction<Source | null>>;
  setMenu: Dispatch<SetStateAction<boolean>>;
}
export function useWorkspaceCommands({
  p,
  doc,
  toggleFocus,
  setBinder,
  setPalette,
  setSearch,
  editor,
  openAnnotations,
  setSurface,
  prepareManuscript,
  openSurface,
  select,
  active,
  createPage,
  selected,
  setNewProject,
  fail,
  libraryLock,
  newProject,
  setCard,
  setReader,
  setMenu,
}: CommandContext) {
  const commands: Command[] = p
    ? [
        {
          id: 'focus',
          label: doc.settings.immersiveFocus
            ? t('Quitter le mode focus')
            : t('Activer le mode focus'),
          detail: '⌘ ⇧ F',
          action: toggleFocus,
        },
        {
          id: 'binder',
          label: t('Ouvrir le classeur'),
          detail: '⌘ ⇧ B',
          action: () => setBinder((v) => !v),
        },
        {
          id: 'sections',
          label: t('Rejoindre une section'),
          detail: '⌘ P',
          action: () => setPalette('sections'),
        },
        {
          id: 'search',
          label: t('Rechercher dans les textes et les vaults'),
          detail: '⌘ F',
          action: () => setSearch(editor.current?.selection() || ''),
        },
        ...(native
          ? [
              {
                id: 'annotations',
                label: t('Annoter la sélection / Voir les annotations'),
                action: openAnnotations,
              },
            ]
          : []),
        { id: 'import', label: t('Importer un manuscrit'), action: () => setSurface('import') },
        ...(native
          ? [
              {
                id: 'manuscript',
                label: t('Séparer ou réunir des scènes'),
                action: () => void prepareManuscript(),
              },
            ]
          : []),
        { id: 'sources', label: t('Sources du projet'), action: () => setSurface('sources') },
        { id: 'smart-tags', label: t('Gérer les smart-tags'), action: () => setSurface('tags') },
        { id: 'prepare', label: t('Préparer cette section'), action: () => setSurface('prepare') },
        {
          id: 'history',
          label: t('Créer une variante / Voir les versions'),
          action: () => openSurface('history'),
        },
        {
          id: 'export',
          label: t('Exporter le manuscrit'),
          detail: '⌘ ⇧ E',
          action: () => setSurface('export'),
        },
        { id: 'settings', label: t('Réglages d’écriture'), action: () => setSurface('settings') },
        { id: 'preferences', label: t('Paramètres'), action: () => setSurface('preferences') },
        {
          id: 'indent',
          label: t('Indenter le passage'),
          detail: 'Tab',
          action: () => editor.current?.structure('indent'),
        },
        {
          id: 'outdent',
          label: t('Désindenter le passage'),
          detail: '⇧ Tab',
          action: () => editor.current?.structure('outdent'),
        },
        {
          id: 'up',
          label: t('Monter la branche'),
          detail: '⌥ ↑',
          action: () => editor.current?.structure('up'),
        },
        {
          id: 'down',
          label: t('Descendre la branche'),
          detail: '⌥ ↓',
          action: () => editor.current?.structure('down'),
        },
        {
          id: 'fold',
          label: t('Replier ou déplier le passage'),
          detail: '⌘ ⌥ ← / →',
          action: () => editor.current?.structure('fold'),
        },
        {
          id: 'continuous',
          label: t('Lire le manuscrit entier'),
          action: () => void select(active || '', true),
        },
        {
          id: 'add',
          label: t('Ajouter une scène'),
          action: () => void createPage(selected?.parent || null, selected?.role),
        },
        {
          id: 'new-project',
          label: t('Créer un projet'),
          action: () => {
            void doc
              .checkpoint()
              .then(() => setNewProject(true))
              .catch(fail);
          },
        },
        { id: 'open-project', label: t('Ouvrir un projet'), action: () => setSurface('projects') },
        {
          id: 'save',
          label: t('Enregistrer'),
          detail: '⌘ S',
          action: () => void doc.flush().catch(() => {}),
        },
      ]
    : [];
  const nativeCommand = useRef<(id: string) => void>(() => {});
  nativeCommand.current = (id) => {
    if (libraryLock.current || document.querySelector('dialog[open][aria-modal="true"]')) return;
    if (!p || newProject) return;
    if (id === 'focus') {
      toggleFocus();
      return;
    }
    if (id === 'save') {
      void doc.flush().catch(fail);
      return;
    }
    if (id === 'new-project') {
      void doc
        .flush()
        .then(() => setNewProject(true))
        .catch(fail);
      return;
    }
    if (id === 'commands') {
      setPalette('commands');
      return;
    }
    if (['import', 'export', 'history', 'preferences', 'sources'].includes(id)) {
      openSurface(id as Surface);
      return;
    }
    const nativeIds = ['open-project', 'annotations', 'manuscript', 'binder', 'sections', 'search'];
    if (nativeIds.includes(id)) commands.find((command) => command.id === id)?.action();
  };
  useEffect(() => {
    if (!native) return;
    let stop: (() => void) | undefined,
      disposed = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('app-command', (e) => nativeCommand.current(e.payload)))
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(fail);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.workspace-screen[open]')) return;
      if (libraryLock.current) {
        e.preventDefault();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (e.shiftKey && k === 'f') {
        e.preventDefault();
        e.stopPropagation();
        toggleFocus();
        return;
      }
      if (k === 'k') {
        e.preventDefault();
        setPalette((v) => (v ? null : 'commands'));
      }
      if (k === 'p') {
        e.preventDefault();
        setPalette('sections');
      }
      if (k === 's') {
        e.preventDefault();
        void doc.flush().catch(() => {});
      }
      if (e.shiftKey && k === 'b') {
        e.preventDefault();
        setBinder((v) => !v);
      }
      if (k === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setSearch(editor.current?.selection() || '');
      }
      if (e.shiftKey && k === 'e') {
        e.preventDefault();
        setSurface('export');
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setCard(null);
        setReader(null);
        setSearch(null);
        setBinder(false);
        setMenu(false);
        setSurface('none');
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', escape);
    };
  }, [doc.flush, toggleFocus]);
  return commands;
}
