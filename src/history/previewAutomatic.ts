import type { Project } from '../contracts/project';
import type { Version } from '../contracts/history';
import { descendants } from '../project/tree';
// The browser preview has a small localStorage quota; native projects use 128 MiB in SQLite.
const budget = 2 * 1024 * 1024;
export const versionKey = (path: string) => 'ariane.preview.versions.' + path;
type AutomaticSnapshot = Pick<Version, 'sections'> & { references?: Record<string, string> };
const signature = (v: AutomaticSnapshot) =>
  JSON.stringify([v.sections.map((s) => ({ ...s, revision: 0 })), v.references ?? {}]);
export function previewCheckpoint(p: Project, scope: string, force = true): Version | null {
  const key = versionKey(p.path);
  const versions = JSON.parse(localStorage.getItem(key) || '[]') as (Version & {
    references?: Record<string, string>;
  })[];
  const branchState = JSON.parse(
    localStorage.getItem('ariane.preview.branches.' + p.path) || 'null',
  );
  const branchId: string = branchState?.activeBranch ?? 'main';
  const last = versions.find(
    (v) => v.automatic && v.scope === scope && (v.branchId ?? 'main') === branchId,
  );
  if (!force && last && Date.now() - Date.parse(last.created) < 300_000) return null;
  const sections = descendants([...p.sections, ...(p.trash || [])], scope);
  const ids = new Set(sections.map((s) => s.id)),
    references: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    for (const prefix of [
      'ariane.preview.links.' + p.path + '.',
      'ariane.preview.marginPins.' + p.path + '.',
    ])
      if (key.startsWith(prefix) && ids.has(key.slice(prefix.length)))
        references[key] = localStorage.getItem(key)!;
  }
  if (!sections.length || (last && signature(last) === signature({ sections, references })))
    return null;
  const version: Version & { references: Record<string, string> } = {
    references,
    id: crypto.randomUUID(),
    name: 'Sauvegarde automatique',
    created: new Date().toISOString(),
    scope,
    sections,
    automatic: true,
    branchId,
    parentId:
      branchState?.branches.find((b: { id: string }) => b.id === branchId)?.headVersion ?? null,
    sessionId: (() => {
      const previous = versions.find((v) => (v.branchId ?? 'main') === branchId && v.sessionId);
      return previous && Date.now() - Date.parse(previous.created) < 1_800_000
        ? previous.sessionId
        : crypto.randomUUID();
    })(),
  };
  const bytes = (v: Version) => new TextEncoder().encode(JSON.stringify(v)).length;
  if (bytes(version) > budget) return null;
  const counts = new Map<string | null, number>(),
    buckets = new Set<string>();
  let used = 0;
  const retained = [version, ...versions].filter((v) => {
    if (!v.automatic) return true;
    const scopeKey = `${v.branchId ?? 'main'}:${v.scope}`;
    const count = counts.get(scopeKey) || 0,
      time = Date.parse(v.created),
      age = Date.now() - time;
    const bucket = `${scopeKey}:${age >= 86_400_000}:${Math.floor(time / (age < 86_400_000 ? 3_600_000 : 86_400_000))}`;
    const spaced = !buckets.has(bucket);
    buckets.add(bucket);
    const size = bytes(v);
    if ((count < 8 || (age < 30 * 86_400_000 && spaced)) && count < 40 && used + size <= budget) {
      counts.set(scopeKey, count + 1);
      used += size;
      return true;
    }
    return false;
  });
  try {
    localStorage.setItem(key, JSON.stringify(retained));
  } catch (error) {
    // A full preview quota must never turn a successful manuscript save into a failed revision ack.
    if (error instanceof DOMException && error.name === 'QuotaExceededError') return null;
    throw error;
  }
  return version;
}
