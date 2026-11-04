// @vitest-environment jsdom
import { act, useState } from 'react';
import { Settings } from '../src/app/Settings';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { entityMarks, setEntityMarks } from '../src/editor/entities';
import { entityColor, type SelectedEntity } from '../src/enrichment/entityTypes';
import {
  useInlineEntities,
  type InlineEntitiesController,
} from '../src/enrichment/useInlineEntities';
import { EntityPreferences } from '../src/enrichment/EntityPreferences';
import { defaultSettings } from '../src/app/types';
import type { Workspace } from '../src/app/useWorkspace';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/app/client', () => ({ native: true, request }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const text = '😀 Claude Nougaro est né à Toulouse.';
const person: SelectedEntity = {
  from: 3,
  to: 17,
  title: 'Claude Nougaro',
  kind: 'person',
  sourceId: null,
  entityId: 'e',
  section: 's',
  revision: 1,
};
const batch = { text, mentions: [person] };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, controller: InlineEntitiesController;
function workspace(path = '/a') {
  const scene = { id: 's', text, revision: 1 };
  const p = { path, sections: [scene] };
  return {
    p,
    scenes: [scene],
    sourceVersion: 0,
    doc: { status: 'saved', generation: 1, settings: defaultSettings },
    setCard: vi.fn(),
    setReader: vi.fn(),
    setSourceVersion: vi.fn(),
  } as unknown as Workspace;
}
function Harness({ w }: { w: Workspace }) {
  controller = useInlineEntities(w, null);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
  request.mockReset();
  request.mockImplementation(async (type) =>
    type === 'inlineEntities' ? batch : { kinds: ['Ordre', 'Dynastie'] },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
it('decorates UTF16 ranges without changing manuscript and invalidates edited text', () => {
  let state = EditorState.create({ doc: text, extensions: [entityMarks, markdown()] });
  state = state.update({
    effects: setEntityMarks.of({ mentions: [person], colors: { Personne: '#ff0000' } }),
  }).state;
  const decoration = state.facet(EditorView.decorations)[0];
  expect(typeof decoration).not.toBe('function');
  if (typeof decoration !== 'function') {
    const cursor = decoration.iter();
    expect([cursor.from, cursor.to]).toEqual([3, 17]);
    expect(cursor.value?.spec.attributes.style).toContain('#ff0000');
    expect(cursor.value?.spec.class).toContain('cm-entity-new');
  }
  expect(state.doc.toString()).toBe(text);
  state = state.update({ changes: { from: 20, insert: 'pas ' } }).state;
  expect(state.field(entityMarks).mentions).toHaveLength(1);
  state = state.update({ changes: { from: 4, insert: 'x' } }).state;
  expect(state.field(entityMarks).mentions).toEqual([]);
  expect(entityColor('person', { Personne: 'url(evil)' })).toBe('#8d719e');
});
it('does not decorate code', () => {
  let state = EditorState.create({
    doc: '`Claude Nougaro`',
    extensions: [entityMarks, markdown()],
  });
  state = state.update({
    effects: setEntityMarks.of({ mentions: [{ ...person, from: 1, to: 14 }], colors: {} }),
  }).state;
  const decoration = state.facet(EditorView.decorations)[0];
  if (typeof decoration !== 'function') expect(decoration.size).toBe(0);
});
it('waits for saved text, rejects obsolete results after switching projects', async () => {
  const resolvers: ((v: unknown) => void)[] = [];
  request.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
  const w = workspace();
  await act(async () =>
    root.render(<Harness w={{ ...w, doc: { ...w.doc, status: 'editing' } }} />),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(request).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  await act(async () => root.render(<Harness w={workspace('/b')} />));
  await act(async () => resolvers[0](batch));
  expect(controller.batches).toEqual([]);
  await act(async () => vi.advanceTimersByTimeAsync(350));
  await act(async () => resolvers[1](batch));
  expect(controller.batches[0].text).toBe(text);
});
it('requests automatic creation after analysis and keeps ambiguity resolution explicit', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(request).toHaveBeenCalledWith(
    'inlineEntities',
    expect.objectContaining({ autoCreate: true }),
  );
  await act(async () => controller.open(person));
  expect(request.mock.calls.some(([type]) => type === 'createDetectedEntity')).toBe(false);
  request.mockResolvedValueOnce({ id: 'new', title: person.title });
  await act(async () => controller.create());
  expect(request).toHaveBeenCalledWith('createDetectedEntity', {
    projectPath: '/a',
    section: 's',
    revision: 1,
    from: 3,
    to: 17,
    kind: 'person',
  });
  expect(w.setSourceVersion).toHaveBeenCalled();
  expect(w.setReader).toHaveBeenCalledWith({ id: 'new', title: person.title });
});
it('opens existing sources and exposes custom vault types in colour preferences', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  request.mockResolvedValueOnce({ id: 'toulouse', title: 'Toulouse' });
  await act(async () => controller.open({ ...person, sourceId: 'toulouse' }));
  expect(w.setReader).toHaveBeenCalledWith({ id: 'toulouse', title: 'Toulouse' });
  const onChange = vi.fn();
  await act(async () =>
    root.render(<EntityPreferences value={defaultSettings} onChange={onChange} />),
  );
  expect(host.querySelector('input[aria-label="Couleur · Dynastie"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  expect(onChange).toHaveBeenCalledWith({ entityHighlighting: false });
});

it('requests only scenes intersecting the visible sample of a continuous manuscript', async () => {
  const w = workspace();
  w.scenes = [
    { ...w.scenes[0], id: 'before', text: 'Avant' },
    { ...w.scenes[0], id: 'visible' },
    { ...w.scenes[0], id: 'after', text: 'Après' },
  ];
  w.viewport = { from: 8, text: 'Claude', allowEnd: true, paragraphs: [] };
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(
    request.mock.calls
      .filter(([type]) => type === 'inlineEntities')
      .map(([, args]) => args.section),
  ).toEqual(['visible']);
});

it('adds user-defined entity types with definitions and examples', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(<EntityPreferences value={defaultSettings} onChange={onChange} />),
  );
  const input = [...host.querySelectorAll<HTMLInputElement>('input')].find((e) =>
    e.closest('label')?.textContent?.includes('Nouveau type'),
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Dynastie royale',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Ajouter ce type')!.click(),
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      entityTypes: expect.arrayContaining([
        expect.objectContaining({ name: 'Dynastie royale', enabled: true }),
      ]),
    }),
  );
});

