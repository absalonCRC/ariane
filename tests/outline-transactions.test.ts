import { describe, expect, it } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { compose, sectionMapping } from '../src/editor/composite';
import { outlineEditor } from '../src/editor/outline/state';
import { initialOutline, validOutline } from '../src/editor/outline/model';
import type { Outline, Section } from '../src/contracts/project';
function setup(text = '', saved?: Outline, other?: string) {
  const scene = (id: string, text: string, outline?: Outline): Section => ({
    id,
    text,
    outline,
    title: id,
    parent: null,
    kind: 'scene',
    position: 0,
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  });
  const sections = [
    scene('scene', text, saved),
    ...(other === undefined ? [] : [scene('other', other)]),
  ];
  const data = compose(sections),
    mapping = sectionMapping(data.spans);
  const outline = outlineEditor(sections, data.spans, mapping.field);
  let state = EditorState.create({
    doc: data.text,
    extensions: [history(), mapping.extensions, outline.extensions],
  });
  const target = {
    get state() {
      return state;
    },
    dispatch: (tr: Transaction) => {
      state = tr.state;
    },
  };
  return {
    target,
    outline,
    mapping,
    nodes: () => state.field(outline.field).nodes,
    select: (pos: number, to = pos) => {
      state = state.update({ selection: { anchor: pos, head: to } }).state;
    },
    type: (text: string) => {
      state = state.update(state.replaceSelection(text)).state;
    },
    saved: () => outline.serialize(state, state.field(mapping.field)[0]),
  };
}

