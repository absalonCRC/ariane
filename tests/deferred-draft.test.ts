import { expect, it, vi } from 'vitest';
import { sectionDraft, stageDraft } from '../src/project/draft';
import type { Section } from '../src/contracts/project';
it('keeps all Section consumers current while materializing each snapshot only once', () => {
  const section = { text: 'old', outline: null } as Section;
  const read = vi.fn(() => ({
    text: 'nouveau 🙂',
    outline: { version: 1 as const, nodes: [{ id: 'a', start: 0, parent: null }] },
  }));
  const draft = sectionDraft(read);
  stageDraft(section, draft);
  expect(read).not.toHaveBeenCalled();
  expect(JSON.parse(JSON.stringify(section)).text).toBe('nouveau 🙂');
  expect(section.outline?.nodes[0].id).toBe('a');
  expect(draft().text).toBe(section.text);
  expect(read).toHaveBeenCalledTimes(1);
  stageDraft(
    section,
    sectionDraft(() => ({ text: 'plus récent', outline: null })),
  );
  expect(section.text).toBe('plus récent');
  section.text = 'restauré';
  section.outline = null;
  expect(section.text).toBe('restauré');
  expect(draft().text).toBe('nouveau 🙂');
});
