// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePassageSuggestions } from '../src/enrichment/usePassageSuggestions';
import { rebaseEntities } from '../src/enrichment/entityBatches';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { entityMarks, setEntityMarks } from '../src/editor/entities';
import type { Section, SaveState } from '../src/app/types';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const onSources = vi.fn(),
  onStatus = vi.fn();
const parts = ['Toulouse est une ville.\n', 'Lyon est une ville.\n', 'Paris est une ville.'];
function section(middle = parts[1]): Section {
  return {
    id: 's',
    title: 'Texte',
    parent: null,
    position: 0,
    kind: 'scene',
    synopsis: '',
    status: '',
    goal: 0,
    revision: middle === parts[1] ? 1 : 2,
    text: parts[0] + middle + parts[2],
    outline: {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: parts[0].length },
        { id: 'c', parent: null, start: parts[0].length + middle.length },
      ],
    },
  };
}
function Harness({
  s,
  status = 'saved',
  version = '0',
  path = 'project',
}: {
  s: Section;
  status?: SaveState;
  version?: string;
  path?: string;
}) {
  const entries = usePassageSuggestions(
    path,
    [s],
    { from: 0, text: s.text, paragraphs: [], allowEnd: true },
    status,
    true,
    3,
    version,
    onSources,
    onStatus,
  );
  return (
    <>
      {entries
        .flatMap((v) => v.sources)
        .map((source) => (
          <span key={source.id}>{source.title}</span>
        ))}
    </>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  onSources.mockReset();
  onStatus.mockReset();
  request.mockReset();
  request.mockImplementation(async (_command, { text }) => [
    { id: text, title: text.split(' ')[0] },
  ]);
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

it('keeps the first and third blocks visible and requests only the edited middle block', async () => {
  await act(async () => root.render(<Harness s={section()} />));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(request.mock.calls.map(([, args]) => args.text)).toEqual(parts);
  expect(host.textContent).toBe('ToulouseLyonParis');
  const changed = section('😀 Lyon a changé.\n');
  await act(async () => root.render(<Harness s={changed} status="editing" />));
  expect(host.textContent).toBe('ToulouseParis');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(request).toHaveBeenCalledTimes(3);
  await act(async () => root.render(<Harness s={changed} />));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(request.mock.calls.map(([, args]) => args.text)).toEqual([
    ...parts,
    '😀 Lyon a changé.\n',
  ]);
  expect(host.textContent).toBe('Toulouse😀Paris');
});

it('keeps valid results while a source refresh is pending and rejects a former-project response', async () => {
  await act(async () => root.render(<Harness s={section()} />));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Harness s={section()} version="1" />));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(host.textContent).toBe('ToulouseLyonParis');
  await act(async () => root.render(<Harness s={section()} path="other-project" />));
  expect(host.textContent).toBe('');
  await act(async () => finish([{ id: 'old', title: 'Wrong project' }]));
  expect(host.textContent).not.toContain('Wrong project');
});

it('rebases entities by unchanged outline identity after Unicode edits and reorders', () => {
  const before = section();
  const mentions = before.outline!.nodes.map((n) => ({
    from: n.start,
    to: n.start + 4,
    title: n.id,
    kind: 'place',
    sourceId: n.id,
    entityId: null,
  }));
  const batch = { section: 's', revision: 1, text: before.text, outline: before.outline, mentions };
  const after = section('😀 Un long passage transformé.\n');
  const rebased = rebaseEntities(batch, after);
  expect(rebased.mentions.map((m) => m.title)).toEqual(['a', 'c']);
  expect(rebased.mentions[1].from).toBe(after.outline!.nodes[2].start);
  expect(rebased.revision).toBe(2);
});

it('remaps editor marks outside the edited line and hides their decorations without losing data', () => {
  let state = EditorState.create({ doc: 'Toulouse\nLyon\nParis', extensions: entityMarks });
  const mentions = [0, 9, 14].map((from, i) => ({
    from,
    to: from + [8, 4, 5][i],
    title: String(i),
    kind: 'place',
    sourceId: 'source',
    entityId: null,
    section: 's',
    revision: 1,
  }));
  state = state.update({ effects: setEntityMarks.of({ mentions, colors: {} }) }).state;
  state = state.update({ changes: { from: 10, insert: '😀' } }).state;
  expect(state.field(entityMarks).mentions.map((m) => m.from)).toEqual([0, 16]);
  const countMarks = (value: EditorState) =>
    value
      .facet(EditorView.decorations)
      .reduce(
        (total, decoration) => total + (typeof decoration === 'function' ? 0 : decoration.size),
        0,
      );
  expect(countMarks(state)).toBe(2);
  state = state.update({
    effects: setEntityMarks.of({ ...state.field(entityMarks), hidden: true }),
  }).state;
  expect(state.field(entityMarks).mentions).toHaveLength(2);
  expect(countMarks(state)).toBe(0);
  state = state.update({
    effects: setEntityMarks.of({ ...state.field(entityMarks), hidden: false }),
  }).state;
  expect(countMarks(state)).toBe(2);
});
