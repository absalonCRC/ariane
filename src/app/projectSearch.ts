import { t } from '../i18n';
import type { Section } from './types';
import { ordered } from '../project/tree';
import {
  normalizeText,
  normalizedTerm,
  visitNormalizedMatches,
  type NormalizedText,
} from '../editor/normalizedSearch';

export interface ManuscriptMatch {
  key: string;
  section: string;
  title: string;
  from: number | null;
  to: number | null;
  excerpt: string;
}
export interface ManuscriptResult {
  items: ManuscriptMatch[];
  total: number;
}
export type SearchSection = Pick<
  Section,
  'id' | 'text' | 'title' | 'parent' | 'position' | 'trashed'
>;
export interface SearchLabels {
  untitled: string;
  title: string;
}
const labels = (): SearchLabels => ({
  untitled: t('Sans titre'),
  title: t('Titre du texte ou du dossier'),
});
export const emptyManuscript = (): ManuscriptResult => ({ items: [], total: 0 });

/** One engine per open search worker; unchanged sections keep their folded offsets. */
export class ManuscriptSearch {
  private sections = new Map<string, SearchSection>();
  private cache = new Map<
    string,
    { text: string; title: string; body: NormalizedText; heading?: NormalizedText }
  >();

  sync(changes: SearchSection[], removed: string[] = []) {
    for (const id of removed) {
      this.sections.delete(id);
      this.cache.delete(id);
    }
    for (const section of changes) {
      const cached = this.cache.get(section.id);
      if (cached?.text !== section.text) this.cache.delete(section.id);
      else if (cached && cached.title !== section.title) {
        cached.title = section.title;
        cached.heading = undefined;
      }
      this.sections.set(section.id, section);
    }
  }

  search(query: string, messages = labels()): ManuscriptResult {
    const result = emptyManuscript(),
      term = normalizedTerm(query);
    if (!term) return result;
    // ordered only reads the tree properties present on SearchSection.
    const sections = ordered([...this.sections.values()].filter((s) => !s.trashed) as Section[]);
    for (const section of sections) {
      let cached = this.cache.get(section.id);
      if (!cached) {
        cached = { text: section.text, title: section.title, body: normalizeText(section.text) };
        this.cache.set(section.id, cached);
      }
      const count = visitNormalizedMatches(cached.body, term, (from, to) => {
        if (result.items.length >= 200) return;
        result.items.push({
          key: section.id + ':' + from,
          section: section.id,
          title: section.title || messages.untitled,
          from,
          to,
          excerpt:
            (from > 60 ? '…' : '') +
            section.text.slice(Math.max(0, from - 60), to + 100).replace(/\s+/g, ' ') +
            (to + 100 < section.text.length ? '…' : ''),
        });
      });
      result.total += count;
      if (!count) {
        cached.heading ??= normalizeText(section.title);
        if (visitNormalizedMatches(cached.heading, term, undefined, 1)) {
          result.total++;
          if (result.items.length < 200)
            result.items.push({
              key: section.id + ':title',
              section: section.id,
              title: section.title,
              from: null,
              to: null,
              excerpt: messages.title,
            });
        }
      }
    }
    return result;
  }
}

export function searchManuscript(sections: SearchSection[], query: string) {
  const engine = new ManuscriptSearch();
  engine.sync(sections);
  return engine.search(query);
}
