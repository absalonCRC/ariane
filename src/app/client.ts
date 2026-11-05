import { previewHistory } from '../history/previewBranches';
import { previewCheckpoint } from '../history/previewAutomatic';
import { t } from '../i18n';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Project, Section, Source, TextPatch, Vault } from './types';
import {
  applyLibraryOperation,
  structureSnapshot,
  type LibraryOperation,
  type StructurePosition,
} from '../project/library';
import type { ProjectEntry } from './types';
import { validOutline } from '../editor/outline/model';
export const native = isTauri();
export async function request<T>(type: string, args: Record<string, unknown> = {}): Promise<T> {
  if (native) return invoke<T>('dispatch', { request: { type, ...args } });
  return browserRequest(type, args) as T;
}
// The browser adapter provides real local persistence for development and visual QA.
// Filesystem, embeddings and document conversion belong exclusively to the Rust adapter.
const storageKey = 'ariane.preview.projects.v1';
let current = localStorage.getItem('ariane.preview.current');
const read = (): Record<string, Project> => JSON.parse(localStorage.getItem(storageKey) || '{}');
const previewVaultKey = (path: string) => 'ariane.preview.vault.' + path;
const previewSourcesKey = (path: string) => 'ariane.preview.sources.' + path;
function previewVault(path: string): Vault | null {
  return JSON.parse(localStorage.getItem(previewVaultKey(path)) || 'null') as Vault | null;
}
function previewSources(path: string): Source[] {
  return JSON.parse(localStorage.getItem(previewSourcesKey(path)) || '[]') as Source[];
}
function makePreviewVault(path: string): Vault {
  const vault: Vault = {
    id: crypto.randomUUID(),
    path: 'Aperçu navigateur',
    name: 'Vault ariane',
    scope: [],
    count: 0,
    available: true,
    owned: true,
  };
  localStorage.setItem(previewVaultKey(path), JSON.stringify(vault));
  return vault;
}
function store(p: Project) {
  const all = read();
  all[p.path] = p;
  localStorage.setItem(storageKey, JSON.stringify(all));
}
function project() {
  const p = read()[current || ''];
  if (!p) throw new Error(t('Ouvrez un projet pour continuer.'));
  return p;
}
export function newSection(
  title: string,
  parent: string | null,
  kind: Section['kind'],
  position = 0,
): Section {
  return {
    id: crypto.randomUUID(),
    parent,
    title,
    kind,
    position,
    text: '',
    revision: 0,
    synopsis: '',
    status: 'Brouillon',
    goal: 0,
  };
}
function catalog(): ProjectEntry[] {
  return JSON.parse(localStorage.getItem('ariane.preview.catalog') || '[]');
}
function remember(p: Project) {
  const entries = catalog();
  const old = entries.find((e) => e.path === p.path);
  const entry: ProjectEntry = {
    path: p.path,
    name: p.name,
    pinned: false,
    archived: false,
    available: true,
    ...old,
    lastOpened: new Date().toISOString(),
  };
  localStorage.setItem(
    'ariane.preview.catalog',
    JSON.stringify([entry, ...entries.filter((e) => e.path !== p.path)]),
  );
}
function browserRequest(type: string, a: Record<string, unknown>): unknown {
  if (type === 'revisionStatus') return { available: false };
  if (type === 'bootstrap') {
    const p = read()[current || ''];
    if (p) remember(p);
    return p || null;
  }
  if (type === 'projects')
    return catalog().sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastOpened.localeCompare(a.lastOpened),
    );
  if (type === 'projectCatalog') {
    const entries = catalog().map((e) =>
      e.path === a.path ? { ...e, pinned: !!a.pinned, archived: !!a.archived } : e,
    );
    localStorage.setItem('ariane.preview.catalog', JSON.stringify(entries));
    return entries;
  }
  if (type === 'engineStatus')
    return { available: false, model: t('Disponible dans l’application macOS'), local: true };
  if (type === 'create') {
    const p: Project = {
      path: String(a.path),
      name: String(a.name),
      sections: [newSection(String(a.initialTitle || t('Sans titre')), null, 'scene')],
      settings: {},
      recovered: false,
    };
    store(p);
    remember(p);
    makePreviewVault(p.path);
    current = p.path;
    localStorage.setItem('ariane.preview.current', current);
    return p;
  }
  if (type === 'open') {
    current = String(a.path);
    localStorage.setItem('ariane.preview.current', current);
    const p = project();
    remember(p);
    return p;
  }
  const p = project();
  const history = previewHistory(p, type, a);
  if (history) return history.value;
  if (['annotations', 'addAnnotation', 'updateAnnotation', 'manuscriptOperation'].includes(type))
    throw new Error(t('Cette fonction est disponible dans l’application Mac.'));
  if (type === 'libraryOperation') {
    const op = a.operation as LibraryOperation;
    const key = 'ariane.preview.structure.' + p.path;
    const history: StructurePosition[][] = JSON.parse(localStorage.getItem(key) || '[]');
    const result = applyLibraryOperation(p, op, history.at(-1));
    if (op.action === 'undo') history.pop();
    else history.push(structureSnapshot(p));
    for (const copy of result.copies)
      localStorage.setItem(
        'ariane.preview.links.' + p.path + '.' + copy.to,
        localStorage.getItem('ariane.preview.links.' + p.path + '.' + copy.from) || '[]',
      );
    result.project.canUndoStructure = history.length > 0;
    store(result.project);
    localStorage.setItem(key, JSON.stringify(history));
    return result.project;
  }
  if (type === 'noteReferences')
    return previewSources(p.path).filter((s) => (a.ids as string[]).includes(s.id));
  if (type === 'classifyCreatedNote') return { pending: false };
  if (type === 'noteSuggestions' || type === 'createQuickNote') {
    if (a.projectPath !== p.path) throw new Error(t('Ouvrez un projet pour continuer.'));
    const fold = (value: string) =>
      value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '');
    const values = previewSources(p.path);
    const query = fold(String(a.query ?? a.name ?? ''));
    if (type === 'noteSuggestions')
      return values
        .filter((s) => [s.title, ...s.aliases].some((n) => fold(n).includes(query)))
        .slice(0, 20);
    const existing = values.filter((s) => [s.title, ...s.aliases].some((n) => fold(n) === query));
    if (existing.length > 1)
      throw new Error('Plusieurs notes portent ce nom. Utilisez @ pour choisir la note.');
    if (existing.length) return existing[0];
    if (!previewVault(p.path)) makePreviewVault(p.path);
    browserRequest('createVaultEntity', { kind: 'note', name: a.name });
    return previewSources(p.path).at(-1);
  }
  if (type === 'updateSourceAliases') {
    if (a.projectPath !== p.path) throw new Error('Le projet actif a changé.');
    const values = previewSources(p.path);
    const source = values.find((s) => s.id === a.source);
    if (!source || source.vaultId !== previewVault(p.path)?.id)
      throw new Error('Fiche non modifiable.');
    source.aliases = [...new Set((a.aliases as string[]).map((s) => s.trim()).filter(Boolean))];
    localStorage.setItem(previewSourcesKey(p.path), JSON.stringify(values));
    return source;
  }
  if (type === 'browseSources') {
    const all = previewSources(p.path).filter((s) => !a.vault || s.vaultId === a.vault);
    const query = String(a.query || '').toLocaleLowerCase();
    const values = all.filter(
      (s) =>
        (!a.kind || s.kind === a.kind) &&
        (!a.folder || s.path.startsWith(String(a.folder) + '/')) &&
        (s.title.toLocaleLowerCase().includes(query) || s.text.toLocaleLowerCase().includes(query)),
    );
    const offset = Number(a.offset || 0);
    return {
      types: [...new Set(all.map((s) => s.kind))]
        .sort()
        .map((kind) => ({ kind, count: all.filter((s) => s.kind === kind).length })),
      items: values.slice(offset, offset + 50),
      total: values.length,
      kinds: [...new Set(all.map((s) => s.kind))].sort(),
      folders: [
        ...new Set(all.map((s) => s.path.split('/').slice(0, -1).join('/')).filter(Boolean)),
      ].sort(),
    };
  }
  if (type === 'save') {
    const patches = a.patches as TextPatch[];
    const ids = new Set<string>();
    for (const patch of patches) {
      const s = p.sections.find((s) => s.id === patch.id);
      if (!s || s.revision !== patch.revision) throw new Error(t('Version de texte périmée.'));
      if (ids.has(patch.id)) throw new Error(t('Section répétée dans la sauvegarde.'));
      ids.add(patch.id);
      if (patch.outline && !validOutline(patch.text, patch.outline))
        throw new Error(t('Structure de passages invalide.'));
    }
    for (const patch of patches) {
      const s = p.sections.find((s) => s.id === patch.id)!;
      const outline = patch.outline ?? (s.text === patch.text ? s.outline : null);
      if (s.text && s.text !== patch.text) {
        const old = [...s.text],
          next = [...patch.text];
        let prefix = 0,
          suffix = 0;
        while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix])
          prefix++;
        while (
          suffix < old.length - prefix &&
          suffix < next.length - prefix &&
          old.at(-1 - suffix) === next.at(-1 - suffix)
        )
          suffix++;
        const removed = old.length - prefix - suffix;
        previewCheckpoint(p, s.id, removed >= 200 && removed >= old.length / 3);
      }
      if (
        s.text !== patch.text ||
        JSON.stringify(s.outline ?? null) !== JSON.stringify(outline ?? null)
      )
        s.revision++;
      s.text = patch.text;
      s.outline = outline;
    }
    store(p);
    for (const patch of patches) if (patch.text) previewCheckpoint(p, patch.id, false);
    return {
      mirrorErrors: [],
      sections: patches.map((x) => ({
        id: x.id,
        revision: p.sections.find((s) => s.id === x.id)!.revision,
      })),
    };
  }
  if (type === 'add') {
    const result = browserRequest('libraryOperation', {
      operation: { action: 'add', target: a.parent, title: a.title, kind: a.kind, role: a.role },
    }) as Project;
    return result.sections;
  }
  if (type === 'update') {
    const incoming = a.section as Section;
    p.sections = p.sections.map((s) =>
      s.id === incoming.id
        ? {
            ...s,
            title: incoming.title,
            synopsis: incoming.synopsis,
            status: incoming.status,
            goal: incoming.goal,
          }
        : s,
    );
    store(p);
    return p.sections;
  }
  if (type === 'reorder') {
    applyLibraryOperation(p, {
      action: 'move',
      ids: [String(a.id)],
      target: a.parent as string | null,
    });
    p.sections = (a.ids as string[]).map((id, i) => ({
      ...p.sections.find((s) => s.id === id)!,
      position: i,
    }));
    p.sections.find((s) => s.id === a.id)!.parent = a.parent as string | null;
    store(p);
    return p.sections;
  }
  if (type === 'settings') {
    p.settings = a.value as Project['settings'];
    store(p);
    return null;
  }
  if (type === 'vaults') {
    const vault = previewVault(p.path);
    return vault ? [{ ...vault, count: previewSources(p.path).length }] : [];
  }
  if (type === 'createOwnedVault') {
    if (previewVault(p.path)) throw new Error(t('Ce projet possède déjà un vault.'));
    return [makePreviewVault(p.path)];
  }
  if (type === 'createVaultEntity') {
    const vault = previewVault(p.path);
    if (!vault) throw new Error(t('Créez un vault ariane.'));
    const labels: Record<string, string> = {
      note: 'Note',
      personne: 'Personne',
      lieu: 'Lieu',
      organisation: 'Organisation',
      evenement: 'Événement',
      concept: 'Concept',
      croyance: 'Croyance ou tradition',
      oeuvre: 'Œuvre',
      document: 'Document ou source',
      objet: 'Objet',
    };
    const title = String(a.name || '').trim(),
      kind = labels[String(a.kind)];
    if (!kind || !title || /[/:\\\u0000-\u001f]/u.test(title) || title === '.' || title === '..')
      throw new Error(t('Nom ou type de fiche invalide.'));
    const values = previewSources(p.path);
    if (values.some((s) => s.kind === kind && s.title === title))
      throw new Error(t('Cette fiche existe déjà.'));
    values.push({
      id: crypto.randomUUID(),
      vaultId: vault.id,
      path: `${kind}/${title}.md`,
      title,
      kind,
      aliases: [],
      tags: [],
      fields: { type: kind },
      text: String(a.description || ''),
      page: null,
      matched: null,
      score: 0,
      fingerprint: '',
    });
    localStorage.setItem(previewSourcesKey(p.path), JSON.stringify(values));
    return { path: `${kind}/${title}.md` };
  }
  if (type === 'index') return { errors: [], semantic: false };
  if (type === 'source') return previewSources(p.path).find((source) => source.id === a.id);
  if (type === 'suggest' || type === 'search') {
    const input = String(type === 'suggest' ? a.text : a.query).toLocaleLowerCase();
    return previewSources(p.path).filter((source) =>
      type === 'suggest'
        ? input.includes(source.title.toLocaleLowerCase())
        : source.title.toLocaleLowerCase().includes(input) ||
          source.text.toLocaleLowerCase().includes(input),
    );
  }
  if (['marginPins', 'pinSource', 'unpinSource'].includes(type)) {
    if (a.projectPath !== p.path) throw new Error('Le projet actif a changé.');
    if (!p.sections.some((s) => s.id === a.section && s.kind === 'scene' && !s.trashed))
      throw new Error('Texte introuvable.');
    const key = 'ariane.preview.marginPins.' + p.path + '.' + a.section;
    let pins = JSON.parse(localStorage.getItem(key) || '[]') as Source[];
    if (type === 'pinSource') {
      const source = previewSources(p.path).find((s) => s.id === a.id);
      if (!source) throw new Error('Fiche introuvable.');
      pins = [...pins.filter((s) => s.id !== source.id), source];
    } else if (type === 'unpinSource') pins = pins.filter((s) => s.id !== a.id);
    localStorage.setItem(key, JSON.stringify(pins));
    return pins;
  }
  if (type === 'associate') {
    const key = 'ariane.preview.links.' + p.path + '.' + a.section;
    const values = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = values.filter((x: { id: string }) => x.id !== a.id);
    filtered.push(a.payload);
    localStorage.setItem(key, JSON.stringify(filtered));
    return null;
  }
  if (type === 'links')
    return JSON.parse(
      localStorage.getItem('ariane.preview.links.' + p.path + '.' + a.section) || '[]',
    );
  if (type === 'cite') return true;
  throw new Error(
    t('Cette fonction utilise le moteur Rust et les fichiers locaux. Ouvrez l’application macOS.'),
  );
}
export function browserProjects() {
  return Object.values(read());
}
