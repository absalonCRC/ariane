// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useExitPresence } from '../src/components/useExitPresence';

it('keeps closing content briefly, cancels its removal on reopen, and removes it when switching panels', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Example() {
    const [open, setOpen] = useState(false);
    const [retain, setRetain] = useState(true);
    const present = useExitPresence(open, retain);
    return (
      <>
        <button onClick={() => setOpen((value) => !value)}>toggle</button>
        <button onClick={() => setRetain(false)}>switch</button>
        {present && <div data-visible={open}>content</div>}
      </>
    );
  }
  try {
    await act(async () => root.render(<Example />));
    const buttons = host.querySelectorAll('button');
    await act(async () => buttons[0].click());
    await act(async () => buttons[0].click());
    expect(host.querySelector('[data-visible="false"]')).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(150);
      buttons[0].click();
    });
    await act(async () => vi.advanceTimersByTime(400));
    expect(host.querySelector('[data-visible="true"]')).not.toBeNull();
    await act(async () => buttons[0].click());
    await act(async () => vi.advanceTimersByTime(320));
    expect(host.querySelector('[data-visible]')).toBeNull();
    await act(async () => buttons[0].click());
    await act(async () => {
      buttons[0].click();
      buttons[1].click();
    });
    expect(host.querySelector('[data-visible]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