it('shares the colour setting between preferences and the writing menu', async () => {
  function Controls() {
    const [value, setValue] = useState(defaultSettings);
    const onChange = (patch: Partial<typeof value>) => setValue({ ...value, ...patch });
    return (
      <>
        <EntityPreferences value={value} onChange={onChange} />
        <Settings
          value={value}
          onChange={onChange}
          onClose={() => {}}
          open={false}
          onFormat={() => {}}
          canFormat={false}
        />
      </>
    );
  }
  await act(async () => root.render(<Controls />));
  const toggles = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].filter((e) =>
    e.closest('label')?.textContent?.includes('Colorer les entités reconnues'),
  );
  expect(toggles).toHaveLength(2);
  await act(async () => toggles[0].click());
  expect(toggles.map((e) => e.checked)).toEqual([false, false]);
  await act(async () => toggles[1].click());
  expect(toggles.map((e) => e.checked)).toEqual([true, true]);
});

it('keeps the same name visible while its sentence changes and while context analysis refreshes', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  const edited = { ...w.scenes[0], text: text + ' Il écrit.', revision: 2 };
  const changed = { ...w, scenes: [edited], doc: { ...w.doc, status: 'editing' as const } };
  await act(async () => root.render(<Harness w={changed} />));
  expect(controller.batches[0].mentions[0].title).toBe(person.title);
  request.mockResolvedValueOnce({ text: edited.text, mentions: [] });
  await act(async () =>
    root.render(<Harness w={{ ...changed, doc: { ...w.doc, status: 'saved' } }} />),
  );
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(controller.batches[0].mentions[0].title).toBe(person.title);
  await act(async () =>
    root.render(
      <Harness
        w={{ ...changed, scenes: [{ ...edited, text: edited.text.replace('Nougaro', 'Noiret') }] }}
      />,
    ),
  );
  expect(controller.batches[0].mentions).toEqual([]);
});

