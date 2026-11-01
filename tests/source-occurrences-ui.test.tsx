// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourceOccurrences } from '../src/sources/SourceOccurrences';
import type { Section, Source } from '../src/app/types';

it('shows separate reference and name counts while keeping precise navigation', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const source = {
    id: '0123456789-entity',
    fingerprint: 'abcdef012345',
    vaultId: 'v',
    title: 'Élise',
    aliases: [],
    kind: 'Personne',
    fields: {},
    tags: [],
    text: '',
    path: 'Élise.md',
    matched: null,
    page: null,
    score: 0,
  } satisfies Source;
  const text = 'Élise. [@source-0123456789-abcdef01]';
  const section = {
    id: 'scene',
    title: 'Scène',
    text,
    parent: null,
    position: 0,
    kind: 'scene',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  } satisfies Section;
  const host = document.createElement('div');
  const root = createRoot(host);
  const locate = vi.fn();
  try {
    await act(async () =>
      root.render(<SourceOccurrences source={source} sections={[section]} onLocate={locate} />),
    );
    expect(host.querySelector('summary')?.textContent).toMatch(
      /Références explicites\s*1.*Mentions du nom\s*1/,
    );
    expect(host.textContent).toContain('ne confirment ni l’identité ni une association');
    const buttons = host.querySelectorAll<HTMLButtonElement>('.source-occurrences > button');
    expect(buttons).toHaveLength(2);
    await act(async () => buttons[0].click());
    expect(locate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reference', from: 7, to: text.length }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});
