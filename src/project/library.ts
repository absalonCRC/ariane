import type { Project, Section } from '../app/types';
import { descendants, hasChapterAncestor } from './tree';
export type DocumentRole = 'manuscript' | 'note';
export interface ManuscriptOperation {
  action: 'split' | 'join';
  sourceId: string;
  targetId?: string;
  offset?: number;
  title?: string;
}

export interface LibraryOperation {
  action: 'move' | 'add' | 'duplicate' | 'trash' | 'restore' | 'undo' | 'include';
  ids?: string[];
  target?: string | null;
  placement?: 'before' | 'after' | 'inside';
  role?: DocumentRole;
  title?: string;
  kind?: Section['kind'];
  included?: boolean;
}
export type StructurePosition = Pick<
  Section,
  'id' | 'parent' | 'position' | 'role' | 'trashed' | 'included'
>;
export function structureSnapshot(p: Project): StructurePosition[] {
  return [...p.sections, ...(p.trash || [])].map(
    ({ id, parent, position, role, trashed, included }) => ({
      id,
      parent,
      position,
      role: role || 'manuscript',
      trashed: !!trashed,
      included: included !== false,
    }),
  );
}
export function applyLibraryOperation(
  project: Project,
  op: LibraryOperation,
  before?: StructurePosition[],
) {
  const p = structuredClone(project);
  let all = [...p.sections, ...(p.trash || [])].sort((a, b) => a.position - b.position);
  const copies: { from: string; to: string }[] = [];
  const ids = new Set(op.ids || []);
  if (op.action === 'undo') {
    if (!before) throw new Error('Aucune opération à annuler.');
    const old = new Map(before.map((s) => [s.id, s]));
    all = all.map((s) =>
      old.has(s.id)
        ? {
            ...s,
            ...old.get(s.id)!,
            role: old.get(s.id)!.role || 'manuscript',
            trashed: !!old.get(s.id)!.trashed,
            included: old.get(s.id)!.included !== false,
          }
        : { ...s, trashed: true },
    );
  } else {
    if (
      op.action !== 'add' &&
      (!ids.size ||
        [...ids].some(
          (id) => !all.some((s) => s.id === id && !!s.trashed === (op.action === 'restore')),
        ))
    )
      throw new Error('Sélection introuvable.');
    const byId = new Map(all.map((s) => [s.id, s]));
    const roots = all.filter((s) => {
      if (!ids.has(s.id)) return false;
      let parent = s.parent;
      const seen = new Set<string>();
      while (parent) {
        if (ids.has(parent) || seen.has(parent)) return false;
        seen.add(parent);
        parent = byId.get(parent)?.parent || null;
      }
      return true;
    });
    const affected = new Set(roots.flatMap((s) => descendants(all, s.id).map((s) => s.id)));
    if (op.action === 'move' || op.action === 'add') {
      const target = op.target ? all.find((s) => s.id === op.target && !s.trashed) : null;
      if (op.target && !target) throw new Error('Destination introuvable.');
      if (target && affected.has(target.id))
        throw new Error('Impossible de déplacer un dossier dans sa propre branche.');
      const placement = op.placement || 'inside';
      if (placement === 'inside' && target?.kind === 'scene')
        throw new Error('Choisissez un dossier ou un chapitre.');
      const parent = target ? (placement === 'inside' ? target.id : target.parent) : null;
      if (
        hasChapterAncestor(all, parent) &&
        (op.action === 'add'
          ? op.kind === 'chapter'
          : all.some((s) => affected.has(s.id) && s.kind === 'chapter'))
      )
        throw new Error('Un chapitre ne peut pas être placé dans un autre chapitre.');
      const role = target?.role || op.role || 'manuscript';
      const moving: Section[] =
        op.action === 'add'
          ? [
              {
                id: crypto.randomUUID(),
                parent,
                role,
                kind: op.kind || 'scene',
                title: op.title || '',
                text: '',
                revision: 0,
                position: 0,
                synopsis: '',
                status: 'Brouillon',
                goal: 0,
              },
            ]
          : roots;
      for (const s of moving) {
        s.parent = parent;
        s.role = role;
      }
      all = all.filter((s) => !roots.some((root) => root.id === s.id));
      const index =
        target && placement !== 'inside'
          ? all.findIndex((s) => s.id === target.id) + Number(placement === 'after')
          : all.length;
      all.splice(index, 0, ...moving);
      for (const s of all) if (affected.has(s.id)) s.role = role;
    } else if (op.action === 'include') {
      if (typeof op.included !== 'boolean') throw new Error('Inclusion manquante.');
      for (const s of all)
        if (affected.has(s.id) && s.kind === 'scene' && !s.trashed) s.included = op.included;
    } else if (op.action === 'trash') {
      for (const s of all) if (affected.has(s.id)) s.trashed = true;
    } else if (op.action === 'restore') {
      for (const root of roots) {
        let parent = root.parent;
        const seen = new Set<string>();
        while (parent && !seen.has(parent)) {
          seen.add(parent);
          affected.add(parent);
          parent = all.find((s) => s.id === parent)?.parent || null;
        }
      }
      for (const s of all) if (affected.has(s.id)) s.trashed = false;
    } else if (op.action === 'duplicate') {
      const map = new Map(
        all.filter((s) => affected.has(s.id) && !s.trashed).map((s) => [s.id, crypto.randomUUID()]),
      );
      const originals = all.filter((s) => map.has(s.id));
      for (const s of originals.reverse()) {
        const copy = structuredClone(s);
        copy.id = map.get(s.id)!;
        copy.revision = 0;
        copy.parent = s.parent ? map.get(s.parent) || s.parent : null;
        if (roots.some((root) => root.id === s.id)) copy.title += ' — copie';
        if (copy.outline) {
          const nodes = new Map(copy.outline.nodes.map((n) => [n.id, crypto.randomUUID()]));
          copy.outline.nodes = copy.outline.nodes.map((n) => ({
            ...n,
            id: nodes.get(n.id)!,
            parent: n.parent ? nodes.get(n.parent) || null : null,
          }));
        }
        copies.push({ from: s.id, to: copy.id });
        all.splice(all.findIndex((v) => v.id === s.id) + 1, 0, copy);
      }
    }
    all.forEach((s, i) => {
      s.position = i;
    });
  }
  p.sections = all.filter((s) => !s.trashed);
  p.trash = all.filter((s) => s.trashed);
  return { project: p, copies };
}

