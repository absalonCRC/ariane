// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { LanguageSwitcher } from '../src/components/LanguageSwitcher';
import { Welcome } from '../src/app/Welcome';
import { Settings } from '../src/app/Settings';
import { Preparation } from '../src/project/Preparation';
import { defaultSettings } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
import { type Source } from '../src/contracts/sources';
import { libraryOperationMessage } from '../src/project/library';
import { composeCitation } from '../src/sources/citations';
import {
  getLocale,
  localizeMessage,
  localeTag,
  savedLocale,
  setLocale,
  translate,
} from '../src/i18n';
import messages from '../src/i18n/messages.json';

vi.mock('../src/platform/client', () => ({ native: false, request: vi.fn(async () => []) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLDialogElement.prototype.show = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
afterEach(() => {
  setLocale('fr');
  localStorage.clear();
});

it('switches the welcome screen immediately and remembers the choice when reopened', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  try {
    await act(async () => root.render(<Welcome onOpen={vi.fn()} onError={vi.fn()} />));
    expect(host.textContent).toContain('Un espace pour écrire.');
    const select = host.querySelector('select')!;
    expect([...select.options].map((option) => option.value)).toEqual(['fr', 'en', 'es']);
    for (const [value, heading, button] of [
      ['en', 'A space to write.', 'Create a project'],
      ['es', 'Un espacio para escribir.', 'Crear un proyecto'],
      ['fr', 'Un espace pour écrire.', 'Créer un projet'],
    ] as const) {
      await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(host.querySelector('h1')?.textContent).toBe(heading);
      expect(host.textContent).toContain(button);
      expect(document.documentElement.lang).toBe(value);
      expect(localStorage.getItem('ariane.locale')).toBe(value);
      expect(savedLocale()).toBe(value);
    }
    await act(async () => {
      setLocale('es');
      root.render(null);
    });
    await act(async () => root.render(<Welcome onOpen={vi.fn()} onError={vi.fn()} />));
    expect(host.querySelector('select')?.value).toBe('es');
    expect(host.querySelector('h1')?.textContent).toBe('Un espacio para escribir.');
  } finally {
    await act(async () => root.unmount());
  }
});

it('updates an open writing panel without changing document settings', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    configure = vi.fn();
  const settings = { ...defaultSettings, language: 'fr' };
  try {
    await act(async () =>
      root.render(
        <>
          <LanguageSwitcher />
          <Settings
            value={settings}
            open
            onChange={configure}
            onClose={vi.fn()}
            canFormat
            onFormat={vi.fn()}
          />
        </>,
      ),
    );
    await act(async () => setLocale('en'));
    expect(host.textContent).toContain('Writing and reading');
    expect(host.textContent).toContain('Reading comfort');
    expect(host.querySelector('[aria-label="Bold"]')).not.toBeNull();
    await act(async () => setLocale('es'));
    expect(host.textContent).toContain('Escritura y lectura');
    expect(host.textContent).toContain('Comodidad de lectura');
    expect(host.querySelector('[aria-label="Negrita"]')).not.toBeNull();
    expect(configure).not.toHaveBeenCalled();
    expect(settings.language).toBe('fr');
    expect(localeTag()).toBe('es-ES');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps stored status values and note citation identifiers independent of the interface language', async () => {
  setLocale('es');
  const section: Section = {
    id: 'scene',
    title: 'Mon texte',
    text: 'Ne pas traduire.',
    parent: null,
    position: 0,
    kind: 'scene',
    revision: 1,
    synopsis: '',
    status: 'Brouillon',
    goal: 0,
  };
  const original = structuredClone(section),
    host = document.createElement('div'),
    root = createRoot(host),
    save = vi.fn();
  try {
    await act(async () =>
      root.render(<Preparation section={section} onSave={save} onClose={vi.fn()} />),
    );
    const select = host.querySelector('select')!;
    expect(select.value).toBe('Brouillon');
    expect(select.selectedOptions[0].text).toBe('Borrador');
    await act(async () => {
      select.value = 'À relire';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'À relire', title: 'Mon texte', text: 'Ne pas traduire.' }),
    );
    expect(section).toEqual(original);
    const source = {
      id: 'source',
      title: 'Fuente',
      text: '',
      path: 'source.md',
      fingerprint: '',
    } as Source;
    expect(composeCitation(source, 'Cita', 'notes')).toMatch(/\[\^source-source-/);
    expect(composeCitation(source, 'Cita', 'notes')).not.toContain('[@');
  } finally {
    await act(async () => root.unmount());
  }
});

it('falls back safely and translates errors without modifying interpolated file names', () => {
  localStorage.setItem('ariane.locale', 'invalid');
  expect(savedLocale()).toBe('fr');
  setLocale('en');
  expect(localizeMessage('Le texte « Été.md » n’est pas lisible en UTF-8.')).toBe(
    'The text “Été.md” cannot be read as UTF-8.',
  );
  setLocale('es');
  expect(localizeMessage('Error: Le projet actif a changé.')).toBe(
    'Error: El proyecto activo ha cambiado.',
  );
  expect(localizeMessage('Sources are ready.')).toBe('Las fuentes están listas.');
  expect(localizeMessage('ENOSPC /untranslated/path')).toBe('ENOSPC /untranslated/path');
  expect(translate('{0} result{1}', 'en', { 0: '$&', 1: 's' })).toBe('$& results');
  expect(getLocale()).toBe('es');
});

it('ships both translations for every static interface message, with valid placeholders', () => {
  const catalog: Record<string, string[]> = messages;
  for (const [source, translations] of Object.entries(catalog)) {
    expect(translations, source).toHaveLength(2);
    const placeholders = new Set(source.match(/\{\w+\}/g));
    for (const translated of translations) {
      expect(translated.trim(), source).not.toBe('');
      for (const placeholder of translated.match(/\{\w+\}/g) ?? [])
        expect(placeholders.has(placeholder), source + ': ' + translated).toBe(true);
    }
  }
  const sourceRoot = resolve('src');
  const missing: string[] = [];
  for (const relative of readdirSync(sourceRoot, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(relative)) continue;
    const file = ts.createSourceFile(
      relative,
      readFileSync(resolve(sourceRoot, relative), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(file) === 't' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        !catalog[node.arguments[0].text]
      )
        missing.push(relative + ': ' + node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  expect(missing).toEqual([]);
});

it('refreshes editor widgets in place while preserving manuscript text and selection', async () => {
  const { EditorState, Compartment } = await import('@codemirror/state');
  const { EditorView } = await import('@codemirror/view');
  const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown');
  const { liveMarkdown } = await import('../src/editor/markdown');
  const { editorPhrases } = await import('../src/i18n/editor');
  const parent = document.createElement('div');
  document.body.append(parent);
  const source = 'Introduction\n\n| Nom | Valeur |\n| --- | --- |\n| Élise | Deux |\n\nFin';
  const language = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor: 3 },
      extensions: [
        markdown({ base: markdownLanguage }),
        liveMarkdown,
        language.of(EditorState.phrases.of(editorPhrases())),
      ],
    }),
  });
  try {
    expect(view.dom.querySelector('[aria-label="Ajouter une ligne"]')).not.toBeNull();
    for (const [locale, rowLabel] of [
      ['en', 'Add row'],
      ['es', 'Añadir una fila'],
    ] as const) {
      setLocale(locale);
      view.dispatch({ effects: language.reconfigure(EditorState.phrases.of(editorPhrases())) });
      expect(view.dom.querySelector(`[aria-label="${rowLabel}"]`)).not.toBeNull();
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.main.head).toBe(3);
      expect(view.state.phrase('Go to line')).toBe(
        locale === 'en' ? 'Go to line' : 'Ir a la línea',
      );
    }
  } finally {
    view.destroy();
    parent.remove();
  }
});

it('keeps the refined inclusion notices and localizes them without editing the project', () => {
  const project = {
    path: 'preview',
    name: 'Projet',
    sections: [
      {
        id: 'scene',
        kind: 'scene',
        title: 'Mon texte',
        parent: null,
        position: 0,
        text: 'Texte conservé.',
        revision: 1,
        synopsis: '',
        status: 'Brouillon',
        goal: 0,
      },
    ],
    settings: {},
    recovered: false,
  } satisfies import('../src/contracts/project').Project;
  const original = structuredClone(project);
  setLocale('en');
  expect(
    libraryOperationMessage(project, { action: 'include', ids: ['scene'], included: true }),
  ).toBe('« Mon texte » included in the manuscript and export.');
  setLocale('es');
  expect(
    libraryOperationMessage(project, { action: 'include', ids: ['scene'], included: false }),
  ).toBe('« Mon texte » · texto de trabajo, fuera del manuscrito.');
  expect(project).toEqual(original);
});
