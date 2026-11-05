import type { MergePreview, MergeResolution, Version, WritingBranch } from '../contracts/history';
import type { Project, Section } from '../contracts/project';
import { descendants } from '../project/tree';
import { validOutline } from '../editor/outline/model';
import { mergeSections, validateMergedSections } from './merge';
import { previewCheckpoint, versionKey } from './previewAutomatic';

type Snapshot = {
  sections: Section[];
  settings: Project['settings'];
  references: Record<string, string>;
};
type Branch = WritingBranch & { draft: Snapshot; base: Snapshot };
type State = { activeBranch: string; branches: Branch[] };
type SavedVersion = Version & {
  settings?: Project['settings'];
  references?: Record<string, string>;
};
const stateKey = (path: string) => 'ariane.preview.branches.' + path;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function snapshot(p: Project): Snapshot {
  const references: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (
      key.startsWith('ariane.preview.links.' + p.path + '.') ||
      key.startsWith('ariane.preview.marginPins.' + p.path + '.')
    )
      references[key] = localStorage.getItem(key)!;
  }
  return clone({ sections: [...p.sections, ...(p.trash ?? [])], settings: p.settings, references });
}
function read(p: Project): State {
  const stored = localStorage.getItem(stateKey(p.path));
  if (stored) return JSON.parse(stored);
  const initial = snapshot(p);
  return {
    activeBranch: 'main',
    branches: [
      {
        id: 'main',
        name: 'Texte principal',
        created: new Date().toISOString(),
        isMain: true,
        baseVersion: null,
        headVersion: null,
        draft: initial,
        base: initial,
      },
    ],
  };
}
function versions(p: Project): SavedVersion[] {
  return JSON.parse(localStorage.getItem(versionKey(p.path)) ?? '[]');
}
function commit(values: Record<string, string | null>) {
  const previous = Object.fromEntries(Object.keys(values).map((k) => [k, localStorage.getItem(k)]));
  try {
    for (const [k, v] of Object.entries(values)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  } catch (error) {
    for (const [k, v] of Object.entries(previous)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    throw error;
  }
}
function persist(p: Project, state: State, all: SavedVersion[], next?: Snapshot): Project {
  const changes: Record<string, string | null> = {
    [stateKey(p.path)]: JSON.stringify(state),
    [versionKey(p.path)]: JSON.stringify(all),
  };
  let result = p;
  if (next) {
    validateMergedSections(next.sections);
    result = {
      ...p,
      sections: next.sections.filter((s) => !s.trashed),
      trash: next.sections.filter((s) => s.trashed),
      settings: next.settings,
      canUndoStructure: false,
    };
    result = clone(result);
    for (const s of [...result.sections, ...(result.trash ?? [])])
      s.revision = Math.max(s.revision, p.sections.find((v) => v.id === s.id)?.revision ?? 0) + 1;
    const projects = JSON.parse(localStorage.getItem('ariane.preview.projects.v1') ?? '{}');
    changes['ariane.preview.projects.v1'] = JSON.stringify({ ...projects, [p.path]: result });
    changes['ariane.preview.structure.' + p.path] = null;
    for (const k of Object.keys(snapshot(p).references)) changes[k] = null;
    Object.assign(changes, next.references);
  }
  commit(changes);
  return result;
}
function capture(
  p: Project,
  state: State,
  all: SavedVersion[],
  name: string,
  scope: string | null,
  snap = snapshot(p),
): SavedVersion {
  if (!name.trim()) throw new Error('Nommez cette version.');
  const branch = state.branches.find((b) => b.id === state.activeBranch)!;
  const v: SavedVersion = {
    id: crypto.randomUUID(),
    name: name.trim(),
    created: new Date().toISOString(),
    scope,
    sections: clone(scope ? descendants(snap.sections, scope) : snap.sections),
    settings: clone(snap.settings),
    references: clone(snap.references),
    branchId: branch.id,
    parentId: branch.headVersion,
    automatic: false,
  };
  all.unshift(v);
  if (!scope && name !== 'Origine de la variante') branch.headVersion = v.id;
  return v;
}
function workspace(p: Project, state: State, id: string): Snapshot {
  return id === state.activeBranch ? snapshot(p) : state.branches.find((b) => b.id === id)!.draft;
}
function plan(
  p: Project,
  state: State,
  sourceId: string,
): { preview: MergePreview; result: Snapshot } {
  const source = state.branches.find((b) => b.id === sourceId),
    target = state.branches.find((b) => b.isMain)!;
  if (!source || source.isMain) throw new Error('Choisissez une variante à intégrer.');
  const base = source.base,
    current = workspace(p, state, target.id),
    incoming = workspace(p, state, source.id);
  const entries = mergeSections(base.sections, current.sections, incoming.sections);
  const result: Snapshot = {
    sections: entries.flatMap((e) => (e.result ? [clone(e.result)] : [])),
    settings: { ...current.settings },
    references: { ...current.references },
  };
  const auxiliaryConflicts: MergePreview['auxiliaryConflicts'] = [];
  for (const category of ['settings', 'references'] as const) {
    const b = base[category] as Record<string, unknown>,
      a = current[category] as Record<string, unknown>,
      z = incoming[category] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(b), ...Object.keys(a), ...Object.keys(z)])) {
      if (
        JSON.stringify(a[key]) === JSON.stringify(z[key]) ||
        JSON.stringify(b[key]) === JSON.stringify(z[key])
      )
        continue;
      if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
        if (key in z) (result[category] as Record<string, unknown>)[key] = z[key];
        else delete (result[category] as Record<string, unknown>)[key];
      } else
        auxiliaryConflicts.push({
          id: category + ':' + key,
          label: category === 'settings' ? 'Réglage du projet' : 'Référence du texte',
          current: JSON.stringify(a[key] ?? null),
          incoming: JSON.stringify(z[key] ?? null),
        });
    }
  }
  // Exact state token is local-only and checked again before every mutation.
  const auxiliaryChanges =
    Object.keys({ ...current.settings, ...result.settings }).filter(
      (k) =>
        JSON.stringify((current.settings as Record<string, unknown>)[k]) !==
        JSON.stringify((result.settings as Record<string, unknown>)[k]),
    ).length +
    Object.keys({ ...current.references, ...result.references }).filter(
      (k) => current.references[k] !== result.references[k],
    ).length;
  const token = JSON.stringify([base, current, incoming, source.id, state.activeBranch]);
  return {
    preview: { source, target, token, entries, auxiliaryConflicts, auxiliaryChanges },
    result,
  };
}
export function previewHistory(
  p: Project,
  type: string,
  a: Record<string, unknown>,
): { value: unknown } | null {
  if (
    ![
      'historyState',
      'createBranch',
      'switchBranch',
      'promoteVersion',
      'mergePreview',
      'mergeBranch',
      'versions',
      'version',
      'capture',
      'restore',
      'automaticVersion',
    ].includes(type)
  )
    return null;
  if (!['versions', 'version', 'capture', 'restore'].includes(type) && a.projectPath !== p.path)
    throw new Error('Le projet actif a changé.');
  const state = read(p),
    all = versions(p),
    active = state.branches.find((b) => b.id === state.activeBranch)!;
  if (type === 'historyState')
    return {
      value: {
        activeBranch: state.activeBranch,
        branches: state.branches.map(({ draft: _draft, base: _base, ...b }) => b),
      },
    };
  if (type === 'versions')
    return {
      value: all
        .filter((v) => (v.branchId ?? 'main') === state.activeBranch)
        .slice(Number(a.offset ?? 0), Number(a.offset ?? 0) + 50)
        .map((v) => ({ ...v, sections: [] })),
    };
  if (type === 'version') {
    const v = all.find((v) => v.id === a.id);
    if (!v) throw new Error('Version introuvable.');
    return { value: v };
  }
  if (type === 'capture') {
    const v = capture(p, state, all, String(a.name ?? ''), (a.scope as string | null) ?? null);
    persist(p, state, all);
    return { value: v };
  }
  if (type === 'automaticVersion') {
    const v = previewCheckpoint(p, String(a.scope));
    return { value: v ? { ...v, sections: [] } : null };
  }
  if (type === 'promoteVersion') {
    const v = all.find((v) => v.id === a.id && (v.branchId ?? 'main') === state.activeBranch);
    if (!v) throw new Error('Version introuvable.');
    if (!String(a.name ?? '').trim()) throw new Error('Nommez cette version.');
    v.name = String(a.name).trim();
    v.automatic = false;
    persist(p, state, all);
    return { value: v };
  }
  if (type === 'createBranch') {
    const name = String(a.name ?? '').trim();
    if (!name) throw new Error('Nommez cette variante.');
    if (state.branches.some((b) => b.name.toLowerCase() === name.toLowerCase()))
      throw new Error('Une variante porte déjà ce nom.');
    let snap = snapshot(p);
    if (a.fromVersion) {
      const v = all.find((v) => v.id === a.fromVersion);
      if (!v) throw new Error('Version introuvable.');
      if (v.scope)
        throw new Error('Choisissez une version de tout le projet pour créer une variante.');
      snap = {
        sections: v.sections,
        settings: v.settings ?? p.settings,
        references: v.references ?? snap.references,
      };
    }
    const originVersion = a.fromVersion ? all.find((v) => v.id === a.fromVersion) : null;
    const originBranch = originVersion
      ? state.branches.find((b) => b.id === (originVersion.branchId ?? 'main'))!
      : active;
    const mergeBase = originBranch.isMain ? snap : originBranch.base;
    active.draft = snapshot(p);
    const base = capture(p, state, all, 'Origine de la variante', null, snap);
    const branch: Branch = {
      id: crypto.randomUUID(),
      name,
      created: new Date().toISOString(),
      isMain: false,
      baseVersion: base.id,
      headVersion: base.id,
      draft: clone(snap),
      base: clone(mergeBase),
    };
    state.branches.push(branch);
    state.activeBranch = branch.id;
    return { value: persist(p, state, all, snap) };
  }
  if (type === 'switchBranch') {
    const branch = state.branches.find((b) => b.id === a.id);
    if (!branch) throw new Error('Variante introuvable.');
    if (branch.id === active.id) return { value: p };
    active.draft = snapshot(p);
    state.activeBranch = branch.id;
    return { value: persist(p, state, all, branch.draft) };
  }
  if (type === 'restore') {
    const v = all.find((v) => v.id === a.id);
    if (!v) throw new Error('Version introuvable.');
    if ((v.branchId ?? 'main') !== state.activeBranch) {
      const queue = [active.headVersion, active.baseVersion];
      const seen = new Set<string>();
      while (queue.length) {
        const id = queue.pop();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const ancestor = all.find((item) => item.id === id);
        if (ancestor) queue.push(ancestor.parentId ?? null, ancestor.mergeParentId ?? null);
      }
      if (!seen.has(v.id)) throw new Error('Cette version appartient à une autre variante.');
    }
    const previous = snapshot(p);
    capture(p, state, all, 'Avant restauration', v.scope);
    const affected = new Set(
      v.scope
        ? descendants(previous.sections, v.scope).map((s) => s.id)
        : previous.sections.map((s) => s.id),
    );
    const references = { ...previous.references };
    if (v.references) {
      if (v.scope)
        for (const k of Object.keys(references)) {
          const prefix = k.startsWith('ariane.preview.links.')
            ? 'ariane.preview.links.' + p.path + '.'
            : 'ariane.preview.marginPins.' + p.path + '.';
          if (affected.has(k.slice(prefix.length))) delete references[k];
        }
      else for (const k of Object.keys(references)) delete references[k];
      Object.assign(references, v.references);
    }
    const next: Snapshot = {
      sections: [...previous.sections.filter((s) => !affected.has(s.id)), ...clone(v.sections)],
      settings: v.scope ? previous.settings : (v.settings ?? previous.settings),
      references,
    };
    return { value: persist(p, state, all, next) };
  }
  const { preview, result } = plan(p, state, String(a.source));
  if (type === 'mergePreview') return { value: preview };
  if (a.token !== preview.token)
    throw new Error('Le texte a changé depuis la relecture. Actualisez la comparaison.');
  const resolutions = a.resolutions as MergeResolution[];
  const ids = new Set<string>();
  for (const r of resolutions) {
    if (ids.has(r.id) || !['current', 'incoming', 'custom'].includes(r.choice))
      throw new Error('Choix de relecture invalide.');
    ids.add(r.id);
  }
  for (const entry of preview.entries) {
    if (!entry.conflict && !resolutions.some((r) => r.id === entry.id)) continue;
    const r = resolutions.find((r) => r.id === entry.id);
    if (!r) throw new Error('Choisissez une résolution pour chaque passage en divergence.');
    let chosen = r.choice === 'current' ? entry.current : entry.incoming;
    if (
      r.choice !== 'custom' &&
      entry.conflict &&
      entry.result &&
      chosen &&
      entry.fields.every((f) => f === 'text' || f === 'outline')
    ) {
      const merged = { ...entry.result };
      if (entry.fields.includes('text')) merged.text = chosen.text;
      if (entry.fields.includes('outline')) merged.outline = chosen.outline;
      if (merged.outline && !validOutline(merged.text, merged.outline))
        throw new Error(
          'Le plan ne correspond pas au texte choisi. Choisissez l’autre texte ou réécrivez le passage.',
        );
      chosen = merged;
    }
    if (r.choice === 'custom') {
      if (
        !entry.result ||
        entry.fields.some((f) => f !== 'text' && f !== 'outline') ||
        typeof r.text !== 'string'
      )
        throw new Error('Choisissez un côté pour les changements de structure.');
      chosen = { ...entry.result, text: r.text, outline: null };
    }
    result.sections = result.sections.filter((s) => s.id !== entry.id);
    if (chosen) result.sections.push(clone(chosen));
  }
  for (const conflict of preview.auxiliaryConflicts) {
    const r = resolutions.find((r) => r.id === conflict.id);
    if (!r || r.choice === 'custom')
      throw new Error('Choisissez une résolution pour chaque référence en divergence.');
    const category = conflict.id.startsWith('settings:') ? 'settings' : 'references',
      key = conflict.id.slice(category.length + 1);
    const value = JSON.parse(r.choice === 'current' ? conflict.current : conflict.incoming);
    if (value === null) delete (result[category] as Record<string, unknown>)[key];
    else (result[category] as Record<string, unknown>)[key] = value;
  }
  validateMergedSections(result.sections);
  const incoming = clone(workspace(p, state, preview.source.id)),
    before = clone(workspace(p, state, preview.target.id));
  active.draft = snapshot(p);
  state.activeBranch = preview.source.id;
  const sourceVersion = capture(p, state, all, 'Variante relue avant intégration', null, incoming);
  state.activeBranch = preview.target.id;
  capture(p, state, all, 'Avant intégration', null, before);
  const merged = capture(p, state, all, 'Intégration · ' + preview.source.name, null, result);
  merged.mergeParentId = sourceVersion.id;
  for (const e of preview.entries.filter((e) => !e.conflict)) {
    if (
      resolutions.some((r) => r.id === e.id && (r.choice === 'current' || r.choice === 'custom'))
    ) {
      incoming.sections = incoming.sections.filter((s) => s.id !== e.id);
      if (e.base) incoming.sections.push(clone(e.base));
    }
  }
  const source = state.branches.find((b) => b.id === preview.source.id)!;
  source.base = incoming;
  source.baseVersion = sourceVersion.id;
  state.branches.find((b) => b.isMain)!.draft = clone(result);
  return { value: persist(p, state, all, result) };
}
