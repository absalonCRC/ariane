import type { Project } from '../contracts/project';

interface SplitPosition {
  section: string;
  from: number;
  to: number;
}

export interface SceneSplitPreview {
  project: Project;
  section: string;
  text: string;
  offset: number;
  before: string;
  after: string;
}

const excerptLength = 140;
const highSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const lowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const inSurrogatePair = (text: string, offset: number) =>
  highSurrogate(text.charCodeAt(offset - 1)) && lowSurrogate(text.charCodeAt(offset));

export function sceneSplitPreview(
  project: Project,
  position: SplitPosition,
): SceneSplitPreview | null {
  const { section, from: offset } = position;
  const source = project.sections.find((item) => item.id === section);
  if (!source || source.kind !== 'scene' || source.trashed) return null;
  const text = source.text;
  if (
    !Number.isInteger(offset) ||
    position.to !== offset ||
    offset <= 0 ||
    offset >= text.length ||
    inSurrogatePair(text, offset)
  )
    return null;

  let start = Math.max(0, offset - excerptLength);
  let end = Math.min(text.length, offset + excerptLength);
  if (inSurrogatePair(text, start)) start--;
  if (inSurrogatePair(text, end)) end++;
  return {
    project,
    section,
    text,
    offset,
    before: (start ? '…' : '') + text.slice(start, offset),
    after: text.slice(offset, end) + (end < text.length ? '…' : ''),
  };
}

export function matchesSceneSplit(project: Project | null, preview: SceneSplitPreview) {
  return (
    project === preview.project &&
    project.sections.some(
      (section) =>
        section.id === preview.section &&
        section.kind === 'scene' &&
        !section.trashed &&
        section.text === preview.text,
    )
  );
}
