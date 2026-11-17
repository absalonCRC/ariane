import type { Section } from '../contracts/project';
import { manuscriptSections } from '../project/tree';
import { measureText } from '../editor/countMetrics';

export interface WriterIdentity {
  name: string;
  intention: string;
}
export const identityKey = 'ariane.writer-profile.v1';
export function readIdentity(): WriterIdentity {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(identityKey) ?? 'null');
    if (value && typeof value === 'object') {
      const saved = value as Partial<WriterIdentity>;
      return {
        name: typeof saved.name === 'string' ? saved.name.slice(0, 80) : '',
        intention: typeof saved.intention === 'string' ? saved.intention.slice(0, 240) : '',
      };
    }
  } catch {
    /* A missing or unreadable profile does not prevent writing. */
  }
  return { name: '', intention: '' };
}
export function manuscriptSummary(sections: Section[]) {
  const included = manuscriptSections(sections);
  const scenes = included.filter((section) => section.kind === 'scene');
  let words = 0,
    goal = 0,
    goalWords = 0,
    goals = 0;
  for (const scene of scenes) {
    const count = measureText({ id: scene.id, version: scene.revision, text: scene.text }).words;
    words += count;
    if (Number.isFinite(scene.goal) && scene.goal > 0) {
      goal += scene.goal;
      goalWords += Math.min(count, scene.goal);
      goals++;
    }
  }
  return {
    words,
    scenes: scenes.length,
    chapters: included.filter((s) => s.kind === 'chapter').length,
    goal,
    goalWords,
    goals,
  };
}
