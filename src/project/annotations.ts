import type { Annotation } from '../contracts/annotations';
import type { Section } from '../contracts/project';

export interface AnnotationTarget {
  section: string;
  from: number;
  to: number;
  text: string;
  original: string;
}
export function resolveAnnotation(annotation: Annotation, sections: Section[]) {
  const matches: { section: string; from: number; context: boolean }[] = [];
  if (!annotation.quote) return null;
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
      from = s.text.indexOf(annotation.quote, from + annotation.quote.length);
    }
  }
  const contextual = matches.filter((m) => m.context);
  if (contextual.length === 1) return contextual[0];
  const local = matches.filter((m) => m.section === annotation.section);
  return local.length === 1 ? local[0] : null;
}
