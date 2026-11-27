// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { request } from '../src/platform/client';

beforeEach(() => localStorage.clear());

it('keeps the open manuscript after a failed open or a duplicate creation', async () => {
  const p = await request('create', { path: 'browser:draft', name: 'Draft' });
  await request('save', {
    patches: [{ id: p.sections[0].id, revision: 0, text: 'Original manuscript' }],
  });
  await expect(request('open', { path: 'browser:missing' })).rejects.toThrow();
  await expect(request('create', { path: p.path, name: 'Duplicate' })).rejects.toThrow();
  expect(localStorage.getItem('ariane.preview.current')).toBe(p.path);
  expect(await request('bootstrap')).toMatchObject({
    name: 'Draft',
    sections: [{ text: 'Original manuscript' }],
  });
});

it('accepts only a complete permutation when reordering browser scenes', async () => {
  const p = await request('create', { path: 'browser:order', name: 'Order' });
  const sections = await request('add', { parent: null, title: 'Second', kind: 'scene' });
  const [first, second] = sections.map((s) => s.id);
  for (const ids of [[first], [first, first], [first, 'unknown']]) {
    await expect(request('reorder', { ids, id: first })).rejects.toThrow();
    expect((await request('bootstrap'))?.sections).toEqual(sections);
  }
  expect((await request('reorder', { ids: [second, first], id: second })).map((s) => s.id)).toEqual(
    [second, first],
  );
  expect((await request('open', { path: p.path })).sections.map((s) => s.id)).toEqual([
    second,
    first,
  ]);
});
