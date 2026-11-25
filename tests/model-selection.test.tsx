// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Welcome } from '../src/app/Welcome';
import { RuntimeModuleSettings } from '../src/app/RuntimeModuleSettings';
import { modelNotifications } from '../src/app/modelNotifications';
import { RuntimeModelsProvider, useRuntimeModels } from '../src/app/runtimeModels';
import type { RuntimeModule } from '../src/contracts/runtimeModules';
import { PathMenu } from '../src/project/PathMenu';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ native: true, request }));
let host: HTMLDivElement;
let root: Root;
let installed: RuntimeModule[];
let finish: () => void;
let fail: (reason: Error) => void;
function Example() {
  const catalog = useRuntimeModels()!;
  const [settings, setSettings] = useState(false);
  return (
    <>
      <PathMenu
        continuous={false}
        selected={undefined}
        onSelect={() => {}}
        onAdd={() => {}}
        notifications={[
          ...modelNotifications(catalog, 'fr'),
          { id: 1, tone: 'success', message: 'Sauvegardé', onDismiss() {} },
        ]}
      />
      <button id="voice" onClick={() => catalog.offer({ key: 'voice', id: 'voice' })}>
        Dictée
      </button>
      <button id="reading" onClick={() => catalog.offer({ key: 'reading', id: 'readingFr' })}>
        Lire
      </button>
      <button id="settings" onClick={() => setSettings(!settings)}>
        Paramètres
      </button>
      {settings ? <RuntimeModuleSettings /> : <textarea aria-label="Manuscrit" />}
    </>
  );
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  installed = ['semantic'];
  request
    .mockReset()
    .mockImplementation(async (type: string, input?: { module: RuntimeModule }) => {
      if (type === 'runtimeModules') return { installed: [...installed], active: null };
      if (type === 'installRuntime')
        return new Promise<void>((resolve, reject) => {
          finish = () => {
            installed.push(input!.module);
            resolve();
          };
          fail = reject;
        });
      if (type === 'cancelRuntimeInstall') return fail(new Error('Interrompu'));
      throw Error(type);
    });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <RuntimeModelsProvider>
        <Example />
      </RuntimeModelsProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const control = (key: string) =>
  host.querySelector<HTMLElement>(`.path-heading [data-model-request="${key}"]`);
const click = (el: HTMLElement | null) => act(async () => el!.click());
const open = (key: string) => click(host.querySelector('#' + key));
const action = (key: string) => click(control(key)!.querySelector('button'));
const close = (key: string) =>
  click(control(key)!.closest('.path-notice-row')!.querySelector('.title-notice-close'));
async function choose(key: string, id: string) {
  await act(async () => {
    const select = control(key)!.querySelector('select')!;
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it.each([
  { entries: [], expanded: true },
  { entries: [{ archived: true, available: false }], expanded: false },
])(
  'shows the download examples on first project creation (expanded=$expanded)',
  async ({ entries, expanded }) => {
    request.mockResolvedValueOnce(entries);
    await act(async () =>
      root.render(
        <RuntimeModelsProvider>
          <Welcome onOpen={vi.fn()} onError={vi.fn()} />
        </RuntimeModelsProvider>,
      ),
    );
    await click(host.querySelector('.welcome-actions button'));
    const panel = host.querySelector<HTMLDetailsElement>('.setup-models')!;
    expect(panel.open).toBe(expanded);
    const groups = [...panel.querySelectorAll<HTMLDetailsElement>('.model-group')];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.open).toBe(expanded);
      expect(group.querySelector('.model-demo')).toBeTruthy();
      expect(group.querySelector('.model-action')).toBeTruthy();
    }
    await click(panel.querySelector('summary'));
    expect(panel.open).toBe(!expanded);
    expect(request.mock.calls).toEqual([['runtimeModules'], ['projects']]);
  },
);
it('includes semantic search and opens the optional catalogue without installing anything', async () => {
  await open('settings');
  expect(host.querySelector('.model-included')?.textContent).toContain('Recherche sémantique');
  expect(host.querySelectorAll('details[open]')).toHaveLength(0);
  expect(request.mock.calls).toEqual([['runtimeModules']]);
});
it('replays model examples and switches the reading sample without starting an installation', async () => {
  await open('settings');
  const groups = host.querySelectorAll('.model-group');
  expect(host.querySelectorAll('.model-demo')).toHaveLength(7);
  await click(groups[0].querySelector('summary'));
  const picker = groups[0].querySelector('.voice-picker')!;
  await act(async () => {
    const select = picker.querySelector('select')!;
    select.value = 'es';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(picker.querySelector('.demo-reading')?.getAttribute('lang')).toBe('es');
  expect(picker.textContent).toContain('El sol se levanta.');
  const scene = picker.querySelector('.demo-scene');
  await click(picker.querySelector('.demo-replay'));
  expect(picker.querySelector('.demo-scene')).not.toBe(scene);
  expect(request.mock.calls).toEqual([['runtimeModules']]);
  await open('settings');
  await open('reading');
  expect(host.querySelector('.model-demo')).toBeNull();
});

it('keeps the language choice while writing, navigating and showing another notification', async () => {
  vi.useFakeTimers();
  await open('reading');
  await choose('reading', 'readingEs');
  const manuscript = host.querySelector('textarea')!;
  manuscript.focus();
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(document.activeElement).toBe(manuscript);
  await open('settings');
  await open('settings');
  await open('reading');
  expect(control('reading')!.querySelector('select')!.value).toBe('readingEs');
  expect(control('reading')!.textContent).toContain('257');
  expect(host.querySelector('dialog')).toBeNull();
  expect(request.mock.calls).toEqual([['runtimeModules']]);
  await action('reading');
  expect(control('reading')!.textContent).toContain('Interrompre');
  await act(async () => finish());
  expect(control('reading')).toBeNull();
  expect(localStorage.getItem('ariane.reading.language')).toBe('es');
  expect(installed).toEqual(['semantic', 'readingEs']);
  expect(host.querySelector('.path-heading')!.textContent).toContain('Sauvegardé');
  expect(
    request.mock.calls.every(([type]) => ['runtimeModules', 'installRuntime'].includes(type)),
  ).toBe(true);
});
it('keeps an interrupted request available to retry and lets the user dismiss it independently', async () => {
  await open('reading');
  await open('voice');
  await action('voice');
  await action('voice');
  expect(control('voice')!.textContent).toContain('Réessayer');
  await action('voice');
  await act(async () => fail(new Error('Hors ligne')));
  expect(control('voice')!.querySelector('button')!.title).toBe('Hors ligne');
  await close('voice');
  expect(control('voice')).toBeNull();
  expect(control('reading')).toBeTruthy();
  expect(installed).toEqual(['semantic']);
});
it('tracks a settings download separately from a different pending voice choice', async () => {
  await open('reading');
  await choose('reading', 'readingEs');
  await open('settings');
  await click(host.querySelector('.voice-picker .model-action'));
  await open('settings');
  expect(control('readingFr')!.textContent).toContain('Interrompre');
  expect(control('reading')!.querySelector('select')!.value).toBe('readingEs');
  await act(async () => finish());
  expect(control('readingFr')).toBeNull();
  expect(control('reading')).toBeTruthy();
  await close('reading');
  expect(installed).toEqual(['semantic', 'readingFr']);
});
