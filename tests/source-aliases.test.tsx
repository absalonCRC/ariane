// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Source } from '../src/contracts/sources';
import { SourceAliases } from '../src/sources/SourceAliases';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const source = {
  id: 's',
  vaultId: 'v',
  path: 'Lieux/Toulouse.md',
  title: 'Toulouse',
  kind: 'Lieu',
  aliases: ['Tolosa'],
  fingerprint: 'original',
} as Source;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  root = createRoot(host);
  request.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it('saves aliases on the same entity and notifies the catalog refresh', async () => {
  const change = vi.fn();
  request.mockImplementation(async (type) =>
    type === 'vaults'
      ? [{ id: 'v', owned: true, available: true }]
      : { ...source, aliases: ['Tolosa', 'Ville rose'], fingerprint: 'updated' },
  );
  await act(async () =>
    root.render(<SourceAliases source={source} projectPath="/project" onChange={change} />),
  );
  const input = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'Tolosa\nVille rose',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('button')!.click());
  expect(request).toHaveBeenCalledWith('updateSourceAliases', {
    projectPath: '/project',
    source: 's',
    fingerprint: 'original',
    aliases: ['Tolosa', 'Ville rose'],
  });
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({ id: 's', aliases: ['Tolosa', 'Ville rose'] }),
  );
});
it('shows external aliases without an editing control', async () => {
  request.mockResolvedValue([{ id: 'v', owned: false, available: true }]);
  await act(async () =>
    root.render(<SourceAliases source={source} projectPath="/project" onChange={vi.fn()} />),
  );
  expect(host.textContent).toContain('Tolosa');
  expect(host.querySelector('textarea')).toBeNull();
});
