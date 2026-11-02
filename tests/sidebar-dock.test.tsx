// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Presence } from '../src/components/Presence';
import { SidebarDock } from '../src/components/SidebarDock';
import { Binder } from '../src/project/Binder';
import type { Project } from '../src/app/types';

it('keeps the same theme control available as the sidebar opens and closes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const project: Project = {
    path: 'dock-test',
    name: 'Manuscrit',
    sections: [],
    settings: {},
    recovered: false,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [expanded, setExpanded] = useState(true);
    const [dark, setDark] = useState(false);
    const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
    return (
      <>
        <button onClick={() => setExpanded((value) => !value)}>Changer la sidebar</button>
        <SidebarDock
          expanded={expanded}
          dark={dark}
          onToggleTheme={() => setDark((value) => !value)}
          onActionsHost={setActionsHost}
        />
        <Presence kind="sidebar">
          {expanded && (
            <Binder
              project={project}
              active={null}
              footerTarget={actionsHost}
              onSelect={() => {}}
              onSurface={() => {}}
              onClose={() => setExpanded(false)}
              onAdd={() => {}}
              onMove={() => {}}
              onContinuous={() => {}}
            />
          )}
        </Presence>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const dock = host.querySelector<HTMLElement>('.binder-footer')!;
    const theme = dock.querySelector<HTMLButtonElement>('[role="switch"]')!;
    const toggle = host.querySelector<HTMLButtonElement>('button')!;
    expect([...dock.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')))
      .toEqual(['Thème sombre', 'Versions', 'Corbeille', 'Paramètres']);
    await act(async () => dock.querySelector<HTMLButtonElement>('[aria-label="Corbeille"]')!.click());
    expect(dock.querySelector('[aria-label="Corbeille"]')?.getAttribute('aria-pressed')).toBe('true');
    const versions = dock.querySelector<HTMLButtonElement>('[aria-label="Versions"]')!;
    await act(async () => {
      versions.focus();
      toggle.click();
    });
    const actions = dock.querySelector<HTMLElement>('.binder-footer-project')!;
    expect(dock.dataset.expanded).toBe('false');
    expect(actions.hasAttribute('inert')).toBe(true);
    expect(actions.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(theme);
    await act(async () => theme.click());
    expect(theme.getAttribute('aria-checked')).toBe('true');
    await act(async () => vi.advanceTimersByTime(200));
    expect(dock.querySelectorAll('button')).toHaveLength(1);
    await act(async () => toggle.click());
    expect(dock.dataset.expanded).toBe('true');
    expect(dock.querySelector('[role="switch"]')).toBe(theme);
    expect(theme.getAttribute('aria-checked')).toBe('true');
    expect(actions.hasAttribute('inert')).toBe(false);
    expect(dock.querySelectorAll('button')).toHaveLength(4);
    await act(async () => theme.click());
    expect(theme.getAttribute('aria-checked')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
