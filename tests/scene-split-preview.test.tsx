// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Palette } from '../src/app/Palette';
import { matchesSceneSplit, sceneSplitPreview } from '../src/project/splitPreview';
import type { Project } from '../src/contracts/project';

function project(text: string): Project {
  return {
    name: 'Témoin',
    path: 'synthetic',
    settings: {},
    recovered: false,
    sections: [
      {
        id: 'scene',
        kind: 'scene',
        title: 'Scène',
        text,
        parent: null,
        position: 0,
        revision: 2,
        synopsis: '',
        status: '',
        goal: 0,
      },
    ],
  };
}

it('prévisualise exactement la coupe UTF-16 et refuse un contexte périmé', () => {
  const sample = project('Le phare 🌿 et la mer.');
  const caret = { section: 'scene', from: 'Le phare 🌿'.length, to: 'Le phare 🌿'.length };
  const preview = sceneSplitPreview(sample, caret)!;
  expect(preview.before + preview.after).toBe(sample.sections[0].text);
  expect(preview.before).toBe('Le phare 🌿');
  expect(preview.after).toBe(' et la mer.');
  expect(
    sceneSplitPreview(sample, { ...caret, from: caret.from - 1, to: caret.to - 1 }),
  ).toBeNull();
  expect(sceneSplitPreview(sample, { ...caret, from: 0, to: 0 })).toBeNull();
  expect(sceneSplitPreview(sample, { ...caret, to: caret.to + 1 })).toBeNull();
  expect(matchesSceneSplit(sample, preview)).toBe(true);
  expect(matchesSceneSplit(project(sample.sections[0].text), preview)).toBe(false);
  sample.sections[0].text += ' Le vent.';
  expect(matchesSceneSplit(sample, preview)).toBe(false);
});

it('annule dans la palette et exécute uniquement après validation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const panel = document.createElement('div');
  document.body.append(host, panel);
  const root = createRoot(host);
  const close = vi.fn(),
    split = vi.fn(),
    prepare = vi.fn();
  const render = (open: boolean) =>
    root.render(
      <Palette
        open={open}
        panel={panel}
        searchScope="synthetic"
        onOpen={vi.fn()}
        onOpenPanel={prepare}
        onClose={close}
        onTextSearch={vi.fn()}
        onNextMatch={vi.fn()}
        commands={[
          {
            id: 'split-scene',
            label: 'Scinder la scène',
            preview: { before: 'Le phare 🌿', after: ' et la mer.' },
            action: split,
          },
        ]}
      />,
    );
  const key = (value: string) =>
    panel
      .querySelector('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  try {
    await act(async () => render(true));
    expect(prepare).toHaveBeenCalledOnce();
    expect(panel.querySelector('#palette-command-preview')?.textContent).toContain('Le phare 🌿');
    await act(async () => key('Escape'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(split).not.toHaveBeenCalled();
    await act(async () => render(false));
    await act(async () => render(true));
    await act(async () => key('Enter'));
    expect(close).toHaveBeenCalledTimes(2);
    expect(split).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    panel.remove();
  }
});
