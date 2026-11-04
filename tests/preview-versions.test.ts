// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { Project, Version } from '../src/app/types';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
it('captures and restores a scoped version without replacing unrelated writing', async () => {
  localStorage.clear();
  const { request, newSection } = await import('../src/app/client');
  const p = await request<Project>('create', { path: 'test-version', name: 'Test' });
  const first = { ...p.sections[0], text: 'Premier état.' };
  const second = { ...newSection('Autre texte', null, 'scene', 1), text: 'Autre.' };
  localStorage.setItem(
    'ariane.preview.projects.v1',
    JSON.stringify({ [p.path]: { ...p, sections: [first, second] } }),
  );
  const v = await request<Version>('capture', { name: 'Scène seule', scope: first.id });
  expect(v.sections.map((s) => s.id)).toEqual([first.id]);
  localStorage.setItem(
    'ariane.preview.projects.v1',
    JSON.stringify({
      [p.path]: {
        ...p,
        sections: [
          { ...first, text: 'Révisé.' },
          { ...second, text: 'À préserver.' },
        ],
      },
    }),
  );
  const restored = await request<Project>('restore', { id: v.id });
  expect(restored.sections.find((s) => s.id === first.id)?.text).toBe('Premier état.');
  expect(restored.sections.find((s) => s.id === second.id)?.text).toBe('À préserver.');
  const versions = await request<Version[]>('versions');
  expect(versions[0]).toMatchObject({ name: 'Avant restauration', scope: first.id });
  expect(versions[0].sections).toEqual([]);
  expect((await request<Version>('version', { id: versions[0].id })).sections[0].text).toBe(
    'Révisé.',
  );
});
