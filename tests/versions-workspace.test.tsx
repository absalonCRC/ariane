// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Project, Version } from '../src/app/types';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { request } from '../src/app/client';
import { History } from '../src/history/History';
let root: Root | undefined, host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  localStorage.clear();
});
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )!;
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function render(p: Project) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  function Harness() {
    const [project, setProject] = useState(p);
    return (
      <History
        project={project}
        active={p.sections[0].id}
        flush={async () => {}}
        onRestore={setProject}
        onApply={vi.fn()}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );
  }
  await act(async () => root!.render(<Harness />));
}
it('opens without making a checkpoint and promotes a capture through the session history', async () => {
  const p = await request<Project>('create', { path: 'history-ui', name: 'Roman' }),
    id = p.sections[0].id;
  await request('save', { patches: [{ id, revision: 0, text: 'Premier texte.' }] });
  const before = await request<Version[]>('versions');
  await render(await request<Project>('open', { path: p.path }));
  expect(await request('versions')).toEqual(before);
  await act(async () => button('Historique').click());
  expect(host.querySelector('.version-session')).not.toBeNull();
  await act(async () => host.querySelector('summary')!.click());
  await act(async () => button('Nommer cette version').click());
  await input(host.querySelector('input[required]')!, 'Premier jet');
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  const after = await request<Version[]>('versions');
  expect(after).toHaveLength(before.length);
  expect(after[0]).toMatchObject({ id: before[0].id, name: 'Premier jet', automatic: false });
  expect(host.textContent).toContain('Premier jet');
});
it('creates a variant and opens a review, requiring an explicit conflict choice', async () => {
  const p = await request<Project>('create', { path: 'variant-ui', name: 'Roman' }),
    id = p.sections[0].id;
  await request('save', { patches: [{ id, revision: 0, text: 'Origine.' }] });
  await render(await request<Project>('open', { path: p.path }));
  await act(async () => button('Variantes').click());
  await input(host.querySelector('.variant-create input')!, 'Autre fin');
  await act(async () =>
    host
      .querySelector('.variant-create')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain('Variante créée.');
  let live = await request<Project>('open', { path: p.path });
  await request('save', {
    patches: [{ id, revision: live.sections[0].revision, text: 'Variante.' }],
  });
  await request('switchBranch', { projectPath: p.path, id: 'main' });
  live = await request<Project>('open', { path: p.path });
  await request('save', {
    patches: [{ id, revision: live.sections[0].revision, text: 'Principal.' }],
  });
  // Remount against the changed actual workspace as the native activation would.
  await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  await render(await request<Project>('open', { path: p.path }));
  await act(async () => button('Variantes').click());
  await act(async () => button('Relire et intégrer').click());
  expect(button('Intégrer au texte principal').disabled).toBe(true);
  expect(host.textContent).toContain('À départager');
  const incoming = [...host.querySelectorAll<HTMLLabelElement>('.merge-choices label')].find((l) =>
    l.textContent?.includes('Reprendre la variante'),
  )!;
  await act(async () => incoming.querySelector<HTMLInputElement>('input')!.click());
  expect(button('Intégrer au texte principal').disabled).toBe(false);
  await act(async () => button('Intégrer au texte principal').click());
  expect(host.textContent).toContain('Variante intégrée.');
  expect((await request<Project>('bootstrap')).sections[0].text).toBe('Variante.');
});

it('previews and integrates only the selected passages', async () => {
  const p = await request<Project>('create', { path: 'selective-ui', name: 'Roman' });
  const id = p.sections[0].id;
  const original = 'Aube.\n\nMilieu.\n\nSoir.';
  await request('save', { patches: [{ id, revision: 0, text: original }] });
  await request('createBranch', { projectPath: p.path, name: 'Autre direction' });
  const variant = await request<Project>('open', { path: p.path });
  await request('save', {
    patches: [
      { id, revision: variant.sections[0].revision, text: 'Crépuscule.\n\nMilieu.\n\nNuit.' },
    ],
  });
  await request('switchBranch', { projectPath: p.path, id: 'main' });
  await render(await request<Project>('open', { path: p.path }));
  await act(async () => button('Variantes').click());
  await act(async () => button('Relire et intégrer').click());
  const passages = host.querySelectorAll<HTMLInputElement>('.merge-passages input');
  expect(passages).toHaveLength(2);
  await act(async () => passages[0].click());
  const proposal = host.querySelectorAll('.merge-prose-pair .diff-prose')[1].textContent;
  expect(proposal).toContain('Aube.');
  expect(proposal).not.toContain('Crépuscule.');
  expect(proposal).toContain('Nuit.');
  const includeScene = host.querySelector<HTMLInputElement>('.merge-entry-heading input')!;
  await act(async () => includeScene.click());
  expect(host.querySelectorAll('.merge-prose-pair .diff-prose')[1].textContent).toContain('Soir.');
  await act(async () => includeScene.click());
  await act(async () => button('Intégrer au texte principal').click());
  expect((await request<Project>('bootstrap')).sections[0].text).toBe('Aube.\n\nMilieu.\n\nNuit.');
});
