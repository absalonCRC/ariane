import type { Section } from './types';
import { ordered } from '../project/tree';
import { normalizedMatches } from '../editor/normalizedSearch';
export interface ManuscriptMatch {
  key: string;
  section: string;
  title: string;
  from: number | null;
  to: number | null;
  excerpt: string;
}
export function searchManuscript(sections: Section[], query: string) {
  const items: ManuscriptMatch[] = [];
  let total = 0;
  const term = query.trim();
  if (!term) return { items, total };
  for (const section of ordered(sections.filter((s) => !s.trashed))) {
    let found = false;
    for (const match of normalizedMatches(section.text, term)) {
      found = true;
      total++;
      const { from, to } = match;
      if (items.length < 200)
        items.push({
          key: section.id + ':' + from,
          section: section.id,
          title: section.title || 'Sans titre',
          from,
          to,
          excerpt:
            (from > 60 ? '…' : '') +
            section.text.slice(Math.max(0, from - 60), to + 100).replace(/\s+/g, ' ') +
            (to + 100 < section.text.length ? '…' : ''),
        });
    }
    if (!found && normalizedMatches(section.title, term).length) {
      total++;
      if (items.length < 200)
        items.push({
          key: section.id + ':title',
          section: section.id,
          title: section.title,
          from: null,
          to: null,
          excerpt: 'Titre du texte ou du dossier',
        });
    }
  }
  return { items, total };
}
