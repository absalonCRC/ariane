// @vitest-environment jsdom
import { act, useState, type Dispatch, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContextMenuProvider, useContextMenu } from '../src/components/ContextMenu';
import { WorkspaceNotices } from '../src/app/WorkspaceNotices';
import { useTitleNotices } from '../src/app/useTitleNotices';
import type { Workspace } from '../src/app/useWorkspace';
import type { Project, Surface } from '../src/app/types';
import { PathMenu } from '../src/project/PathMenu';

const project: Project = {
  path: 'test',
  name: 'Mon manuscrit',
  sections: [],
  settings: {},
  recovered: false,
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let controls: {
  setLibraryNotice: Dispatch<SetStateAction<Workspace['libraryNotice']>>;
  setError: Dispatch<SetStateAction<string>>;
  setExport: Dispatch<SetStateAction<'ready' | 'working' | 'done' | 'error'>>;
  setSurface: Dispatch<SetStateAction<Surface>>;
};

function MenuFailure() {
  const open = useContextMenu();
  return (
    <button
      onClick={(event) =>
        open(event, {
          title: 'Actions',
          groups: [
            [
              {
                label: 'Échouer',
                run: () => {
                  throw new Error('test');
                },
              },
            ],
          ],
        })
      }
    >
      Ouvrir le menu
    </button>
  );
}

function Harness() {
  const [libraryNotice, setLibraryNotice] = useState<Workspace['libraryNotice']>(null);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [exportState, setExport] = useState<'ready' | 'working' | 'done' | 'error'>('ready');
  const [surface, setSurface] = useState<Surface>('none');
  controls = { setLibraryNotice, setError, setExport, setSurface };
  const workspace = {
    libraryNotice,
    setLibraryNotice,
    error,
    setError,
    recovery,
    setRecovery,
    surface,
    setSurface,
    exportJob: { state: exportState, reset: () => setExport('ready') },
    doc: { project, status: 'saved', ref: { current: project }, flush: async () => {} },
    activate: () => {},
    fail: () => {},
    libraryBusy: false,
    operate: async () => {},
  } as unknown as Workspace;
  const notices = useTitleNotices(workspace);
  return (
    <>
      <MenuFailure />
      <PathMenu
        project={project}
        selected={undefined}
        continuous
        onSelect={() => {}}
        onAdd={() => {}}
        notifications={notices.notices.map((notice) => ({
          id: notice.id,
          message: notice.message,
          tone: notice.tone,
          showDetails: notice.kind === 'error' || notice.kind === 'recovery',
          onDismiss: () => notices.dismiss(notice),
        }))}
        hasPending={notices.hasPending}
        hasError={notices.hasError}
        noticeDetails={<WorkspaceNotices workspace={workspace} embedded />}
      />
    </>
  );
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ContextMenuProvider>
        <Harness />
      </ContextMenuProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it('shows a colored library notice for five seconds and restores the breadcrumb', async () => {
  const originalCapsule = host.querySelector('.path-heading');
  await act(async () => controls.setLibraryNotice({ message: 'Section déplacée.', undo: true }));
  expect(host.querySelector('.path-heading')).toBe(originalCapsule);
  expect(originalCapsule?.textContent).toContain('Section déplacée.');
  expect(originalCapsule?.querySelector('.path-notice-row')?.getAttribute('data-tone')).toBe(
    'success',
  );
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('true');
  await act(async () => vi.advanceTimersByTime(4999));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('true');
  await act(async () => vi.advanceTimersByTime(1));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
  expect(host.querySelector('.path-title-text')?.textContent).toBe(
    'Mon manuscrit / Manuscrit entier',
  );
  expect(host.querySelector('.path-heading')).toBe(originalCapsule);
  expect(host.querySelector('.title-notice')).toBeNull();
});

it('keeps conflicts visible until dismissed and exposes resolution actions', async () => {
  await act(async () => controls.setError('EXTERNAL:scene'));
  expect(host.querySelector('.path-notice-row')?.getAttribute('data-tone')).toBe('error');
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('true');
  await act(async () => host.querySelector<HTMLButtonElement>('.path-trigger')!.click());
  expect(host.querySelector('.path-popover')?.getAttribute('aria-hidden')).toBe('false');
  expect(host.querySelector('.path-notices')?.textContent).toContain('Lire la version externe');
  expect(host.querySelector('.path-notices')?.textContent).toContain('Conserver mon texte');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Fermer la notification"]')!.click(),
  );
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
  expect(host.querySelector('.path-notice-dot')).toBeNull();
});

it('shows an error and a success on separately colored rows and keeps the error', async () => {
  const capsule = host.querySelector('.path-heading');
  await act(async () => controls.setLibraryNotice({ message: 'Section déplacée.', undo: false }));
  await act(async () => vi.advanceTimersByTime(2000));
  await act(async () => controls.setError('Impossible d’enregistrer.'));
  expect(host.querySelector('.path-heading')).toBe(capsule);
  expect(capsule?.textContent).toContain('Impossible d’enregistrer.');
  expect(capsule?.textContent).toContain('Section déplacée.');
  expect(capsule?.querySelectorAll('.path-notice-row')).toHaveLength(2);
  expect(
    [...capsule!.querySelectorAll('.path-notice-row')].map((row) => row.getAttribute('data-tone')),
  ).toEqual(['error', 'success']);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(capsule?.textContent).not.toContain('Section déplacée.');
  expect(capsule?.textContent).toContain('Impossible d’enregistrer.');
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('true');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Fermer la notification"]')!.click(),
  );
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
});