it('shifts an unchanged literal name after Unicode insertion and invalidates extensions at its edge', () => {
  let state = EditorState.create({ doc: 'Claude Nougaro écrit.', extensions: entityMarks });
  state = state.update({
    effects: setEntityMarks.of({ mentions: [{ ...person, from: 0, to: 14 }], colors: {} }),
  }).state;
  state = state.update({ changes: { from: 0, insert: '😀 ' } }).state;
  expect(state.field(entityMarks).mentions[0].from).toBe(3);
  state = state.update({ changes: { from: 17, insert: 'x' } }).state;
  expect(state.field(entityMarks).mentions).toEqual([]);
});

it('resolves an ambiguous mention to a chosen existing card without creating a duplicate', async () => {
  const w = workspace();
  await act(async () => root.render(<Harness w={w} />));
  await act(async () =>
    controller.open({
      ...person,
      candidates: [{ id: 'existing', title: 'Claude Nougaro', kind: 'Personne' }],
    }),
  );
  request.mockResolvedValueOnce({ id: 'existing', title: 'Claude Nougaro' });
  await act(async () => controller.choose('existing'));
  expect(request).toHaveBeenCalledWith(
    'resolveDetectedEntity',
    expect.objectContaining({ source: 'existing', from: 3, to: 17 }),
  );
  expect(request.mock.calls.some(([type]) => type === 'createDetectedEntity')).toBe(false);
  expect(w.setReader).toHaveBeenCalledWith({ id: 'existing', title: 'Claude Nougaro' });
});

it('keeps a mapped mark when React refreshes stale analysis during live typing', async () => {
  const { Editor } = await import('../src/editor/Editor');
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const section = {
    id: 's',
    parent: null,
    kind: 'scene' as const,
    position: 0,
    title: 'Texte',
    text,
    revision: 1,
    synopsis: '',
    status: '',
    goal: 0,
  };
  const props = {
    sections: [section],
    generation: 1,
    projectPath: '/fixture',
    settings: defaultSettings,
    onChange: vi.fn(),
    onVisible: vi.fn(),
    onWords: vi.fn(),
    onCharacters: vi.fn(),
    onCursor: vi.fn(),
    onTyping: vi.fn(),
  };
  try {
    await act(async () =>
      root.render(<Editor {...props} entities={[{ ...batch, section: 's', revision: 1 }]} />),
    );
    const view = EditorView.findFromDOM(host.querySelector('.cm-editor')!)!;
    expect(view.state.field(entityMarks).mentions).toHaveLength(1);
    await act(async () => view.dispatch({ changes: { from: 20, insert: 'encore ' } }));
    await act(async () =>
      root.render(<Editor {...props} entities={[{ ...batch, section: 's', revision: 1 }]} />),
    );
    expect(view.state.field(entityMarks).mentions).toHaveLength(1);
    await act(async () => view.dispatch({ changes: { from: 4, insert: 'x' } }));
    await act(async () =>
      root.render(<Editor {...props} entities={[{ ...batch, section: 's', revision: 1 }]} />),
    );
    expect(view.state.field(entityMarks).mentions).toHaveLength(0);
    await act(async () => root.unmount());
    root = createRoot(host);
  } finally {
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
});
