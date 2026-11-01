// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { history, undo } from '@codemirror/commands';
import { liveMarkdown } from '../src/editor/markdown';
import { focusTableCell } from '../src/editor/liveTables';
import { formatMarkdown } from '../src/editor/formatMarkdown';
import { compose, sectionMapping } from '../src/editor/composite';
import { outlineEditor } from '../src/editor/outline/state';
import { outlinePresentation } from '../src/editor/outline/view';
import type { Section } from '../src/app/types';

const views: EditorView[] = [];
function editor(doc: string, cursor: number) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [history(), markdown({ base: markdownLanguage }), liveMarkdown],
    }),
  });
  views.push(view);
  return view;
}
afterEach(() => {
  for (const view of views.splice(0)) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

describe('tableaux Markdown dans le manuscrit', () => {
  it('permet de modifier une cellule directement et de retrouver le Markdown avec annulation', () => {
    const source = 'Intro\n\n| Nom | Valeur |\n| --- | --- |\n| Alpha | **deux** |\n\nFin';
    const view = editor(source, 0);
    const cell = view.dom.querySelector('td')!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = cell.querySelector('input')!;
    expect(input.value).toBe('Alpha');
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');
    input.value = 'Bravo | test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace('Alpha', 'Bravo \\| test'));
    expect(document.activeElement).toBe(input);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(input.value).toBe('Alpha');
  });

  it('ajoute et supprime une ligne à partir de la cellule choisie, avec annulation', () => {
    const source = '| A | B |\n| :--- | ---: |\n| un | deux |\n| trois | quatre |';
    const view = editor(source, 0);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    (view.dom.querySelector('button[aria-label="Ajouter une ligne"]') as HTMLButtonElement).click();
    expect(view.state.doc.toString()).toBe(
      source.replace('| un | deux |', '| un | deux |\n|  |  |'),
    );
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    (
      view.dom.querySelector('button[aria-label="Supprimer la ligne"]') as HTMLButtonElement
    ).click();
    expect(view.state.doc.toString()).toBe(source.replace('| un | deux |\n', ''));
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('ajoute et supprime une colonne en préservant les alignements et les autres cellules', () => {
    const source = '| A | B |\n| :--- | ---: |\n| un \\| bis | **deux** |';
    const view = editor(source, 0);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    (
      view.dom.querySelector('button[aria-label="Ajouter une colonne"]') as HTMLButtonElement
    ).click();
    expect(view.state.doc.toString()).toBe(
      '| A |  | B |\n| :--- | --- | ---: |\n| un \\| bis |  | **deux** |',
    );
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    (
      view.dom.querySelector('button[aria-label="Supprimer la colonne"]') as HTMLButtonElement
    ).click();
    expect(view.state.doc.toString()).toBe('| B |\n| ---: |\n| **deux** |');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('garde une colonne et protège la ligne d’en-tête', () => {
    const source = '| A |\n| --- |\n| un |';
    const view = editor(source, 0);
    const removeRow = view.dom.querySelector<HTMLButtonElement>(
      'button[aria-label="Supprimer la ligne"]',
    )!;
    const removeColumn = view.dom.querySelector<HTMLButtonElement>(
      'button[aria-label="Supprimer la colonne"]',
    )!;
    expect(removeRow.disabled).toBe(true);
    expect(removeColumn.disabled).toBe(true);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(removeRow.disabled).toBe(false);
    removeRow.click();
    expect(view.state.doc.toString()).toBe('| A |\n| --- |');
    expect(view.dom.querySelector('table')).not.toBeNull();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('ajoute des lignes et colonnes dans une citation en conservant ses préfixes', () => {
    const source = '> | A | B |\n> | --- | --- |\n> | un | deux |';
    const view = editor(source, 0);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    view.dom.querySelector<HTMLButtonElement>('button[aria-label="Ajouter une ligne"]')!.click();
    expect(view.state.doc.toString()).toBe(source + '\n> |  |  |');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    view.dom.querySelector<HTMLButtonElement>('button[aria-label="Ajouter une colonne"]')!.click();
    expect(view.state.doc.toString()).toBe(
      '> | A |  | B |\n> | --- | --- | --- |\n> | un |  | deux |',
    );
  });

  it('conserve un tableau valide en supprimant une colonne sans barres extérieures', () => {
    const source = 'A | B\n--- | ---\nun | deux';
    const view = editor(source, 0);
    view.dom
      .querySelector('td')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    view.dom.querySelector<HTMLButtonElement>('button[aria-label="Supprimer la colonne"]')!.click();
    expect(view.state.doc.toString()).toBe('| B |\n| --- |\n| deux |');
    expect(view.dom.querySelector<HTMLInputElement>('table input')?.value).toBe('deux');
  });
  it('reflète les changements et conserve le Markdown et les styles', () => {
    const source = '| Nom | Valeur |\n| :--- | ---: |\n| Alpha | **deux** |';
    const view = editor(source, source.indexOf('Alpha'));
    expect(view.dom.querySelector('table')).not.toBeNull();
    expect(view.dom.querySelector('strong')?.textContent).toBe('deux');
    expect(view.dom.querySelectorAll('th')[1].getAttribute('align')).toBe('right');
    const pos = source.indexOf('Alpha');
    view.dispatch({ changes: { from: pos, to: pos + 5, insert: 'Bravo' } });
    expect(view.dom.querySelector('table')?.textContent).toContain('Bravo');
    expect(view.state.doc.toString()).toBe(source.replace('Alpha', 'Bravo'));
    expect(undo(view)).toBe(true);
    expect(view.dom.querySelector('table')?.textContent).toContain('Alpha');
    expect(view.state.doc.toString()).toBe(source);
  });

  it('ouvre directement la cellule cliquée sans afficher sa syntaxe en dessous', () => {
    const source = 'Introduction\n\n| A | B |\n| --- | --- |\n| un | deux |\n\nFin';
    const view = editor(source, 0);
    expect(view.dom.querySelector('table')?.textContent).toContain('deux');
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');
    const cell = view.dom.querySelectorAll('td')[1];
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = cell.querySelector('input')!;
    expect(input.value).toBe('deux');
    input.value = 'trois';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace('deux', 'trois'));
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('| --- | --- |');
  });

  it('ne transforme pas le contenu d’un bloc de code en tableau', () => {
    const source = '```md\n| A | B |\n| --- | --- |\n| un | deux |\n```';
    const view = editor(source, 0);
    expect(view.dom.querySelector('table')).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it('gère les cellules vides et les barres échappées sans charger de contenu distant', () => {
    const source =
      '| A | B |\n| --- | --- |\n| un \\| deux | ![image](https://example.com/image.png) |\n|  | [lien](https://example.com) |';
    const view = editor(source, 0);
    const cells = view.dom.querySelectorAll('td');
    expect(cells[0].textContent).toBe('un | deux');
    expect(view.dom.querySelector('.markdown-table-preview img')).toBeNull();
    expect(view.dom.querySelector('.markdown-table-preview a')).toBeNull();
    cells[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(cells[0].querySelector('input')?.value).toBe('un | deux');
    cells[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = view.dom.querySelectorAll('td')[2].querySelector('input')!;
    expect(input.value).toBe('');
    input.value = 'vide';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace('|  | [lien]', '|  vide| [lien]'));
  });

  it('respecte les passages repliés à l’intérieur d’un tableau', () => {
    const text = 'Intro\n\n| A | B |\n| --- | --- |\n| secret | deux |\n\nFin';
    const section: Section = {
      id: 'scene',
      title: 'Scène',
      parent: null,
      position: 0,
      kind: 'scene',
      text,
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
      outline: {
        version: 1,
        nodes: [
          { id: 'intro', parent: null, start: 0 },
          { id: 'header', parent: null, start: text.indexOf('| A |') },
          { id: 'separator', parent: 'header', start: text.indexOf('| ---') },
          { id: 'body', parent: 'header', start: text.indexOf('| secret') },
          { id: 'end', parent: null, start: text.indexOf('Fin') },
        ],
      },
    };
    const data = compose([section]),
      mapping = sectionMapping(data.spans);
    const outline = outlineEditor([section], data.spans, mapping.field);
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: text,
        extensions: [
          mapping.extensions,
          outline.extensions,
          outlinePresentation(outline),
          markdown({ base: markdownLanguage }),
          liveMarkdown,
        ],
      }),
    });
    views.push(view);
    expect(view.dom.textContent).toContain('secret');
    expect(outline.toggleFold(view, 'header')).toBe(true);
    expect(view.dom.textContent).not.toContain('secret');
    expect(view.state.doc.toString()).toBe(text);
    expect(outline.toggleFold(view, 'header')).toBe(true);
    expect(view.dom.querySelector('table')?.textContent).toContain('secret');
  });

  it('affiche et édite un tableau dans une citation Markdown', () => {
    const source = 'Introduction\n\n> | A | B |\n> | --- | --- |\n> | un | deux |\n\nFin';
    const view = editor(source, 0);
    expect(view.dom.querySelector('.markdown-table-preview-quoted table')?.textContent).toContain(
      'deux',
    );
    view.dom
      .querySelectorAll('td')[1]
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = view.dom.querySelector('td input')! as HTMLInputElement;
    expect(input.value).toBe('deux');
    input.value = 'trois';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace('deux', 'trois'));
  });

  it('passe d’une cellule à la suivante au clavier', () => {
    const source = '| A | B |\n| --- | --- |\n| un | deux |';
    const view = editor(source, 0);
    const first = view.dom.querySelector('td')!;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = first.querySelector('input')!;
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect((document.activeElement as HTMLInputElement).value).toBe('deux');
    expect(view.state.doc.toString()).toBe(source);
  });

  it('ne duplique pas les espaces saisis pendant les modifications successives', () => {
    const source = '| A | B |\n| --- | --- |\n| un | deux |';
    const view = editor(source, 0);
    const cell = view.dom.querySelector('td')!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = cell.querySelector('input')!;
    input.value = 'un ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'un mot';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source.replace('un', 'un mot'));
    expect(document.activeElement).toBe(input);
  });

  it('applique le formatage à la sélection dans la cellule active', () => {
    const source = 'Introduction\n\n| A | B |\n| --- | --- |\n| un | deux |';
    const view = editor(source, 0);
    const cell = view.dom.querySelector('td')!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = cell.querySelector('input')!;
    input.setSelectionRange(0, 2);
    input.dispatchEvent(new Event('select', { bubbles: true }));
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(
      'un',
    );
    view.dispatch(formatMarkdown(view.state, 'bold'));
    expect(view.state.doc.toString()).toBe(source.replace('| un |', '| **un** |'));
  });

  it('permet de remplir une cellule manquante sans perdre les autres', () => {
    const source = '| A | B | C |\n| --- | --- | --- |\n| un |';
    const view = editor(source, 0);
    const cell = view.dom.querySelectorAll('td')[2];
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const input = cell.querySelector('input')!;
    input.value = 'trois';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe(source + '  | trois |');
  });

  it('ouvre et sélectionne la première cellule après insertion depuis la barre de formatage', () => {
    const view = editor('Début', 5);
    view.dispatch(formatMarkdown(view.state, 'table'));
    expect(focusTableCell(view, view.state.selection.main.from)).toBe(true);
    const input = document.activeElement as HTMLInputElement;
    expect(input.value).toBe('Colonne 1');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Colonne 1'.length);
  });
});
