// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { writingWordDelta } from '../src/editor/writingDelta';
import { calendarDays, localDay, WritingActivityStore } from '../src/profile/writingActivity';

const count = (text: string) => text.match(/\S+/gu)?.length ?? 0;
afterEach(() => {
  vi.useRealTimers();
});
it('counts word boundaries, multiline edits, replacements and multiple ranges without double counting', () => {
  for (const [text, changes] of [
    ['bonjour', { from: 3, insert: ' ' }],
    ['un deux', { from: 2, to: 3, insert: '' }],
    [
      'un\ndeux\ntrois',
      [
        { from: 2, to: 3, insert: ' ' },
        { from: 5, insert: ' x ' },
      ],
    ],
    [
      'un deux trois',
      [
        { from: 0, insert: 'a ' },
        { from: 7, insert: 'b ' },
      ],
    ],
    ['a\nb\nc', { from: 1, to: 4, insert: ' autre\nlong texte ' }],
    ['', { from: 0, insert: 'Élise écrit ✨\n你好 monde' }],
  ] as const) {
    const state = EditorState.create({ doc: text });
    const transaction = state.update({ changes });
    expect(writingWordDelta(state.doc, transaction.newDoc, transaction.changes)).toBe(
      count(transaction.newDoc.toString()) - count(text),
    );
  }
});
it('matches the full counter over many overlapping line ranges', () => {
  let seed = 19;
  const random = (max: number) => {
    seed = (seed * 16807) % 2147483647;
    return seed % max;
  };
  const alphabet = ['a', ' ', '\n', 'é', '😀', '\t'];
  for (let i = 0; i < 400; i++) {
    const text = Array.from({ length: 30 }, () => alphabet[random(alphabet.length)]).join('');
    const from = random(text.length + 1),
      to = from + random(text.length - from + 1);
    const state = EditorState.create({ doc: text });
    const transaction = state.update({
      changes: { from, to, insert: alphabet[random(alphabet.length)] + ' fin' },
    });
    expect(writingWordDelta(state.doc, transaction.newDoc, transaction.changes)).toBe(
      count(transaction.newDoc.toString()) - count(text),
    );
  }
});
it('persists net additions without replaying on reload or retry; attributes edits at midnight', async () => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  let now = new Date(2026, 10, 17, 23, 59);
  const store = new WritingActivityStore(storage, vi.fn(), () => now);
  store.record(3);
  store.record(-3);
  store.record(3);
  store.record(0);
  expect(store.snapshot().days['2026-11-17'].netWords).toBe(3);
  now = new Date(2026, 10, 18, 0, 1);
  store.record(2);
  await store.flush();
  await store.flush();
  const reloaded = new WritingActivityStore(storage, vi.fn(), () => now);
  expect(reloaded.snapshot().days['2026-11-17'].netWords).toBe(3);
  expect(reloaded.snapshot().days['2026-11-18'].netWords).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
  store.dispose();
  reloaded.dispose();
});
it('persists during continuous typing, retries a failed write, and leaves corrupt data intact', async () => {
  vi.useFakeTimers();
  const fail = vi.fn();
  const storage = { getItem: vi.fn(() => null as string | null), setItem: vi.fn() };
  const store = new WritingActivityStore(storage, fail);
  storage.setItem.mockImplementationOnce(() => {
    throw Error('full');
  });
  store.record(1);
  vi.advanceTimersByTime(500);
  await Promise.resolve();
  expect(fail).toHaveBeenCalled();
  await store.flush();
  expect(
    JSON.parse(storage.setItem.mock.calls.at(-1)![1]).days[localDay(new Date())].netWords,
  ).toBe(1);
  store.dispose();
  storage.getItem.mockReturnValue('{broken');
  storage.setItem.mockClear();
  const broken = new WritingActivityStore(storage, fail);
  broken.record(1);
  await expect(broken.flush()).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
  broken.dispose();
});
it('lays out Monday-first years including leap days with local calendar arithmetic', () => {
  const days = calendarDays(2024);
  expect(days).toContain('2024-02-29');
  expect(days.length % 7).toBe(0);
  expect(new Date(days[0] + 'T12:00:00').getDay()).toBe(1);
  expect(days.filter((day) => day.startsWith('2024-'))).toHaveLength(366);
});
