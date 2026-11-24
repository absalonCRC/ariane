import type { Annotation, DocumentAnchor, PassageAnchor } from '../contracts/annotations';
import type { Section } from '../contracts/project';

export interface AnnotationTarget {
  requestId?: string;
  document?: DocumentAnchor;
  branch?: string;
  section: string;
  from: number;
  to: number;
  text: string;
  original: string;
}
export function captureAnchor(section: Section, from: number, to: number): PassageAnchor {
  return {
    section: section.id,
    quote: section.text.slice(from, to),
    offset: from,
    sceneRevision: section.revision,
    before: Array.from(section.text.slice(Math.max(0, from - 96), from))
      .slice(-48)
      .join(''),
    after: Array.from(section.text.slice(to, to + 96))
      .slice(0, 48)
      .join(''),
  };
}
export function inspectAnchor(annotation: PassageAnchor, sections: Section[]) {
  const matches: { section: string; from: number; context: boolean }[] = [];
  if (!annotation.quote || annotation.detached) return { match: null, ambiguous: false };
  const origin = sections.find((s) => s.id === annotation.section && !s.trashed);
  const at = annotation.offset;
  if (
    origin &&
    at !== undefined &&
    origin.revision === annotation.sceneRevision &&
    origin.text.slice(at, at + annotation.quote.length) === annotation.quote &&
    origin.text.slice(0, at).endsWith(annotation.before) &&
    origin.text.slice(at + annotation.quote.length).startsWith(annotation.after)
  )
    return { match: { section: origin.id, from: at, context: true }, ambiguous: false };
  for (const s of sections.filter((s) => s.kind === 'scene' && !s.trashed)) {
    let from = s.text.indexOf(annotation.quote);
    while (from >= 0) {
      const before = !annotation.before || s.text.slice(0, from).endsWith(annotation.before);
      const after =
        !annotation.after ||
        s.text.slice(from + annotation.quote.length).startsWith(annotation.after);
      matches.push({
        section: s.id,
        from,
        context: before && after && !!(annotation.before || annotation.after),
      });
      from = s.text.indexOf(annotation.quote, from + 1);
    }
  }
  const contextual = matches.filter((m) => m.context);
  if (contextual.length === 1) return { match: contextual[0], ambiguous: false };
  if (contextual.length > 1) return { match: null, ambiguous: true };
  const local = matches.filter((m) => m.section === annotation.section);
  const legacy = annotation.offset === undefined;
  const onlyWholeScene =
    origin?.text === annotation.quote && !annotation.before && !annotation.after;
  return {
    match: (legacy || onlyWholeScene) && local.length === 1 ? local[0] : null,
    ambiguous: matches.length > 1,
  };
}
export function resolveAnnotation(annotation: PassageAnchor, sections: Section[]) {
  return inspectAnchor(annotation, sections).match;
}
export function annotationGroups(items: Annotation[], sections: Section[], locale: string) {
  const groups = new Map<string, Annotation[]>();
  const sentences = new Intl.Segmenter(locale, { granularity: 'sentence' });
  const segments = new Map<string, Intl.Segments>();
  for (const item of [...items].sort(
    (a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id),
  )) {
    let key = item.id;
    const at = resolveAnnotation(item, sections);
    const scene = at && sections.find((s) => s.id === at.section);
    if (at && scene && !item.peer) {
      let ranges = segments.get(scene.id);
      if (!ranges) {
        ranges = sentences.segment(scene.text);
        segments.set(scene.id, ranges);
      }
      const start = ranges.containing(at.from);
      if (start && at.from + item.quote.length <= start.index + start.segment.length)
        key = scene.id + ':' + start.index;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.values()];
}
