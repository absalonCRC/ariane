// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Section } from '../src/contracts/project';
import { manuscriptSummary, readIdentity, identityKey } from '../src/profile/model';
import { WriterProfile } from '../src/profile/WriterProfile';

const scene = (id: string, text: string, patch: Partial<Section> = {}): Section => ({
  id,
  text,
  kind: 'scene',
  parent: null,
  position: 0,
  title: id,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
  ...patch,
});
it('counts only manuscript text and caps each scene contribution to its own goal', () => {
  const result = manuscriptSummary([
    scene('one', 'un deux trois quatre', { goal: 2 }),
    scene('two', 'cinq', { goal: 3 }),
    scene('outside', 'six sept', { included: false, goal: 100 }),
    scene('trash', 'huit neuf', { trashed: true, goal: 100 }),
  ]);
  expect(result).toEqual({ words: 5, scenes: 2, chapters: 0, goal: 5, goalWords: 3, goals: 2 });
  expect(manuscriptSummary([]).words).toBe(0);
});
it('handles malformed local identity and persists an edited pen name independently of a project', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.setItem(identityKey, '{bad');
  expect(readIdentity()).toEqual({ name: '', intention: '' });
  const show = HTMLDialogElement.prototype.showModal, hide = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    close = vi.fn(),
    navigate = vi.fn(),
    fail = vi.fn();
  try {
    await act(async () =>
      root.render(
        <WriterProfile
          project={{
            path: 'synthetic',
            name: 'Roman',
            sections: [],
            settings: {},
            recovered: false,
          }}
          onClose={close}
          onError={fail}
          onNavigate={navigate}
        />,
      ),
    );
    const edit = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Modifier le profil',
    )!;
    await act(async () => edit.click());
    const input = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Camille',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(readIdentity().name).toBe('Camille');
    expect(host.querySelector('.writer-introduction h2')?.textContent).toBe('Camille');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem(identityKey);
    HTMLDialogElement.prototype.showModal = show;
    HTMLDialogElement.prototype.close = hide;
    vi.restoreAllMocks();
  }
});
