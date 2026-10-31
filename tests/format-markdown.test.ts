import { EditorState } from '@codemirror/state';
import { history, isolateHistory, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import { formatMarkdown, type MarkdownFormat } from '../src/editor/formatMarkdown';
import { compose, sectionMapping, type Span } from '../src/editor/composite';

function apply(text: string, from: number, to: number, format: MarkdownFormat, spans: Span[] = []) {
  const state = EditorState.create({ doc: text, selection: { anchor: from, head: to } });
  return state.update(formatMarkdown(state, format, spans)).state;
}

describe('formatage Markdown', () => {
  it('encadre une sélection sans englober les espaces et permet de retirer le format', () => {
    const formatted = apply('un beau texte ici', 3, 13, 'bold');
    expect(formatted.doc.toString()).toBe('un **beau texte** ici');
    expect(formatted.sliceDoc(formatted.selection.main.from, formatted.selection.main.to)).toBe(
      'beau texte',
    );
    expect(formatted.update(formatMarkdown(formatted, 'bold')).state.doc.toString()).toBe(
      'un beau texte ici',
    );
    expect(apply('**gras**', 2, 6, 'italic').doc.toString()).toBe('***gras***');
    const combined = apply('**gras**', 2, 6, 'italic');
    expect(combined.update(formatMarkdown(combined, 'italic')).state.doc.toString()).toBe(
      '**gras**',
    );
  });

  it('place le curseur entre les balises sans sélection', () => {
    const result = apply('texte', 5, 5, 'italic');
    expect(result.doc.toString()).toBe('texte**');
    expect(result.selection.main.head).toBe(6);
    const list = apply('', 0, 0, 'bullet');
    expect(list.doc.toString()).toBe('- ');
    expect(list.selection.main.head).toBe(2);
  });

  it('applique le style à chaque paragraphe séparément', () => {
    const formatted = apply('Un\n\nDeux', 0, 8, 'bold');
    expect(formatted.doc.toString()).toBe('**Un**\n\n**Deux**');
    expect(formatted.update(formatMarkdown(formatted, 'bold')).state.doc.toString()).toBe(
      'Un\n\nDeux',
    );
  });

  it('prépare la destination des liens et des images sans effacer la sélection', () => {
    const link = apply('voir Ariane ici', 5, 11, 'link');
    expect(link.doc.toString()).toBe('voir [Ariane](https://) ici');
    expect(link.sliceDoc(link.selection.main.from, link.selection.main.to)).toBe('https://');
    const image = apply('image', 0, 5, 'image');
    expect(image.doc.toString()).toBe('![image](https://)');
    const existing = apply('[Ariane](https://exemple.fr)', 1, 7, 'link');
    expect(existing.doc.toString()).toBe('[Ariane](https://exemple.fr)');
    expect(existing.sliceDoc(existing.selection.main.from, existing.selection.main.to)).toBe(
      'https://exemple.fr',
    );
  });

  it('ne croise pas les balises de gras lorsqu’une sélection inclut un seul délimiteur', () => {
    const doc = '**Claude Nougaro**';
    for (const [anchor, head] of [
      [0, 16],
      [2, 18],
    ]) {
      const state = EditorState.create({
        doc,
        selection: { anchor, head },
        extensions: [markdown({ base: markdownLanguage })],
      });
      const result = state.update(formatMarkdown(state, 'link')).state;
      expect(result.doc.toString()).toBe('**[Claude Nougaro](https://)**');
      expect(result.sliceDoc(result.selection.main.from, result.selection.main.to)).toBe(
        'https://',
      );
    }
  });

  it('formate les lignes choisies et ne modifie pas la ligne suivante', () => {
    const result = apply('Un\nDeux\nTrois', 0, 8, 'numbered');
    expect(result.doc.toString()).toBe('1. Un\n2. Deux\nTrois');
    expect(apply('## Titre', 3, 8, 'heading-2').doc.toString()).toBe('Titre');
    expect(apply('## Titre', 3, 8, 'paragraph').doc.toString()).toBe('Titre');
    expect(apply('- tâche', 0, 7, 'task').doc.toString()).toBe('- [ ] tâche');
    expect(apply('Un\nDeux', 0, 7, 'quote').doc.toString()).toBe('> Un\n> Deux');
    expect(apply('Avant\nDeux', 5, 10, 'heading-2').doc.toString()).toBe('Avant\n## Deux');
  });

  it('insère un bloc de code, un séparateur et un tableau sans perdre de texte', () => {
    expect(apply('avant\nligne\naprès', 7, 10, 'code-block').doc.toString()).toBe(
      'avant\n```\nligne\n```\naprès',
    );
    const emptyCode = apply('', 0, 0, 'code-block');
    expect(emptyCode.doc.toString()).toBe('```\n\n```');
    expect(emptyCode.selection.main.head).toBe(4);
    const code = apply('avant\nligne\naprès', 7, 10, 'code-block');
    expect(code.update(formatMarkdown(code, 'code-block')).state.doc.toString()).toBe(
      'avant\nligne\naprès',
    );
    expect(apply('a ` b', 0, 5, 'inline-code').doc.toString()).toBe('``a ` b``');
    expect(apply('avant', 0, 5, 'rule').doc.toString()).toBe('avant\n\n---\n');
    const table = apply('', 0, 0, 'table');
    expect(table.doc.toString()).toContain('| Colonne 1 | Colonne 2 |\n| --- | --- |');
    expect(table.sliceDoc(table.selection.main.from, table.selection.main.to)).toBe('Colonne 1');
  });

  it('reconnaît dans l’éditeur le barré et les listes de tâches Markdown étendues', () => {
    const state = EditorState.create({
      doc: '~~texte~~\n\n- [ ] tâche',
      extensions: [markdown({ base: markdownLanguage })],
    });
    const tree = syntaxTree(state).toString();
    expect(tree).toContain('Strikethrough');
    expect(tree).toContain('Task');
  });

  it('ajoute une note à la scène concernée sans déplacer les scènes suivantes', () => {
    const section = (id: string, text: string) => ({
      id,
      text,
      parent: null,
      title: id,
      kind: 'scene' as const,
      position: 0,
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
    });
    const data = compose([section('a', 'Texte'), section('b', 'Autre')]);
    const mapping = sectionMapping(data.spans);
    let state = EditorState.create({
      doc: data.text,
      selection: { anchor: 5 },
      extensions: [history(), mapping.extensions],
    });
    state = state.update({
      ...formatMarkdown(state, 'footnote', data.spans),
      annotations: isolateHistory.of('full'),
    }).state;
    expect(state.doc.toString()).toBe('Texte[^1]\n\n[^1]: Texte de la note\n\nAutre');
    const mapped = state.field(mapping.field);
    expect(state.sliceDoc(mapped[1].from, mapped[1].to)).toBe('Autre');
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe(
      'Texte de la note',
    );
    expect(
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      }),
    ).toBe(true);
    expect(state.doc.toString()).toBe(data.text);
    expect(state.field(mapping.field)).toEqual(data.spans);
  });

  it('conserve les limites des scènes pour une sélection qui les traverse', () => {
    const section = (id: string, text: string) => ({
      id,
      text,
      parent: null,
      title: id,
      kind: 'scene' as const,
      position: 0,
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
    });
    const data = compose([section('a', 'Premier'), section('b', 'Second')]);
    const mapping = sectionMapping(data.spans);
    let state = EditorState.create({
      doc: data.text,
      selection: { anchor: 2, head: data.text.length - 2 },
      extensions: [history(), mapping.extensions],
    });
    state = state.update({
      ...formatMarkdown(state, 'bold', data.spans),
      annotations: isolateHistory.of('full'),
    }).state;
    const mapped = state.field(mapping.field);
    expect(state.sliceDoc(mapped[0].from, mapped[0].to)).toBe('Pr**emier**\n\n');
    expect(state.sliceDoc(mapped[1].from, mapped[1].to)).toBe('**Seco**nd');
    expect(
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      }),
    ).toBe(true);
    expect(state.field(mapping.field)).toEqual(data.spans);
  });
});
