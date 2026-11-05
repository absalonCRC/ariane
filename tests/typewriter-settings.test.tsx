// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Preferences } from '../src/app/Preferences';
import { Settings } from '../src/app/Settings';
import { defaultSettings } from '../src/contracts/settings';
import { type Project } from '../src/contracts/project';
import { useProject } from '../src/project/useProject';
import { request } from '../src/platform/client';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

it('allows the typewriter sound to be switched in writing settings and remembers it with the project', async () => {
  localStorage.clear();
  const project = await request('create', { path: 'sound-project', name: 'Test' });
  let workspace: ReturnType<typeof useProject>;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    workspace = useProject(vi.fn());
    return (
      <>
        <Preferences
          onError={vi.fn()}
          value={workspace.settings}
          onChange={workspace.configure}
          onClose={vi.fn()}
          theme="light"
          onTheme={vi.fn()}
          project={project}
          sources={null}
          onExport={vi.fn()}
          onHistory={vi.fn()}
        />
        <Settings
          value={workspace.settings}
          onChange={workspace.configure}
          onClose={vi.fn()}
          open
          onFormat={vi.fn()}
          canFormat
        />
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => workspace.activate(project));
    const writing = [...host.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (button) => button.textContent === 'Écriture',
    )!;
    await act(async () => writing.click());
    const toggles = () =>
      [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((input) =>
        input.closest('label')?.textContent?.includes('Son de machine à écrire'),
      );
    const mode = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.getAttribute('aria-label') === label,
      )!;
    expect(toggles()).toHaveLength(0);
    await act(async () => mode('Machine à écrire').click());
    expect(toggles()).toHaveLength(2);
    expect(toggles().every((input) => !input.checked)).toBe(true);
    await act(async () => toggles()[0].click());
    expect(toggles().every((input) => input.checked)).toBe(true);
    await act(async () => mode('Classique').click());
    expect(toggles()).toHaveLength(0);
    expect((await request('open', { path: project.path })).settings).toMatchObject({
      typewriter: false,
      typewriterSound: true,
    });
    await act(async () => mode('Machine à écrire').click());
    expect(toggles().every((input) => input.checked)).toBe(true);
    const reopened = await request('open', { path: project.path });
    expect(reopened.settings).toMatchObject({ typewriterSound: true });
    await act(async () => workspace.activate(reopened));
    expect(toggles().every((input) => input.checked)).toBe(true);
    await act(async () => toggles()[1].click());
    expect(toggles().every((input) => !input.checked)).toBe(true);
    expect((await request('open', { path: project.path })).settings).toMatchObject({
      typewriterSound: false,
    });
    expect(defaultSettings.typewriterSound).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});

it('keeps a project using the former second font on the new sans serif option', async () => {
  localStorage.clear();
  const project = await request('create', { path: 'font-project', name: 'Test' });
  project.settings.font = 'book' as Project['settings']['font'];
  let workspace: ReturnType<typeof useProject>;
  const host = document.createElement('div');
  const root = createRoot(host);
  function Harness() {
    workspace = useProject(vi.fn());
    return <span>{workspace.settings.font}</span>;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => workspace.activate(project));
    expect(host.textContent).toBe('sans');
    await act(async () => workspace.configure({ fontSize: 24 }));
    expect((await request('open', { path: project.path })).settings.font).toBe('sans');
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
  }
});
