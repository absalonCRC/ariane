export interface OutlineNode {
  id: string;
  parent: string | null;
  start: number;
}
export interface Outline {
  version: 1;
  nodes: OutlineNode[];
}
export interface Section {
  id: string;
  parent: string | null;
  title: string;
  kind: 'folder' | 'chapter' | 'scene';
  position: number;
  text: string;
  revision: number;
  synopsis: string;
  status: string;
  goal: number;
  outline?: Outline | null;
  role?: 'manuscript' | 'note';
  trashed?: boolean;
  included?: boolean;
}
export interface Project {
  path: string;
  name: string;
  sections: Section[];
  settings: Partial<Settings>;
  recovered: boolean;
  trash?: Section[];
  canUndoStructure?: boolean;
  conflicts?: string[];
}
export interface Settings {
  collapsed?: string[];
  libraryView?: 'texts' | 'manuscript' | 'note' | 'sources' | 'trash';
  countMode: 'characters' | 'words' | 'lines';
  font: 'literary' | 'mono';
  fontSize: number;
  focus: 'none' | 'paragraph' | 'sentence';
  typewriter: boolean;
  depth: number;
  revision: boolean;
  enrichment: boolean;
  language: string;
  citationStyle: 'notes' | 'apa' | 'chicago';
  cursor: number;
  active: string | null;
  continuous: boolean;
}
export const defaultSettings: Settings = {
  countMode: 'words',
  font: 'literary',
  fontSize: 26,
  focus: 'none',
  typewriter: false,
  depth: 3,
  revision: false,
  enrichment: true,
  language: 'fr',
  citationStyle: 'notes',
  cursor: 0,
  active: null,
  continuous: false,
};
export interface Vault {
  id: string;
  path: string;
  name: string;
  scope: string[];
  count: number;
  available: boolean;
  owned?: boolean;
}
export interface Source {
  fingerprint: string;
  id: string;
  vaultId: string;
  path: string;
  title: string;
  kind: string;
  aliases: string[];
  tags: string[];
  fields: Record<string, unknown>;
  text: string;
  page: number | null;
  matched: string | null;
  score: number;
  enrichment?: Enrichment;
  selectedExcerpt?: string;
}
export interface Version {
  id: string;
  name: string;
  created: string;
  scope: string | null;
  sections: Section[];
}
export interface TextPatch {
  id: string;
  revision: number;
  text: string;
  outline?: Outline | null;
}
export type SaveState = 'saved' | 'editing' | 'saving' | 'error';
export type Surface =
  'none' | 'settings' | 'preferences' | 'sources' | 'history' | 'prepare' | 'export' | 'projects' | 'import' | 'manuscript';

export interface Enrichment {
  fields: {
    field: string;
    value: string;
    target: string | null;
    evidence: string[];
    status: 'derived' | 'confirmed' | 'conflict';
  }[];
  passages: {
    id: string;
    node: string | null;
    section: string;
    sectionTitle: string;
    line: number;
    quote: string;
    uncertain: boolean;
    related: { id: string; title: string }[];
  }[];
  ignored: number;
}

export interface ProjectEntry {
  path: string;
  name: string;
  lastOpened: string;
  pinned: boolean;
  archived: boolean;
  available: boolean;
}
export interface SourcePage {
  types?: { kind: string; count: number }[];
  items: Source[];
  total: number;
  kinds: string[];
  folders: string[];
}
