// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourceOccurrences } from '../src/sources/SourceOccurrences';
import { Reader } from '../src/sources/Reader';
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
    expect(host.querySelector('summary')?.getAttribute('aria-label')).toBe(
      'Dans le manuscrit : 1 référence explicite et 1 mention du nom',
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

it('keeps one reference block after source text when the reader rerenders', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const source = {
    id: '0123456789-entity',
    fingerprint: 'abcdef012345',
    vaultId: 'v',
    title: 'Élise',
    aliases: [],
    kind: 'Note',
    fields: {},
    tags: [],
    text: 'Le texte de la source.',
    path: 'Élise.md',
    matched: null,
    page: null,
    score: 0,
  } satisfies Source;
  const section = {
    id: 'scene',
    title: 'Scène',
    text: 'Élise.',
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
  const props = {
    source,
    sections: [section],
    onOccurrence: vi.fn(),
    onClose: vi.fn(),
    projectPath: 'project',
    onChange: vi.fn(),
    onRead: vi.fn(),
    onLocate: vi.fn(),
  };
  try {
    await act(async () => root.render(<Reader {...props} />));
    await act(async () =>
      root.render(<Reader {...props} sections={[{ ...section, text: 'Élise revient.' }]} />),
    );
    expect(host.querySelectorAll('.source-occurrences')).toHaveLength(1);
    const prose = host.querySelector('.read-prose');
    const references = host.querySelector('.source-occurrences');
    expect(prose?.textContent).toContain('Le texte de la source.');
    expect(
      prose!.compareDocumentPosition(references!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
  }
});
