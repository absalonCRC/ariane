// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
it('captures and restores a scoped version without replacing unrelated writing', async () => {
  localStorage.clear();
  const { request, newSection } = await import('../src/platform/client');
  const p = await request('create', { path: 'test-version', name: 'Test' });
  const first = { ...p.sections[0], text: 'Premier état.' };
  const second = { ...newSection('Autre texte', null, 'scene', 1), text: 'Autre.' };
  localStorage.setItem(
    'ariane.preview.projects.v1',
    JSON.stringify({ [p.path]: { ...p, sections: [first, second] } }),
  );
  const v = await request('capture', { name: 'Scène seule', scope: first.id });
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
  const restored = await request('restore', { id: v.id });
  expect(restored.sections.find((s) => s.id === first.id)?.text).toBe('Premier état.');
  expect(restored.sections.find((s) => s.id === second.id)?.text).toBe('À préserver.');
  const versions = await request('versions');
  expect(versions[0]).toMatchObject({ name: 'Avant restauration', scope: first.id });
  expect(versions[0].sections).toEqual([]);
  expect((await request('version', { id: versions[0].id })).sections[0].text).toBe('Révisé.');
});
