// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Project, Section, Version } from '../src/app/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request }));
import { History } from '../src/history/History';
const scene: Section = {
  id: 'a',
  title: 'Le quai',
  kind: 'scene',
  parent: null,
  position: 0,
  text: 'Élise revient au quai.',
  revision: 3,
  synopsis: '',
  status: '',
  goal: 0,
};
const project: Project = {
  path: 'test',
  name: 'Roman',
  sections: [scene],
  settings: {},
  recovered: false,
};
const version: Version = {
  id: 'v1',
  name: 'Premier jet',
  created: new Date().toISOString(),
  scope: null,
  sections: [{ ...scene, text: 'Élise attend au quai.' }],
};
let host: HTMLDivElement, toolsHost: HTMLDivElement, root: Root;
const apply = vi.fn(),
  restore = vi.fn(),
  close = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div');
  toolsHost = document.createElement('div');
  document.body.append(host, toolsHost);
  root = createRoot(host);
  vi.clearAllMocks();
  request.mockImplementation(async (cmd: string) =>
    cmd === 'versions'
      ? [version]
      : cmd === 'version' || cmd === 'capture'
        ? version
        : cmd === 'restore'
          ? project
          : undefined,
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  toolsHost.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <History
        toolsHost={toolsHost}
        toolsOpen
        project={project}
        active="a"
        flush={async () => {}}
        onApply={apply}
        onRestore={restore}
        onClose={close}
        onError={vi.fn()}
      />,
    ),
  );
}
const button = (text: string) =>
  [...host.querySelectorAll('button'), ...toolsHost.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
it('renders inside the editor and backs up before applying a word-level passage', async () => {
  await render();
  expect(host.querySelector('section.history-editor')).not.toBeNull();
  expect(host.querySelector('dialog')).toBeNull();
  expect(host.querySelector('del')?.textContent).toBe('attend');
  expect(host.querySelector('ins')?.textContent).toBe('revient');
  expect(host.querySelectorAll('.history-diff-cell')).toHaveLength(2);
  await act(async () => button('Reprendre le passage').click());
  expect(request).toHaveBeenCalledWith('capture', { name: 'Avant reprise de passage', scope: 'a' });
  expect(apply).toHaveBeenCalledWith('a', 'Élise attend au quai.', 3);
  const captureCall = request.mock.calls.findIndex((c) => c[0] === 'capture');
  expect(request.mock.invocationCallOrder[captureCall]).toBeLessThan(
    apply.mock.invocationCallOrder[0],
  );
  expect(close).not.toHaveBeenCalled();
});
it('compares snapshots read-only and requires confirmation for full restoration', async () => {
  await render();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Version comparée"]')!;
  await act(async () => {
    select.value = 'v1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(button('Reprendre le passage')).toBeUndefined();
  await act(async () => button('Restaurer cette version').click());
  expect(request.mock.calls.some((c) => c[0] === 'restore')).toBe(false);
  await act(async () => button('Confirmer la restauration').click());
  expect(request).toHaveBeenCalledWith('restore', { id: 'v1' });
  expect(restore).toHaveBeenCalledWith(project);
  expect(close).toHaveBeenCalledOnce();
});

it('offers first-version creation inline instead of comparing two identical copies', async () => {
  request.mockImplementation(async (cmd: string) => (cmd === 'versions' ? [] : undefined));
  await render();
  expect(host.textContent).toContain('Aucune version enregistrée');
  expect(host.querySelector('.history-diff-scroll')).toBeNull();
  await act(async () => button('Conserver la première version').click());
  const input = host.querySelector<HTMLInputElement>('input[required]')!;
  expect(document.activeElement).toBe(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Avant révision',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  request.mockImplementation(async (cmd: string) => (cmd === 'versions' ? [version] : version));
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith('capture', { name: 'Avant révision', scope: null });
  expect(host.querySelector('form')).toBeNull();
  expect(host.querySelectorAll('.history-diff-cell')).toHaveLength(2);
});
it('does not alter the text when the safety snapshot fails', async () => {
  await render();
  request.mockImplementation(async (cmd: string) => {
    if (cmd === 'capture') throw new Error('Disque indisponible');
    return undefined;
  });
  await act(async () => button('Reprendre le passage').click());
  expect(apply).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Disque indisponible');
});

it('follows the active text selected in the library without remounting the comparison', async () => {
  const other = { ...scene, id: 'b', title: 'La maison', text: 'Une autre scène.' };
  const nextProject = { ...project, sections: [scene, other] };
  await render();
  await act(async () =>
    root.render(
      <History
        project={nextProject}
        active="b"
        flush={async () => {}}
        onApply={apply}
        onRestore={restore}
        onClose={close}
        onError={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Texte comparé"]')!.value).toBe('b');
  expect(host.querySelector('.diff-prose:last-child')?.textContent || host.textContent).toContain(
    'Une autre scène.',
  );
  expect(host.querySelector('dialog')).toBeNull();
});

it('puts version commands in the contextual tools menu and connects them to the comparison', async () => {
  await render();
  expect(toolsHost.querySelector('#version-settings')?.getAttribute('aria-hidden')).toBe('false');
  expect(toolsHost.querySelector('[aria-label="Modification suivante"]')).toBeNull();
  const next = host.querySelector<HTMLButtonElement>(
    '.history-diff-summary [aria-label="Modification suivante"]',
  )!;
  await act(async () => next.click());
  expect(host.querySelector('.is-current-change')).not.toBeNull();
  expect(host.querySelector('.history-change-count')?.textContent).toBe('1 / 1');
  await act(async () =>
    toolsHost.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(toolsHost.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  await act(async () => button('Conserver une version').click());
  expect(host.querySelector('form input[required]')).toBe(document.activeElement);
});

it('dates both version selectors and offers Markdown reading without changing passage actions', async () => {
  const markdownVersion = {
    ...version,
    created: '2026-10-31T12:00:00.000Z',
    sections: [{ ...scene, text: 'Élise **attend** au quai.' }],
  };
  request.mockImplementation(async (cmd: string) =>
    cmd === 'versions' ? [markdownVersion] : markdownVersion,
  );
  await render();
  const selects = host.querySelectorAll<HTMLSelectElement>('.history-controls select');
  expect(selects).toHaveLength(2);
  for (const select of selects) {
    expect(select.options[1].textContent).toContain('Premier jet · 31 oct. 2026');
  }
  expect(host.querySelector('del')).not.toBeNull();
  await act(async () => button('Lecture').click());
  expect(host.querySelector('.history-editor')?.getAttribute('data-view')).toBe('reading');
  expect(host.querySelector('.diff-prose.is-reading strong')?.textContent).toBe('attend');
  expect(host.querySelector('.history-diff-row.is-changed')).not.toBeNull();
  expect(button('Reprendre le passage')).not.toBeUndefined();
  await act(async () => button('Source').click());
  expect(host.querySelector('del')).not.toBeNull();
});
