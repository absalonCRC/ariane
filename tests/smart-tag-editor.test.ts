// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { history, undo, redo, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { compose, sectionMapping } from '../src/editor/composite';
import { outlineEditor } from '../src/editor/outline/state';
import { outlinePresentation } from '../src/editor/outline/view';
import { smartTags, tagTrigger } from '../src/editor/smartTags';
import type { Section } from '../src/contracts/project';
import type { SmartTag } from '../src/contracts/smartTags';
const views: EditorView[] = [];
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  views.splice(0).forEach((v) => v.destroy());
  document.body.replaceChildren();
});
const tag = { id: 'tag', name: 'Enquête', color: '#72816a', category: 'Intrigue' };
function setup(text: string, create = vi.fn(async () => tag)) {
  const section: Section = {
    id: 's',
    title: 'Scène',
    kind: 'scene',
    parent: null,
    position: 0,
    revision: 0,
    text,
    synopsis: '',
    status: '',
    goal: 0,
  };
  const data = compose([section]),
    mapping = sectionMapping(data.spans),
    outline = outlineEditor([section], data.spans, mapping.field);
  const onError = vi.fn();
  const tags = smartTags(outline, {
    tags: () => [],
    sections: () => [section],
    hidden: () => false,
    create,
    onError,
    isCurrent: (v) => views.includes(v),
    standalone: true,
  });
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [
        history(),
        markdown(),
        mapping.extensions,
        outline.extensions,
        tags.extensions,
        outlinePresentation(outline),
        keymap.of(defaultKeymap),
      ],
    }),
  });
  views.push(view);
  return {
    view,
    outline,
    create,
    onError,
    saved: () => outline.serialize(view.state, view.state.field(mapping.field)[0]),
  };
}
function key(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}
const tick = () => new Promise((r) => setTimeout(r, 0));
it('creates a tag automatically on a normal newline and preserves undo/redo', async () => {
  const h = setup('Texte #Enquête');
  key(h.view, 'Enter');
  await tick();
  expect(h.create).toHaveBeenCalledWith('Enquête');
  expect(h.view.state.doc.toString()).toBe('Texte \n');
  expect(h.saved().nodes[0].tagIds).toEqual(['tag']);
  undo(h.view);
  expect(h.view.state.doc.toString()).toBe('Texte #Enquête\n');
  expect(h.saved().nodes[0].tagIds).toBeUndefined();
  redo(h.view);
  expect(h.saved().nodes[0].tagIds).toEqual(['tag']);
});
it('preserves headings, code, URLs, escaped hashes and dismissed hash text', async () => {
  for (const text of [
    '# Titre',
    '## Titre',
    '`#Enquête',
    '```\n#Enquête',
    'https://a/#Enquête',
    '\\#Enquête',
  ]) {
    const state = EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [markdown()],
    });
    expect(tagTrigger(state), text).toBeNull();
  }
  const h = setup('#Enquête');
  key(h.view, 'Escape');
  key(h.view, 'Enter');
  await tick();
  expect(h.create).not.toHaveBeenCalled();
  expect(h.view.state.doc.toString()).toBe('#Enquête\n');
});
it('does not replace a hashtag removed while its definition is being created', async () => {
  let resolve!: (tag: SmartTag) => void;
  const h = setup(
    '#Enquête',
    vi.fn(() => new Promise<SmartTag>((r) => (resolve = r))),
  );
  key(h.view, 'Enter');
  await Promise.resolve();
  h.view.dispatch({ changes: { from: 0, to: 1, insert: '' }, userEvent: 'input.type' });
  resolve(tag);
  await tick();
  expect(h.view.state.doc.toString()).toBe('Enquête\n');
  expect(h.saved().nodes[0].tagIds).toBeUndefined();
  expect(h.onError).not.toHaveBeenCalled();
});
it('creates on space while continued typing and the current caret are preserved', async () => {
  let resolve!: (tag: SmartTag) => void;
  const h = setup(
    'Avant #Enquête',
    vi.fn(() => new Promise<SmartTag>((r) => (resolve = r))),
  );
  h.view.dispatch({
    changes: { from: h.view.state.doc.length, insert: ' après' },
    selection: { anchor: 20 },
    userEvent: 'input.type',
  });
  await Promise.resolve();
  h.view.dispatch({
    changes: { from: h.view.state.doc.length, insert: ' ensuite' },
    selection: { anchor: 28 },
    userEvent: 'input.type',
  });
  resolve(tag);
  await tick();
  expect(h.view.state.doc.toString()).toBe('Avant après ensuite');
  expect(h.saved().nodes[0].tagIds).toEqual(['tag']);
  expect(h.view.state.selection.main.head).toBe(h.view.state.doc.length);
  expect(h.create).toHaveBeenCalledTimes(1);
});
it('colors every outline point using inherited tags while showing each label only on its parent', () => {
  const tags = [tag, { id: 'other', name: 'lieu', color: '#a9614b', category: 'Lieu' }];
  const section: Section = {
    id: 's',
    title: 'Scène',
    kind: 'scene',
    parent: null,
    position: 0,
    revision: 0,
    text: 'A\nB\nC',
    synopsis: '',
    status: '',
    goal: 0,
    outline: {
      version: 1,
      nodes: [
        { id: 'a', start: 0, parent: null, tagIds: ['tag'] },
        { id: 'b', start: 2, parent: 'a', tagIds: ['tag', 'other'] },
        { id: 'c', start: 4, parent: 'b' },
      ],
    },
  };
  const data = compose([section]),
    mapping = sectionMapping(data.spans),
    outline = outlineEditor([section], data.spans, mapping.field);
  const features = smartTags(outline, {
    tags: () => tags,
    sections: () => [section],
    hidden: () => false,
    create: async () => tag,
    onError: vi.fn(),
    isCurrent: () => true,
    standalone: true,
  });
  const detail = vi.fn();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: section.text,
      extensions: [
        history(),
        mapping.extensions,
        outline.extensions,
        features.extensions,
        outlinePresentation(outline, features.tagsForNode, detail),
      ],
    }),
  });
  views.push(view);
  expect(view.dom.querySelectorAll('.inline-smart-tags .smart-tag-label')).toHaveLength(2);
  expect(
    [...view.dom.querySelectorAll('.inline-smart-tags .smart-tag-label')].map((b) => b.textContent),
  ).toEqual(['#Enquête', '#lieu']);
  const points = [...view.dom.querySelectorAll<HTMLElement>('.outline-tagged')];
  expect(points).toHaveLength(3);
  expect(points[0].style.getPropertyValue('--outline-tag-fill')).toBe(tag.color);
  expect(points[1].style.getPropertyValue('--outline-tag-fill')).toContain('conic-gradient');
  expect(points[2].style.getPropertyValue('--outline-tag-fill')).toContain(tags[1].color);
  expect(outline.serialize(view.state, view.state.field(mapping.field)[0]).nodes[1].tagIds).toEqual(
    ['tag', 'other'],
  );
  view.dom.querySelector<HTMLButtonElement>('[data-outline-handle="a"]')!.click();
  expect(detail).toHaveBeenCalledWith('s', 'a');
  expect(view.state.field(outline.field).folded.size).toBe(0);
  view.dom.querySelector<HTMLButtonElement>('.inline-smart-tags .smart-tag-remove')!.click();
  expect(
    outline.serialize(view.state, view.state.field(mapping.field)[0]).nodes[0].tagIds,
  ).toBeUndefined();
  undo(view);
  expect(outline.serialize(view.state, view.state.field(mapping.field)[0]).nodes[0].tagIds).toEqual(
    ['tag'],
  );
  view.dom.querySelector<HTMLButtonElement>('[data-outline-anchor="a"] .outline-chevron')!.click();
  expect(view.state.field(outline.field).folded.has('a')).toBe(true);
  expect(detail).toHaveBeenCalledTimes(1);
  view.dom.querySelector<HTMLButtonElement>('[data-outline-anchor="a"] .outline-chevron')!.click();
  expect(view.state.field(outline.field).folded.size).toBe(0);
});
