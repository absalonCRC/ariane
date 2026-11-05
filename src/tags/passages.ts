import type { Project } from '../contracts/project';
import { initialOutline, validOutline } from '../editor/outline/model';
export interface TagPassage {
  section: string;
  title: string;
  node: string | null;
  from: number;
  text: string;
  inherited: boolean;
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
    const saved = validOutline(section.text, section.outline);
    if (!sectionTagged && !section.outline?.nodes.some((n) => n.tagIds?.includes(tag))) continue;
    const outline = initialOutline(section.text, saved ? section.outline : null);
    const matches = new Map<string, boolean>();
    for (let i = 0; i < outline.nodes.length; i++) {
      const node = outline.nodes[i],
        direct = !!node.tagIds?.includes(tag);
      const matchesTag = direct || sectionTagged || (!!node.parent && !!matches.get(node.parent));
      matches.set(node.id, matchesTag);
      if (matchesTag)
        result.push({
          section: section.id,
          title: section.title,
          node: saved ? node.id : null,
          from: node.start,
          text: section.text.slice(
            node.start,
            outline.nodes[i + 1] ? outline.nodes[i + 1].start - 1 : section.text.length,
          ),
          inherited: !direct,
        });
    }
  }
  return result;
}
