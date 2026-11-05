import type { Outline, Section } from '../contracts/project';
export interface SectionContent {
  text: string;
  outline?: Outline | null;
}
export type SectionDraft = () => SectionContent;

/** One immutable CodeMirror snapshot; content is materialized at most once. */
export function sectionDraft(read: SectionDraft): SectionDraft {
  let content: SectionContent | undefined;
  let source: SectionDraft | undefined = read;
  return () => {
    if (!content) {
      content = source!();
      source = undefined; // Release the captured editor state and its undo history.
    }
    return content;
  };
}

/** Existing consumers (export, history, section changes) always read current text.
 * A subsequent assignment replaces the accessor, preserving the Section contract. */
export function stageDraft(section: Section, draft: SectionDraft) {
  for (const key of ['text', 'outline'] as const)
    Object.defineProperty(section, key, {
      configurable: true,
      enumerable: true,
      get: () => draft()[key],
      set: (value) =>
        Object.defineProperty(section, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value,
        }),
    });
}
