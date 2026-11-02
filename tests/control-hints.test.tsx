// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControlHints } from '../src/components/ControlHints';
import { ContextMenuProvider, useContextMenu } from '../src/components/ContextMenu';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it('shows icon-only labels on keyboard focus and dismisses them with Escape', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <button aria-label="Menu du projet">
          <svg />
        </button>
        <button aria-label="Enregistrer">Enregistrer</button>
      </>,
    ),
  );
  const [icon, labelled] = host.querySelectorAll('button');
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    icon.focus();
    vi.advanceTimersByTime(0);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Menu du projet');
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(document.querySelector('.control-hint')).toBeNull();
  expect(document.activeElement).toBe(icon);
  await act(async () => {
    labelled.focus();
    vi.advanceTimersByTime(400);
  });
  expect(document.querySelector('.control-hint')).toBeNull();
});

it('uses explicit short hints after a hover delay and restores inherited native titles', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <div title="Titre de la section">
          <button aria-label="Ajouter dans la section" data-tooltip="Ajouter">
            <svg />
          </button>
        </div>
      </>,
    ),
  );
  const button = host.querySelector('button')!;
  await act(async () => button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
  expect(button.getAttribute('title')).toBe('');
  await act(async () => vi.advanceTimersByTime(349));
  expect(document.querySelector('.control-hint')).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(document.querySelector('.control-hint')?.textContent).toBe('Ajouter');
  await act(async () =>
    button.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    ),
  );
  expect(document.querySelector('.control-hint')).toBeNull();
  expect(button.hasAttribute('title')).toBe(false);
});

it('shows an already-hovered control immediately on keyboard focus and keeps it when the pointer leaves', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <button aria-label="Versions">
          <svg />
        </button>
      </>,
    ),
  );
  const button = host.querySelector('button')!;
  await act(async () => button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    button.focus();
    vi.advanceTimersByTime(0);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Versions');
  await act(async () =>
    button.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    ),
  );
  expect(document.querySelector('.control-hint')?.textContent).toBe('Versions');
});

it('places hints inside modal dialogs and restores titles when unmounted', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <dialog open>
          <button aria-label="Fermer" title="Fermer le dialogue">
            <svg />
          </button>
        </dialog>
      </>,
    ),
  );
  const dialog = host.querySelector('dialog')!;
  const button = host.querySelector('button')!;
  const matches = dialog.matches.bind(dialog);
  vi.spyOn(dialog, 'matches').mockImplementation(
    (selector) => selector === ':modal' || matches(selector),
  );
  await act(async () => {
    button.focus();
    vi.advanceTimersByTime(0);
  });
  expect(dialog.querySelector('.control-hint')?.textContent).toBe('Fermer le dialogue');
  expect(button.getAttribute('title')).toBe('');
  await act(async () =>
    root.render(
      <dialog open>
        <button aria-label="Fermer" title="Fermer le dialogue">
          <svg />
        </button>
      </dialog>,
    ),
  );
  expect(button.getAttribute('title')).toBe('Fermer le dialogue');
});

it('does not show a hover hint for touch input', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <button aria-label="Versions">
          <svg />
        </button>
      </>,
    ),
  );
  const event = new MouseEvent('pointerover', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  await act(async () => {
    host.querySelector('button')!.dispatchEvent(event);
    vi.advanceTimersByTime(400);
  });
  expect(document.querySelector('.control-hint')).toBeNull();
});