export function libraryOperationMessage(project: Project, op: LibraryOperation): string {
  if (op.action === 'undo') return 'Dernière modification de la bibliothèque annulée.';
  const all = [...project.sections, ...(project.trash ?? [])];
  const ids = new Set(op.ids ?? []);
  const roots = all.filter(
    (s) =>
      ids.has(s.id) &&
      !all.some(
        (parent) =>
          ids.has(parent.id) &&
          parent.id !== s.id &&
          descendants(all, parent.id).some((child) => child.id === s.id),
      ),
  );
  const count = roots.length;
  const noun = roots.every((s) => s.kind === 'scene') ? 'texte' : 'élément';
  const label = count === 1 ? `« ${roots[0].title || 'Sans titre'} »` : `${count} ${noun}s`;
  const plural = count > 1 ? 's' : '';
  if (op.action === 'trash') return `${label} placé${plural} dans la corbeille.`;
  if (op.action === 'restore') return `${label} restauré${plural}.`;
  if (op.action === 'duplicate') return `${label} dupliqué${plural}.`;
  if (op.action === 'include')
    return op.included
      ? `${label} inclus dans le manuscrit et l’export.`
      : `${label} · texte${plural} de travail, hors manuscrit.`;
  const target = all.find((s) => s.id === op.target);
  const destination = !target
    ? 'à la racine'
    : `${op.placement === 'before' ? 'avant' : op.placement === 'after' ? 'après' : 'dans'} « ${target.title || 'Sans titre'} »`;
  return `${label} déplacé${plural} ${destination}.`;
}
