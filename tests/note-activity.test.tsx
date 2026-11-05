// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNoteActivity } from '../src/notes/useNoteActivity';
import type { Requests, Responses } from '../src/contracts/requests';
import type { NoteEvent } from '../src/contracts/noteActivity';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('records all repeated user actions, deduplicates detections and does not replay historical notifications', async () => {
  let saved: NoteEvent[] = [];
  let id = 0;
  request.mockImplementation(async (type: string, args: Requests['recordNoteActivity']) => {
    if (type === 'noteActivity') return { items: [...saved], hasMore: false };
    const old = saved.find((e) => e.dedupKey === args.value.dedupKey);
    if (old) return { inserted: false, event: old };
    const event = { ...args.value, id: ++id, created: new Date().toISOString() };
    saved.unshift(event);
    return { inserted: true, event };
  });
  let activity!: ReturnType<typeof useNoteActivity>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    activity = useNoteActivity('project');
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await activity.record({ kind: 'detected', title: 'Élise', dedupKey: 'detected:e' });
      await activity.record({ kind: 'detected', title: 'Élise', dedupKey: 'detected:e' });
    });
    expect(saved).toHaveLength(1);
    expect(activity.latest?.kind).toBe('detected');
    await act(async () => {
      await activity.record({ kind: 'opened', title: 'Élise' });
      await activity.record({ kind: 'opened', title: 'Élise' });
    });
    expect(saved).toHaveLength(3);
    expect(activity.items).toHaveLength(3);
    await act(async () => root.unmount());
    const second = createRoot(document.createElement('div'));
    await act(async () => second.render(<Harness />));
    expect(activity.items).toHaveLength(3);
    expect(activity.latest).toBeNull();
    await act(async () => second.unmount());
  } finally {
    if (root) await act(async () => root.unmount());
  }
});
it('keeps failed writes available for retry and exit flush', async () => {
  request.mockImplementation(async (type: string, args: Requests['recordNoteActivity']) =>
    type === 'noteActivity'
      ? { items: [], hasMore: false }
      : { inserted: true, event: { ...args.value, id: 1, created: new Date().toISOString() } },
  );
  let activity!: ReturnType<typeof useNoteActivity>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    activity = useNoteActivity('p');
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    request.mockRejectedValueOnce(new Error('disque occupé'));
    await act(async () => {
      await activity.record({ kind: 'created', title: 'Carnet' });
    });
    expect(activity.error).toContain('disque occupé');
    await act(async () => activity.flush());
    expect(activity.items[0].title).toBe('Carnet');
    expect(activity.error).toBe('');
    const writes = request.mock.calls.filter((c) => c[0] === 'recordNoteActivity');
    expect(writes[0][1].value.dedupKey).toBe(writes[1][1].value.dedupKey);
  } finally {
    await act(async () => root.unmount());
  }
});
it('does not publish a delayed response after switching project', async () => {
  let resolve!: (value: Responses['noteActivity']) => void;
  request.mockImplementation(async (_type: string, args: { projectPath: string }) =>
    args.projectPath === 'old'
      ? new Promise((r) => {
          resolve = r;
        })
      : { items: [], hasMore: false },
  );
  let path = 'old',
    activity!: ReturnType<typeof useNoteActivity>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    activity = useNoteActivity(path);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    path = 'new';
    await act(async () => root.render(<Harness />));
    await act(async () =>
      resolve({
        items: [
          { id: 1, kind: 'created', title: 'Ancienne note', created: new Date().toISOString() },
        ],
        hasMore: false,
      }),
    );
    expect(activity.items).toEqual([]);
    expect(activity.latest).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it('records new detections and suggestions without counting their rerenders as new user actions', async () => {
  const { useNoteObservations } = await import('../src/notes/useNoteObservations');
  const record = vi.fn(async () => {});
  let args = {
    path: 'p',
    active: 's',
    sources: [{ id: 'note', title: 'Carnet' }],
    card: null,
    reader: null,
    batches: [{ section: 's', mentions: [{ title: 'Élise', from: 0, sourceId: 'note' }] }],
    result: null,
    activity: { record },
  } as unknown as Parameters<typeof useNoteObservations>[0];
  const root = createRoot(document.createElement('div'));
  function Harness() {
    useNoteObservations(args);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(record.mock.calls.map((call) => (call as unknown as [NoteEvent])[0].kind)).toEqual([
      'detected',
      'suggested',
    ]);
    record.mockClear();
    await act(async () => root.render(<Harness />));
    expect(record).not.toHaveBeenCalled();
    args = {
      ...args,
      batches: args.batches.map((batch) => ({
        ...batch,
        mentions: batch.mentions.map((mention) => ({
          ...mention,
          from: mention.from + 10,
          to: mention.to + 10,
        })),
      })),
    };
    await act(async () => root.render(<Harness />));
    expect(record).not.toHaveBeenCalled();
    args = {
      ...args,
      reader: { id: 'note', title: 'Carnet' } as Parameters<
        typeof useNoteObservations
      >[0]['reader'],
    };
    await act(async () => root.render(<Harness />));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'consulted', sourceId: 'note' }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});