describe('passages structurés dans le vrai état CodeMirror', () => {
  it('undoes property edits and keeps both values when lines are joined', () => {
    const s = setup('A\nB', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0, properties: { field: 'Premier' } },
        { id: 'b', parent: null, start: 2, properties: { field: 'Second', number: 42 } },
      ],
    });
    s.outline.setProperty(s.target, 'a', 'field', 'Modifié');
    expect(s.saved().nodes[0].properties?.field).toBe('Modifié');
    undo(s.target);
    expect(s.saved().nodes[0].properties?.field).toBe('Premier');
    redo(s.target);
    s.select(1, 2);
    s.type('');
    expect(s.saved().nodes[0].properties).toEqual({ field: 'Modifié', number: 42 });
    expect(s.saved().nodes[0].propertyConflicts?.field).toEqual(['Modifié', 'Second']);
    s.outline.setProperty(s.target, 'a', 'field', 'Second');
    expect(s.saved().nodes[0].propertyConflicts?.field).toBeUndefined();
    undo(s.target);
    expect(s.saved().nodes[0].propertyConflicts?.field).toEqual(['Modifié', 'Second']);
    undo(s.target);
    expect(s.saved().nodes).toHaveLength(2);
  });
  it('stores tags outside text and restores them through split, join, move and undo/redo', () => {
    const s = setup('é🙂 suite\nAutre', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: 10, tagIds: ['other'] },
      ],
    });
    s.outline.setTags(s.target, 'a', ['place', 'place']);
    expect(s.saved().nodes[0].tagIds).toEqual(['place']);
    expect(s.target.state.doc.toString()).toBe('é🙂 suite\nAutre');
    expect(undo(s.target)).toBe(true);
    expect(s.saved().nodes[0].tagIds).toBeUndefined();
    redo(s.target);
    s.select(4);
    s.outline.enter(s.target);
    expect(
      s
        .saved()
        .nodes.slice(0, 2)
        .map((n) => n.tagIds),
    ).toEqual([['place'], ['place']]);
    undo(s.target);
    s.select(9, 10);
    s.type('');
    expect(s.saved().nodes).toHaveLength(1);
    expect(s.saved().nodes[0].tagIds).toEqual(['place', 'other']);
    undo(s.target);
    expect(s.saved().nodes).toHaveLength(2);
  });
  it('selects exact contiguous complete branches including folded descendants without toggling folds', () => {
    const s = setup('Parent\nCaché\nFin\nSuite', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 7 },
        { id: 'c', parent: null, start: 13 },
        { id: 'd', parent: null, start: 17 },
      ],
    });
    s.outline.toggleFold(s.target, 'a');
    s.outline.selectBranch(s.target, 'a');
    const selected = () => {
      const state = s.target.state;
      return state.sliceDoc(state.selection.main.from, state.selection.main.to);
    };
    expect(selected()).toBe('Parent\nCaché');
    s.outline.selectBranch(s.target, 'c');
    expect(selected()).toBe('Parent\nCaché\nFin');
    expect(s.target.state.field(s.outline.field).folded.has('a')).toBe(true);
    s.select(17);
    s.outline.selectBranch(s.target, 'd');
    expect(selected()).toBe('Suite');
  });
  it('keeps indexed lookups equivalent to scene ownership at every boundary after edits and undo', () => {
    const s = setup(
      'A\nB',
      {
        version: 1,
        nodes: [
          { id: 'a', start: 0, parent: null },
          { id: 'b', start: 2, parent: 'a' },
        ],
      },
      '',
    );
    const check = () => {
      const state = s.target.state,
        spans = state.field(s.mapping.field),
        nodes = s.nodes();
      for (let pos = 0; pos <= state.doc.length; pos++) {
        const span = spans.find((span) => pos >= span.from && pos < span.to) ?? spans.at(-1)!;
        const expected =
          nodes.filter((node) => node.section === span.id && node.from <= pos).at(-1) ??
          nodes.find((node) => node.section === span.id);
        expect(s.outline.entryAt(state, pos)).toBe(expected);
      }
      for (const span of spans) {
        const saved = s.outline.serialize(state, span);
        expect(validOutline(state.sliceDoc(span.from, span.to), saved)).toBe(true);
      }
    };
    check();
    s.select(1);
    s.type('é🙂');
    check();
    s.outline.enter(s.target);
    check();
    s.type('suite');
    check();
    s.outline.softBreak(s.target);
    check();
    s.type('interne');
    check();
    s.outline.indent(s.target);
    check();
    s.select(s.target.state.doc.length);
    s.type('Dernière');
    check();
    undo(s.target);
    check();
    redo(s.target);
    check();
  });
  it('distingue Entrée, retour interne et caractères ordinaires avec identité stable', () => {
    const s = setup();
    const first = s.nodes()[0].id;
    s.type('Bonjour');
    s.outline.softBreak(s.target);
    s.type('suite');
    expect(s.nodes()).toHaveLength(1);
    expect(s.nodes()[0].id).toBe(first);
    s.outline.enter(s.target);
    s.type('Autre');
    expect(s.nodes()).toHaveLength(2);
    expect(s.target.state.doc.toString()).toBe('Bonjour\nsuite\nAutre');
    expect(s.saved().nodes.map((n) => n.start)).toEqual([0, 14]);
  });
  it('préserve le texte et les identités après indentation seule et undo/redo', () => {
    const s = setup('A\nB', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: 2 },
      ],
    });
    s.select(3);
    s.outline.indent(s.target);
    expect(s.saved().nodes[1]).toEqual({ id: 'b', parent: 'a', start: 2 });
    expect(s.target.state.doc.toString()).toBe('A\nB');
    expect(undo(s.target)).toBe(true);
    expect(s.saved().nodes[1].parent).toBeNull();
    expect(redo(s.target)).toBe(true);
    expect(s.saved().nodes[1].parent).toBe('a');
  });
  it('conserve le passage existant quand Entrée est frappé à son début', () => {
    const s = setup('Texte', { version: 1, nodes: [{ id: 'existing', parent: null, start: 0 }] });
    s.outline.enter(s.target);
    expect(s.saved().nodes[1]).toEqual({ id: 'existing', parent: null, start: 1 });
    expect(s.saved().nodes[0].id).not.toBe('existing');
    expect(undo(s.target)).toBe(true);
    expect(s.saved().nodes).toEqual([{ id: 'existing', parent: null, start: 0 }]);
  });
  it('entre dans un parent ouvert et crée un frère après une branche repliée', () => {
    const saved: Outline = {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
        { id: 'c', parent: null, start: 4 },
      ],
    };
    const open = setup('A\nB\nC', saved);
    open.select(1);
    open.outline.enter(open.target);
    expect(open.saved().nodes.map((n) => n.parent)).toEqual([null, 'a', 'a', null]);
    const folded = setup('A\nB\nC', saved);
    folded.select(1);
    folded.outline.toggleFold(folded.target, 'a');
    folded.outline.enter(folded.target);
    expect(folded.target.state.doc.toString()).toBe('A\nB\n\nC');
    expect(folded.saved().nodes.map((n) => n.parent)).toEqual([null, 'a', null, null]);
    expect(folded.target.state.selection.main.head).toBe(4);
  });
  it('déplace une branche complète et désindente sans perdre les frères restants', () => {
    const s = setup('A\nB\nC\nD', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
        { id: 'c', parent: 'a', start: 4 },
        { id: 'd', parent: null, start: 6 },
      ],
    });
    s.select(3);
    s.outline.outdent(s.target);
    expect(s.target.state.doc.toString()).toBe('A\nC\nB\nD');
    expect(s.saved().nodes.map((n) => [n.id, n.parent])).toEqual([
      ['a', null],
      ['c', 'a'],
      ['b', null],
      ['d', null],
    ]);
    expect(undo(s.target)).toBe(true);
    expect(s.target.state.doc.toString()).toBe('A\nB\nC\nD');
    s.select(1);
    s.outline.move(s.target, 1);
    expect(s.target.state.doc.toString()).toBe('D\nA\nB\nC');
    expect(s.saved().nodes.map((n) => n.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('reconstruit les nœuds du collage et restaure les IDs après suppression traversante', () => {
    const s = setup();
    s.type('été\n😀\nfin');
    const before = s.saved();
    expect(before.nodes.map((n) => n.start)).toEqual([0, 4, 7]);
    expect(validOutline(s.target.state.doc.toString(), before)).toBe(true);
    s.select(1, 8);
    s.type('x');
    expect(validOutline(s.target.state.doc.toString(), s.saved())).toBe(true);
    expect(undo(s.target)).toBe(true);
    expect(s.saved()).toEqual(before);
  });
  it('préserve la structure au rechargement sans transformer les retours internes en nœuds', () => {
    const s = setup();
    s.type('a');
    s.outline.softBreak(s.target);
    s.type('b');
    s.outline.enter(s.target);
    s.type('c');
    s.outline.indent(s.target);
    const text = s.target.state.doc.toString(),
      saved = s.saved();
    const loaded = setup(text, saved);
    expect(loaded.saved()).toEqual(saved);
    expect(loaded.saved().nodes).toHaveLength(2);
  });
  it('dépose une branche sous un autre parent et refuse les cycles', () => {
    const s = setup('A\nB\nC\nD', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
        { id: 'c', parent: null, start: 4 },
        { id: 'd', parent: null, start: 6 },
      ],
    });
    expect(s.outline.relocate(s.target, 'a', 'b', 'inside')).toBe(false);
    expect(s.target.state.doc.toString()).toBe('A\nB\nC\nD');
    expect(s.outline.relocate(s.target, 'a', 'd', 'inside')).toBe(true);
    expect(s.target.state.doc.toString()).toBe('C\nD\nA\nB');
    expect(s.saved().nodes.map((n) => [n.id, n.parent])).toEqual([
      ['c', null],
      ['d', null],
      ['a', 'd'],
      ['b', 'a'],
    ]);
    expect(undo(s.target)).toBe(true);
    expect(s.target.state.doc.toString()).toBe('A\nB\nC\nD');
  });
  it('protège les descendants repliés sans les déplier lors d’une suppression', () => {
    const s = setup('A\nB\nC', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
        { id: 'c', parent: null, start: 4 },
      ],
    });
    s.outline.toggleFold(s.target, 'a');
    s.target.dispatch(s.target.state.update({ changes: { from: 1, to: 4, insert: '' } }));
    expect(s.target.state.doc.toString()).toBe('A\nB\nC');
    expect(s.target.state.field(s.outline.field).folded.size).toBe(1);
  });
  it('un clic ou déplacement du curseur ne déplie jamais les enfants', () => {
    const s = setup('A\nB', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
      ],
    });
    s.outline.toggleFold(s.target, 'a');
    s.select(3);
    expect(s.target.state.field(s.outline.field).folded.size).toBe(1);
    expect(s.target.state.selection.main.head).toBe(1);
    s.outline.toggleFold(s.target, 'a');
    expect(s.target.state.field(s.outline.field).folded.size).toBe(0);
  });
  it('écrire dans le parent fermé ou créer un frère laisse les enfants repliés', () => {
    const s = setup('A\nB\nC', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: 'a', start: 2 },
        { id: 'c', parent: null, start: 4 },
      ],
    });
    s.select(1);
    s.outline.toggleFold(s.target, 'a');
    s.type(' parent');
    expect(s.target.state.field(s.outline.field).folded.has('a')).toBe(true);
    s.outline.enter(s.target);
    s.type('Suite');
    expect(s.target.state.doc.toString()).toBe('A parent\nB\nSuite\nC');
    expect(s.target.state.field(s.outline.field).folded.has('a')).toBe(true);
  });
  it('rattache les enfants au passage fusionné quand leur parent est joint au précédent', () => {
    const s = setup('A\nB\nC', {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: 2 },
        { id: 'c', parent: 'b', start: 4 },
      ],
    });
    s.target.dispatch(s.target.state.update({ changes: { from: 1, to: 2, insert: '' } }));
    expect(s.target.state.doc.toString()).toBe('AB\nC');
    expect(s.saved().nodes).toEqual([
      { id: 'a', parent: null, start: 0 },
      { id: 'c', parent: 'a', start: 3 },
    ]);
    expect(undo(s.target)).toBe(true);
    expect(s.saved().nodes[1].id).toBe('b');
  });
  it('garde les identités et parents dans leur scène en écriture continue', () => {
    const s = setup('A', undefined, 'B');
    const other = s.target.state.field(s.mapping.field)[1];
    s.select(other.from + 1);
    s.outline.enter(s.target);
    s.type('C');
    s.outline.indent(s.target);
    const saved = s.outline.serialize(s.target.state, s.target.state.field(s.mapping.field)[1]);
    expect(saved.nodes).toHaveLength(2);
    expect(saved.nodes[1].parent).toBe(saved.nodes[0].id);
    expect(s.saved().nodes).toHaveLength(1);
  });
});

describe('migration des passages existants', () => {
  it('conserve un bloc Markdown multiligne et ses blancs sans modifier le texte', () => {
    const text = 'Une phrase\nsur deux lignes.\n\n```ts\nconst x = 1;\n```\n';
    const outline = initialOutline(text);
    expect(outline.nodes.map((n) => n.start)).toEqual([0, text.indexOf('```')]);
    expect(validOutline(text, outline)).toBe(true);
  });
});
