// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Source, SaveState } from '../src/app/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ native: true, request }));
import { useEnrichment } from '../src/enrichment/useEnrichment';
import { EnrichmentView } from '../src/enrichment/EnrichmentView';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

it('waits for a saved idle state, cancels typing, and ignores results after project changes', async () => {
  vi.useFakeTimers();
  request.mockReset();
  const refreshed = vi.fn();
  let complete!: (result: { changed: boolean }) => void;
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue({ changed: false });
  function Harness({
    path,
    save = 'saved',
    enabled = true,
  }: {
    path: string;
    save?: SaveState;
    enabled?: boolean;
  }) {
    useEnrichment(path, enabled, save, 0, 0, refreshed);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness path="a" />));
    await act(async () => vi.advanceTimersByTimeAsync(1900));
    expect(request).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness path="a" save="editing" />));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(request).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness path="a" />));
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(request).toHaveBeenCalledWith('enrich', { projectPath: 'a' });
    await act(async () => root.render(<Harness path="b" />));
    await act(async () => complete({ changed: true }));
    expect(refreshed).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(request).toHaveBeenLastCalledWith('enrich', { projectPath: 'b' });
    await act(async () => root.render(<Harness path="b" enabled={false} />));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
  }
});

it('renders a single live reference, navigates by node ID, and masks only that instance', async () => {
  request.mockReset();
  const source: Source = {
    id: 'note',
    title: 'Claude Nougaro',
    path: 'Claude Nougaro.md',
    vaultId: 'v',
    fingerprint: 'x',
    kind: 'Personne',
    aliases: [],
    tags: [],
    fields: {},
    text: 'Note originale',
    page: null,
    matched: null,
    score: 0,
    enrichment: {
      fields: [],
      ignored: 0,
      passages: [
        {
          id: 'reference',
          node: 'canonical-node',
          section: 'scene',
          sectionTitle: 'Chapitre',
          line: 4,
          quote: 'Claude Nougaro chante.',
          uncertain: false,
          related: [],
        },
      ],
    },
  };
  const onLocate = vi.fn(),
    onChange = vi.fn();
  request.mockResolvedValue({ ...source, enrichment: { fields: [], passages: [], ignored: 1 } });
  const host = document.createElement('div'),
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <EnrichmentView
          source={source}
          projectPath="project"
          onChange={onChange}
          onRead={vi.fn()}
          onLocate={onLocate}
        />,
      ),
    );
    expect(host.querySelectorAll('blockquote')).toHaveLength(1);
    await act(async () => (host.querySelector('.source-link') as HTMLButtonElement).click());
    expect(onLocate).toHaveBeenCalledWith('scene', 'canonical-node', 'Claude Nougaro chante.');
    const changed = {
      ...source,
      enrichment: {
        ...source.enrichment!,
        passages: [{ ...source.enrichment!.passages[0], quote: 'Claude Nougaro compose.' }],
      },
    };
    await act(async () =>
      root.render(
        <EnrichmentView
          source={changed}
          projectPath="project"
          onChange={onChange}
          onRead={vi.fn()}
          onLocate={onLocate}
        />,
      ),
    );
    expect(host.textContent).toContain('Claude Nougaro compose.');
    expect(host.textContent).not.toContain('Claude Nougaro chante.');
    await act(async () => (host.querySelector('.enrichment-ignore') as HTMLButtonElement).click());
    expect(request).toHaveBeenCalledWith('ignoreEnrichment', {
      projectPath: 'project',
      source: 'note',
      evidence: 'reference',
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.some(([type]) => type === 'save' || type === 'createVaultEntity'),
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
