// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { Project, Version } from '../src/app/types';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { request } from '../src/app/client';
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
it('automatically versions writing, deduplicates revisions and restores an idle checkpoint', async () => {
  const p = await request<Project>('create', { path: 'auto-test', name: 'Auto' }),
    id = p.sections[0].id;
  await request('save', { patches: [{ id, revision: 0, text: 'Premier état.' }] });
  const first = await request<Version[]>('versions');
  expect(first).toHaveLength(1);
  expect(first[0].sections).toEqual([]);
  expect(await request('automaticVersion', { projectPath: p.path, scope: id })).toBeNull();
  await request('save', { patches: [{ id, revision: 1, text: 'Premier état. La suite.' }] });
  const second = await request<Version>('automaticVersion', { projectPath: p.path, scope: id });
  expect(second.sections).toEqual([]);
  expect((await request<Version>('version', { id: second.id })).sections[0].text).toBe(
    'Premier état. La suite.',
  );
  const restored = await request<Project>('restore', { id: first[0].id });
  expect(restored.sections[0].text).toBe('Premier état.');
  await expect(request('automaticVersion', { projectPath: 'other', scope: id })).rejects.toThrow();
});
it('bounds automatic versions without deleting a manually named state', async () => {
  vi.useFakeTimers();
  const p = await request<Project>('create', { path: 'auto-retention', name: 'Auto' }),
    id = p.sections[0].id;
  const manual = await request<Version>('capture', { name: 'Sauvegarde automatique', scope: id });
  for (let n = 0; n < 60; n++) {
    await request('save', { patches: [{ id, revision: n, text: `État ${n}` }] });
    await request('automaticVersion', { projectPath: p.path, scope: id });
    vi.advanceTimersByTime(60_000);
  }
  const versions = await request<Version[]>('versions');
  expect(versions.filter((v) => v.automatic).length).toBeLessThanOrEqual(40);
  expect(versions.some((v) => v.id === manual.id)).toBe(true);
});