it('keeps recent library messages visible independently', async () => {
  await act(async () =>
    controls.setLibraryNotice({ message: 'Premier déplacement.', undo: false }),
  );
  await act(async () => vi.advanceTimersByTime(3000));
  await act(async () =>
    controls.setLibraryNotice({ message: 'Deuxième déplacement.', undo: false }),
  );
  expect(host.querySelectorAll('.path-notice-row')).toHaveLength(2);
  await act(async () => vi.advanceTimersByTime(2000));
  expect(host.querySelector('.path-heading')?.textContent).toContain('Deuxième déplacement.');
  expect(host.querySelector('.path-heading')?.textContent).not.toContain('Premier déplacement.');
  await act(async () => vi.advanceTimersByTime(3000));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
});

it('announces a notice and returns keyboard focus to the title when its action expires', async () => {
  await act(async () => controls.setLibraryNotice({ message: 'Section déplacée.', undo: false }));
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('Section déplacée.');
  const close = host.querySelector<HTMLButtonElement>('[aria-label="Fermer la notification"]')!;
  await act(async () => close.focus());
  expect(document.activeElement).toBe(close);
  await act(async () => vi.advanceTimersByTime(5000));
  expect(document.activeElement).toBe(host.querySelector('.path-trigger'));
});

it('routes context-menu failures into the title bar', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
  await act(async () => item.click());
  expect(host.querySelector('.path-heading')?.textContent).toContain(
    'Cette action n’a pas pu aboutir.',
  );
  expect(document.querySelector('.notice')).toBeNull();
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('true');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Fermer la notification"]')!.click(),
  );
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
});

it('keeps export errors in the capsule until the user dismisses them', async () => {
  await act(async () => controls.setExport('error'));
  await act(async () => vi.advanceTimersByTime(60000));
  expect(host.querySelector('.path-notice-row')?.getAttribute('data-tone')).toBe('error');
  expect(host.querySelector('.path-heading')?.textContent).toContain('L’export n’a pas abouti.');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Fermer la notification"]')!.click(),
  );
  expect(host.querySelector('.path-menu')?.getAttribute('data-notifying')).toBe('false');
  expect(host.querySelector('.path-notice-dot')).not.toBeNull();
});

it('keeps export status available from the path menu after its capsule closes', async () => {
  await act(async () => controls.setExport('done'));
  expect(host.querySelector('.path-heading')?.textContent).toContain('Votre manuscrit est prêt.');
  await act(async () => vi.advanceTimersByTime(5000));
  await act(async () => host.querySelector<HTMLButtonElement>('.path-trigger')!.click());
  expect(host.querySelector('.path-notices')?.textContent).toContain('Voir l’export');
  await act(async () => controls.setSurface('export'));
  expect(host.querySelector('.path-notice-dot')).toBeNull();
});
