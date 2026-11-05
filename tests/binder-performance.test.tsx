// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Binder } from '../src/project/Binder';
import { visibleTree } from '../src/project/visibleTree';
import type { Section } from '../src/contracts/project';
const sections: Section[] = Array.from({ length: 2000 }, (_, i) => ({
  id: String(i),
  parent: null,
  position: i,
  title: `Scène ${i}`,
  text: '',
  kind: 'scene',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
}));
it('limits DOM rows and lets keyboard navigation reach the last section', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Binder
          project={{ path: 'test', name: 'Test', sections, settings: {}, recovered: false }}
          active="0"
          onSelect={select}
          onSurface={() => {}}
          onClose={() => {}}
          onAdd={() => {}}
          onMove={() => {}}
          onContinuous={() => {}}
        />,
      ),
    );
    expect(host.querySelectorAll('.tree-row').length).toBeLessThan(35);
    const first = host.querySelector<HTMLButtonElement>('.tree-title')!;
    await act(async () => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.activeElement?.textContent).toBe('Scène 1999');
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(select).toHaveBeenLastCalledWith('1999');
    expect(host.querySelectorAll('.tree-row').length).toBeLessThan(35);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('preserves sibling order and removes only collapsed descendants', () => {
  const values = [
    { ...sections[0], kind: 'folder' as const },
    { ...sections[1], parent: '0' },
    sections[2],
  ];
  expect(visibleTree(values, new Set()).map((r) => [r.section.id, r.depth])).toEqual([
    ['0', 0],
    ['1', 1],
    ['2', 0],
  ]);
  expect(visibleTree(values, new Set(['0'])).map((r) => r.section.id)).toEqual(['0', '2']);
});
