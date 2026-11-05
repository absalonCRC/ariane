// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Presence } from '../src/components/Presence';
import { SidebarDock } from '../src/components/SidebarDock';
import { Binder } from '../src/project/Binder';
import type { Project } from '../src/contracts/project';
import { BinderActions } from '../src/project/BinderActions';

it('reveals the actions after a sustained theme hover without opening the sidebar', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    surface = vi.fn();
  try {
    await act(async () =>
      root.render(
        <SidebarDock expanded={false} dark={false} onToggleTheme={() => {}}>
          <BinderActions trash={false} onSurface={surface} onTrash={() => {}} />
        </SidebarDock>,
      ),
    );
    const dock = host.querySelector<HTMLElement>('.binder-footer')!,
      theme = host.querySelector<HTMLButtonElement>('.theme-switcher')!,
      actions = host.querySelector('.binder-footer-project')!;
    const over = () => theme.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    const out = () =>
      theme.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
      );
    await act(async () => {
      over();
      vi.advanceTimersByTime(400);
    });
    expect(actions.hasAttribute('inert')).toBe(true);
    await act(async () => {
      out();
      vi.advanceTimersByTime(700);
    });
    expect(dock.dataset.expanded).toBe('false');
    await act(async () => {
      over();
      vi.advanceTimersByTime(500);
    });
    expect(dock.dataset.expanded).toBe('true');
    expect(dock.dataset.sidebarOpen).toBe('false');
    expect(actions.hasAttribute('inert')).toBe(false);
    expect(host.querySelector('#project-sidebar')).toBeNull();
    await act(async () => {
      out();
      vi.advanceTimersByTime(200);
    });
    expect(dock.dataset.expanded).toBe('false');
    await act(async () => {
      over();
      vi.advanceTimersByTime(500);
    });
    expect(dock.dataset.expanded).toBe('true');
    const tags = host.querySelector<HTMLButtonElement>('[aria-label="Smart-tags"]')!;
    await act(async () => {
      tags.focus();
      tags.click();
    });
    expect(surface).toHaveBeenCalledWith('tags');
    expect(dock.dataset.expanded).toBe('false');
    expect(document.activeElement).toBe(theme);
    await act(async () => {
      theme.blur();
      vi.advanceTimersByTime(200);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      theme.focus();
    });
    expect(dock.dataset.expanded).toBe('true');
    await act(async () =>
      theme.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(dock.dataset.expanded).toBe('false');
    expect(document.activeElement).toBe(theme);
    await act(async () => {
      theme.blur();
      over();
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    host.remove();
    vi.useRealTimers();
  }
});

it('ignores touch hover and cancels a pending reveal when the dock becomes busy', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (busy = false) => (
    <SidebarDock expanded={false} dark={false} busy={busy} onToggleTheme={() => {}}>
      <button>Action</button>
    </SidebarDock>
  );
  try {
    await act(async () => root.render(render()));
    const theme = host.querySelector('.theme-switcher')!;
    const touch = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    await act(async () => {
      theme.dispatchEvent(touch);
      vi.advanceTimersByTime(600);
    });
    expect(host.querySelector<HTMLElement>('.binder-footer')!.dataset.expanded).toBe('false');
    await act(async () => theme.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    await act(async () => root.render(render(true)));
    await act(async () => vi.advanceTimersByTime(600));
    expect(host.querySelector<HTMLElement>('.binder-footer')!.dataset.expanded).toBe('false');
    expect(host.querySelector('.binder-footer')?.hasAttribute('inert')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});

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
    expect(
      [...dock.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Thème sombre', 'Smart-tags', 'Versions', 'Corbeille', 'Paramètres']);
    await act(async () =>
      dock.querySelector<HTMLButtonElement>('[aria-label="Corbeille"]')!.click(),
    );
    expect(dock.querySelector('[aria-label="Corbeille"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
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
    expect(dock.querySelectorAll('button')).toHaveLength(5);
    await act(async () => theme.click());
    expect(theme.getAttribute('aria-checked')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