it('hides the trigger hint while its menu is open and restores it after closing', async () => {
  const view = (open: boolean) => (
    <>
      <ControlHints />
      <button aria-label="Rechercher" aria-expanded={open} aria-controls="search-panel">
        <svg />
      </button>
    </>
  );
  await act(async () => root.render(view(false)));
  const button = host.querySelector('button')!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(350);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Rechercher');
  await act(async () => root.render(view(true)));
  expect(document.querySelector('.control-hint')).toBeNull();
  await act(async () => {
    button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    button.focus();
    vi.advanceTimersByTime(400);
  });
  expect(document.querySelector('.control-hint')).toBeNull();
  await act(async () => root.render(view(false)));
  await act(async () => {
    button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(350);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Rechercher');
});

it('suppresses the hint for an open context menu trigger', async () => {
  function Trigger() {
    const open = useContextMenu();
    return (
      <button
        aria-label="Ajouter"
        aria-haspopup="menu"
        onClick={(event) =>
          open(event, { title: 'Ajouter', groups: [[{ label: 'Scène', run: () => {} }]] })
        }
      >
        <svg />
      </button>
    );
  }
  await act(async () =>
    root.render(
      <ContextMenuProvider>
        <ControlHints />
        <Trigger />
      </ContextMenuProvider>,
    ),
  );
  const button = host.querySelector('button')!;
  await act(async () => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  await act(async () => {
    button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(400);
  });
  expect(document.querySelector('.control-hint')).toBeNull();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(button.hasAttribute('aria-expanded')).toBe(false);
});

it('keeps hints on expanded tree and sidebar controls', async () => {
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <button
          aria-label="Replier"
          aria-controls="project-sidebar"
          aria-expanded="true"
          data-hint-while-expanded
        >
          <svg />
        </button>
      </>,
    ),
  );
  await act(async () => {
    host.querySelector('button')!.focus();
    vi.advanceTimersByTime(0);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Replier');
});

it('anchors sidebar hints beside the pointer and follows it along either edge', async () => {
  const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150);
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
  try {
    await act(async () =>
      root.render(
        <>
          <ControlHints />
          <button aria-label="Replier" data-hint-placement="sidebar-edge" />
          <button aria-label="Déplier" data-hint-placement="sidebar-edge" />
        </>,
      ),
    );
    const [expanded, collapsed] = host.querySelectorAll('button');
    vi.spyOn(expanded, 'getBoundingClientRect').mockReturnValue({
      left: 261, right: 285, top: 36, bottom: 676, width: 24, height: 640,
      x: 261, y: 36, toJSON: () => ({}),
    });
    vi.spyOn(collapsed, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 24, top: 36, bottom: 676, width: 24, height: 640,
      x: 0, y: 36, toJSON: () => ({}),
    });
    await act(async () => {
      expanded.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientY: 200 }));
      vi.advanceTimersByTime(350);
    });
    let hint = document.querySelector<HTMLElement>('.control-hint')!;
    expect(hint.dataset.side).toBe('right');
    expect(hint.style.left).toBe('291px');
    expect(hint.style.top).toBe('185px');
    await act(async () =>
      expanded.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 500 })),
    );
    expect(hint.style.top).toBe('485px');
    await act(async () =>
      expanded.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 800 })),
    );
    expect(hint.style.top).toBe('649px');
    await act(async () => {
      expanded.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
      collapsed.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientY: 100 }));
      vi.advanceTimersByTime(350);
    });
    hint = document.querySelector<HTMLElement>('.control-hint')!;
    expect(hint.textContent).toBe('Déplier');
    expect(hint.style.left).toBe('30px');
    expect(hint.style.top).toBe('85px');
  } finally {
    width.mockRestore();
    height.mockRestore();
  }
});

it('keeps a sidebar hint inside a narrow window and centers it for keyboard focus', async () => {
  const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(150);
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
  vi.stubGlobal('innerWidth', 380);
  try {
    await act(async () =>
      root.render(
        <>
          <ControlHints />
          <button aria-label="Replier" data-hint-placement="sidebar-edge" />
        </>,
      ),
    );
    const button = host.querySelector('button')!;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 261, right: 285, top: 36, bottom: 676, width: 24, height: 640,
      x: 261, y: 36, toJSON: () => ({}),
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      button.focus();
      vi.advanceTimersByTime(0);
    });
    const hint = document.querySelector<HTMLElement>('.control-hint')!;
    expect(hint.dataset.side).toBe('left');
    expect(hint.style.left).toBe('105px');
    expect(hint.style.top).toBe('341px');
  } finally {
    width.mockRestore();
    height.mockRestore();
    vi.unstubAllGlobals();
  }
});
