import type { Project, Version } from '../app/types';
import { descendants } from '../project/tree';

// The browser preview has a small localStorage quota; native projects use 128 MiB in SQLite.
const budget = 2 * 1024 * 1024;
export const versionKey = (path: string) => 'ariane.preview.versions.' + path;
const signature = (v: Pick<Version, 'sections'>) =>
  JSON.stringify(v.sections.map((s) => ({ ...s, revision: 0 })));
export function previewCheckpoint(p: Project, scope: string, force = true): Version | null {
  const key = versionKey(p.path);
  const versions = JSON.parse(localStorage.getItem(key) || '[]') as Version[];
  const last = versions.find((v) => v.automatic && v.scope === scope);
  if (!force && last && Date.now() - Date.parse(last.created) < 300_000) return null;
  const sections = descendants([...p.sections, ...(p.trash || [])], scope);
  if (!sections.length || (last && signature(last) === signature({ sections }))) return null;
  const version: Version = {
    id: crypto.randomUUID(),
    name: 'Sauvegarde automatique',
    created: new Date().toISOString(),
    scope,
    sections,
    automatic: true,
  };
  const bytes = (v: Version) => new TextEncoder().encode(JSON.stringify(v)).length;
  if (bytes(version) > budget) return null;
  const counts = new Map<string | null, number>(),
    buckets = new Set<string>();
  let used = 0;
  const retained = [version, ...versions].filter((v) => {
    if (!v.automatic) return true;
    const count = counts.get(v.scope) || 0,
      time = Date.parse(v.created),
      age = Date.now() - time;
    const bucket = `${v.scope}:${age >= 86_400_000}:${Math.floor(time / (age < 86_400_000 ? 3_600_000 : 86_400_000))}`;
    const spaced = !buckets.has(bucket);
    buckets.add(bucket);
    const size = bytes(v);
    if ((count < 8 || (age < 30 * 86_400_000 && spaced)) && count < 40 && used + size <= budget) {
      counts.set(v.scope, count + 1);
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
