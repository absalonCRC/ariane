import { type NoteRef } from '../contracts/notes';
import type { EntityBatch } from '../contracts/entities';
import type { SelectedEntity } from '../enrichment/entityTypes';
import type { Outline, Section } from '../contracts/project';
import type { Settings } from '../contracts/settings';
import type { SelectionAnchor } from '../components/SelectionToolbar';
import { type SectionDraft } from '../project/draft';
import { type SearchDirection } from './textSearch';
import { type MarkdownFormat } from './formatMarkdown';
import { type ReviewTarget } from './reviewTarget';
import type { SmartTag } from '../contracts/smartTags';
export interface VisibleText {
  cursor?: number;
  text: string;
  from: number;
  allowEnd: boolean;
  paragraphs: { line: number; text: string; top: number; from?: number }[];
  bounds?: { top: number; bottom: number; right: number };
}
export interface EditorHandle {
  removeSmartTag: (section: string, node: string, tag: string) => boolean;
  setLineProperty: (
    section: string,
    node: string,
    field: string,
    value: import('../contracts/lineProperties').PropertyValue | undefined,
  ) => boolean;
  context: () => { section: string; node: string | null; offset: number; cursor: number } | null;
  contextTop: (section: string, node: string | null) => number | null;
  restoreContext: (context: {
    section: string;
    node: string | null;
    offset: number;
    cursor: number;
  }) => boolean;
  insert: (text: string) => void;
  text: () => string;
  focus: () => void;
  selection: () => string;
  cursor: () => number;
  prepareInsertion: () => ((text: string) => boolean) & { before?: string; after?: string };
  prepareCitation: () => (text: string) => boolean;
  passage: () => { section: string; from: number; to: number; text: string } | null;
  revealNode: (id: string) => boolean;
  findText: (query: string, direction?: SearchDirection) => void;
  clearTextSearch: () => void;
  revealMatch: (section: string, from: number | null, query: string) => boolean;
  format: (format: MarkdownFormat) => void;
  reviewTarget: () => ReviewTarget | null;
  structure: (command: 'indent' | 'outdent' | 'up' | 'down' | 'fold') => void;
}
export interface EditorProps {
  onOutlineDetails?: (section: string, node: string, outline: Outline) => void;
  onRemoveSmartTag?: (section: string, node: string | null, tag: string) => void | Promise<void>;
  smartTags?: SmartTag[];
  tagSections?: Section[];
  createSmartTag?: (name: string) => Promise<SmartTag>;
  onSmartTag?: (id: string) => void;
  onTagWork?: (task: Promise<void>) => void;
  registerTagFlusher?: (flush: () => Promise<void>) => () => void;
  sections: Section[];
  entities?: EntityBatch[];
  searchQuery?: string;
  onEntity?: (mention: SelectedEntity) => void;
  noteLookup?: (query: string) => Promise<NoteRef[]>;
  noteCreate?: (name: string, context: string) => Promise<NoteRef>;
  noteResolve?: (ids: string[]) => Promise<NoteRef[]>;
  sourceVersion?: number;
  onOpenNote?: (id: string) => void;
  onNoteError?: (error: unknown) => void;
  projectPath?: string;
  generation: number;
  readOnly?: boolean;
  settings: Settings;
  immersiveFocus?: boolean;
  focusPreview?: Settings['focus'] | null;
  scrollPreview?: boolean | null;
  onChange: (changes: Map<string, string>, outlines?: Map<string, Outline>) => void;
  onDraftChange?: (drafts: Map<string, SectionDraft>) => void;
  onVisible: (value: VisibleText) => void;
  onWords: (words: number) => void;
  onCharacters: (characters: number) => void;
  onLines?: (lines: number) => void;
  onCursor: (cursor: number) => void;
  onTyping: () => void;
  onSearchSources?: (text: string) => void;
  onSelection?: (anchor: SelectionAnchor | null) => void;
}
