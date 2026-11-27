import type { WritingAidCommand } from '../../editor/WritingAidDialog';
import {
  availableCommands,
  useShortcuts,
  effectiveBindings,
  shortcutFromEvent,
  requestShortcutSettings,
} from './shortcuts';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { t } from '../../i18n';
import { type DocumentRole } from '../../contracts/library';
import type { PanelOrigin } from '../../components/useSharedPanel';
import { useEffect, useRef } from 'react';
import { native, request } from '../../platform/client';
import type { Project, Section } from '../../contracts/project';
import type { Source } from '../../contracts/sources';
import type { Surface } from '../workspace/types';
import type { Command } from '../Palette';
import type { EditorHandle } from '../../editor/Editor';
import type { ProjectController } from '../../project/useProject';
interface CommandContext {
  landmarkActions: RefObject<{ lastEdit: () => void; tomorrow: () => void } | null>;
  p: Project | null;
  doc: ProjectController;
  toggleFocus: () => void;
  setBinder: Dispatch<SetStateAction<boolean>>;
  setPalette: Dispatch<SetStateAction<'text' | 'commands' | 'sections' | null>>;
  setSearch: (query: string | null) => void;
  editor: RefObject<EditorHandle | null>;
  locateNextBlank?: () => void;
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
  landmarkActions,
  p,
  doc,
  toggleFocus,
  setBinder,
  setPalette,
  setSearch,
  editor,
  locateNextBlank,
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
  const overrides = useShortcuts();
  const bindings = effectiveBindings(overrides);
  const writingAid = (id: WritingAidCommand, hint: string) => {
    if (editor.current?.writingAid(id)) return;
    fail(t(hint));
  };
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
        {
          id: 'blank-insert',
          label: t('Laisser un blanc'),
          action: () => writingAid('blank-insert', 'Placez le curseur dans le manuscrit.'),
        },
        { id: 'last-edit', label: t('Revenir à la dernière frappe'), action: () => landmarkActions.current?.lastEdit() },
        { id: 'tomorrow-note', label: t('Mot pour demain'), action: () => landmarkActions.current?.tomorrow() },
        { id: 'blank-next', label: t('Blanc suivant'), action: () => locateNextBlank?.() },
        {
          id: 'blank-fill',
          label: t('Compléter le blanc'),
          action: () => writingAid('blank-fill', 'Placez le curseur sur un blanc.'),
        },
        {
          id: 'trial-start',
          label: t('Essayer une formulation'),
          action: () => writingAid('trial-start', 'Sélectionnez une formulation dans un paragraphe.'),
        },
        {
          id: 'writing-aids',
          label: t('Repères d’écriture'),
          action: () => writingAid('writing-aids', 'Ouvrez un texte pour voir ses repères.'),
        },
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
        { id: 'entities', label: t('Gérer les entités'), action: () => setSurface('entities') },
        {
          id: 'shortcuts',
          label: t('Configurer les raccourcis'),
          action: () => {
            requestShortcutSettings();
            setSurface('preferences');
          },
        },
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
  commands.push(
    {
      id: 'inbox-open',
      label: t('Boîte de réception'),
      action: () => window.dispatchEvent(new Event('ariane-inbox-open')),
    },
    ...(native
      ? [
          {
            id: 'capture-open',
            label: t('Capture rapide'),
            action: () => {
              void request('captureWindow', { action: 'toggle' }).catch(fail);
            },
          },
        ]
      : []),
    ...(p ? [{ id: 'commands', label: t('Commandes'), action: () => setPalette('commands') }] : []),
  );
  for (const c of commands)
    if (Object.hasOwn(bindings, c.id)) c.detail = bindings[c.id] ?? undefined;
  const keyboardCommands = useRef(commands);
  keyboardCommands.current = commands;
  const lastGesture = useRef<{ id: string; time: number; origin: 'keyboard' | 'native' } | null>(
    null,
  );
  const nativeCommand = useRef<(id: string) => void>(() => {});
  nativeCommand.current = (id) => {
    if (libraryLock.current || document.querySelector('dialog[open], .app[data-page-busy="true"]'))
      return;
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
    const nativeIds = [
      'open-project',
      'annotations',
      'manuscript',
      'binder',
      'sections',
      'search',
      'entities',
      'smart-tags',
      'shortcuts',
    ];
    if (!document.documentElement.dataset.flushing && nativeIds.includes(id))
      commands.find((command) => command.id === id)?.action();
  };
  useEffect(() => {
    if (!native) return;
    let stop: (() => void) | undefined,
      disposed = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>('app-command', (e) => {
          const now = performance.now(),
            last = lastGesture.current;
          if (last?.id === e.payload && last.origin === 'keyboard' && now - last.time < 250) {
            lastGesture.current = null;
            return;
          }
          lastGesture.current = { id: e.payload, time: now, origin: 'native' };
          nativeCommand.current(e.payload);
        }),
      )
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
      if (
        document.documentElement.dataset.flushing ||
        document.querySelector('dialog[open], .app[data-page-busy="true"]')
      )
        return;
      if (libraryLock.current) {
        e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement)?.closest?.('.shortcut-settings input')) return;
      if (e.isComposing || e.key === 'Dead' || e.defaultPrevented) return;
      const value = shortcutFromEvent(e);
      if (!value) return;
      const inEditor = !!(e.target as HTMLElement)?.closest?.('.cm-editor');
      const match = availableCommands.find(
        (c) => c.scope !== 'global' && bindings[c.id] === value && (c.scope === 'app' || inEditor),
      );
      if (match) {
        if (match.id === 'prediction-accept') return;
        // Capture before CodeMirror's default search keymap. A menu event for this
        // same gesture must not execute the action a second time.
        e.preventDefault();
        e.stopPropagation();
        if (native && match.native) {
          const now = performance.now(),
            last = lastGesture.current;
          if (last?.id === match.id && last.origin === 'native' && now - last.time < 250) {
            lastGesture.current = null;
            return;
          }
          lastGesture.current = { id: match.id, time: now, origin: 'keyboard' };
          if (
            !['focus', 'binder', 'commands', 'sections', 'search', 'save', 'export'].includes(
              match.id,
            )
          ) {
            nativeCommand.current(match.id);
            return;
          }
        }
        if (match.id === 'fold-left' || match.id === 'fold-right') {
          editor.current?.structure(match.id);
          return;
        }
        keyboardCommands.current.find((c) => c.id === match.id)?.action();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        // Ariane owns search; remapping it must not expose CodeMirror's separate replace panel.
        e.preventDefault();
        e.stopPropagation();
      } else if (
        inEditor &&
        availableCommands.some(
          (c) =>
            c.id !== 'prediction-accept' &&
            c.scope === 'editor' &&
            c.shortcut === value &&
            bindings[c.id] !== value,
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (document.querySelector('.app[data-page-busy="true"]')) {
          e.preventDefault();
          return;
        }
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
  }, [doc.flush, toggleFocus, overrides, p]);
  return commands;
}
