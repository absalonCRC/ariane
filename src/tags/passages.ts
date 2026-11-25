import type { Outline, Project, Section } from '../contracts/project';
import { initialOutline, validOutline } from '../editor/outline/model';
export interface TagPassage {
  section: string;
  title: string;
  node: string | null;
  from: number;
  text: string;
  inherited: boolean;
}
// Legacy scenes have Markdown block boundaries but no persistent node identities.
export function passageOutline(section: Section) {
  const saved = section.outline;
  return validOutline(section.text, saved)
    ? { nodes: saved.nodes, saved: true }
    : { nodes: initialOutline(section.text).nodes, saved: false };
}

export function passageAtIndex(
  section: Section,
  outline: { nodes: Outline['nodes']; saved: boolean },
  index: number,
  inherited: boolean,
): TagPassage {
  const node = outline.nodes[index];
  const next = outline.nodes[index + 1];
  return {
    section: section.id,
    title: section.title,
    node: outline.saved ? node.id : null,
    from: node.start,
    text: section.text.slice(node.start, next ? next.start - 1 : section.text.length),
    inherited,
  };
}

/** A projection of current, untrashed originals; it never copies or edits a project. */
export function taggedPassages(project: Project, tag: string): TagPassage[] {
  const sections = new Map(project.sections.map((s) => [s.id, s]));
  const inherited = new Map<string, boolean>();
  function sectionHas(id: string, visiting = new Set<string>()): boolean {
    if (inherited.has(id)) return inherited.get(id)!;
    if (visiting.has(id)) return false;
    visiting.add(id);
    const s = sections.get(id);
    const result =
      !!s && (!!s.tagIds?.includes(tag) || (!!s.parent && sectionHas(s.parent, visiting)));
    inherited.set(id, result);
    return result;
  }
  const result: TagPassage[] = [];
  for (const section of project.sections) {
    if (section.kind !== 'scene' || section.trashed) continue;
    const sectionTagged = sectionHas(section.id);
    if (!sectionTagged && !section.outline?.nodes.some((n) => n.tagIds?.includes(tag))) continue;
    const outline = passageOutline(section);
    const matches = new Map<string, boolean>();
    for (let i = 0; i < outline.nodes.length; i++) {
      const node = outline.nodes[i],
        direct = !!node.tagIds?.includes(tag);
      const matchesTag = direct || sectionTagged || (!!node.parent && !!matches.get(node.parent));
      matches.set(node.id, matchesTag);
      if (matchesTag) result.push(passageAtIndex(section, outline, i, !direct));
    }
  }
  return result;
}
