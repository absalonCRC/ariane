import type { Settings } from './settings';
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

export interface TextPatch {
  id: string;
  revision: number;
  text: string;
  outline?: Outline | null;
}

export interface ProjectEntry {
  path: string;
  name: string;
  lastOpened: string;
  pinned: boolean;
  archived: boolean;
  available: boolean;
}
