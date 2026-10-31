import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Project, Section, Source, TextPatch, Version, Vault } from './types';
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
    name: 'Vault Ariane',
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
  if (!p) throw new Error('Ouvrez un projet pour continuer.');
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
function browserRequest(type: string, a: Record<string, unknown>): unknown {
  if (type === 'revisionStatus') return { available: false };
  if (type === 'bootstrap') return read()[current || ''] || null;
  if (type === 'engineStatus')
    return { available: false, model: 'Disponible dans l’application macOS', local: true };
  if (type === 'create') {
    const p: Project = {
      path: String(a.path),
      name: String(a.name),
      sections: [newSection('Sans titre', null, 'scene')],
      settings: {},
      recovered: false,
    };
    store(p);
    makePreviewVault(p.path);
    current = p.path;
    localStorage.setItem('ariane.preview.current', current);
    return p;
  }
  if (type === 'open') {
    current = String(a.path);
    localStorage.setItem('ariane.preview.current', current);
    return project();
  }
  const p = project();
  if (type === 'save') {
    const patches = a.patches as TextPatch[];
    const ids = new Set<string>();
    for (const patch of patches) {
      const s = p.sections.find((s) => s.id === patch.id);
      if (!s || s.revision !== patch.revision) throw new Error('Version de texte périmée.');
      if (ids.has(patch.id)) throw new Error('Section répétée dans la sauvegarde.');
      ids.add(patch.id);
      if (patch.outline && !validOutline(patch.text, patch.outline))
        throw new Error('Structure de passages invalide.');
    }
    for (const patch of patches) {
      const s = p.sections.find((s) => s.id === patch.id)!;
      const outline = patch.outline ?? (s.text === patch.text ? s.outline : null);
      if (s.text !== patch.text || JSON.stringify(s.outline ?? null) !== JSON.stringify(outline ?? null))
        s.revision++;
      s.text = patch.text;
      s.outline = outline;
    }
    store(p);
    return patches.map((x) => ({
      id: x.id,
      revision: p.sections.find((s) => s.id === x.id)!.revision,
    }));
  }
  if (type === 'add') {
    p.sections.push(
      newSection(
        String(a.title),
        a.parent as string | null,
        a.kind as Section['kind'],
        p.sections.length,
      ),
    );
    store(p);
    return p.sections;
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
    if (previewVault(p.path)) throw new Error('Ce projet possède déjà un vault.');
    return [makePreviewVault(p.path)];
  }
  if (type === 'createVaultEntity') {
    const vault = previewVault(p.path);
    if (!vault) throw new Error('Créez un vault Ariane.');
    const labels: Record<string, string> = {
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
      throw new Error('Nom ou type de fiche invalide.');
    const values = previewSources(p.path);
    if (values.some((s) => s.kind === kind && s.title === title))
      throw new Error('Cette fiche existe déjà.');
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
  const versionKey = 'ariane.preview.versions.' + p.path;
  if (type === 'version')
    return (JSON.parse(localStorage.getItem(versionKey) || '[]') as Version[]).find(
      (v) => v.id === a.id,
    );
  if (type === 'versions') return JSON.parse(localStorage.getItem(versionKey) || '[]');
  if (type === 'capture') {
    const versions = JSON.parse(localStorage.getItem(versionKey) || '[]') as Version[];
    const v = {
      id: crypto.randomUUID(),
      name: String(a.name),
      created: new Date().toISOString(),
      scope: a.scope as string | null,
      sections: p.sections,
    };
    versions.unshift(v);
    localStorage.setItem(versionKey, JSON.stringify(versions));
    return v;
  }
  if (type === 'restore') {
    const versions = JSON.parse(localStorage.getItem(versionKey) || '[]') as Version[];
    const v = versions.find((v) => v.id === a.id);
    if (!v) throw new Error('Version introuvable');
    browserRequest('capture', { name: 'Avant restauration', scope: null });
    p.sections = v.sections;
    store(p);
    return p;
  }
  if (type === 'suggest' || type === 'search') {
    const input = String(type === 'suggest' ? a.text : a.query).toLocaleLowerCase();
    return previewSources(p.path).filter((source) =>
      type === 'suggest'
        ? input.includes(source.title.toLocaleLowerCase())
        : source.title.toLocaleLowerCase().includes(input) ||
          source.text.toLocaleLowerCase().includes(input),
    );
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
    'Cette fonction utilise le moteur Rust et les fichiers locaux. Ouvrez l’application macOS.',
  );
}
export function browserProjects() {
  return Object.values(read());
}
