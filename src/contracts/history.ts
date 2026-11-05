import type { Section } from './project';
export interface Version {
  automatic?: boolean;
  branchId?: string | null;
  parentId?: string | null;
  sessionId?: string | null;
  mergeParentId?: string | null;
  id: string;
  name: string;
  created: string;
  scope: string | null;
  sections: Section[];
}
export interface WritingBranch {
  id: string;
  name: string;
  created: string;
  isMain: boolean;
  baseVersion: string | null;
  headVersion: string | null;
}
export interface HistoryState {
  activeBranch: string;
  branches: WritingBranch[];
}
export interface MergeEntry {
  id: string;
  title: string;
  base: Section | null;
  current: Section | null;
  incoming: Section | null;
  result: Section | null;
  changed: boolean;
  conflict: boolean;
  fields: string[];
}
export interface MergeAuxiliaryConflict {
  id: string;
  label: string;
  current: string;
  incoming: string;
}
export interface MergePreview {
  source: WritingBranch;
  target: WritingBranch;
  token: string;
  entries: MergeEntry[];
  auxiliaryConflicts: MergeAuxiliaryConflict[];
  auxiliaryChanges?: number;
}
export interface MergeResolution {
  id: string;
  choice: 'current' | 'incoming' | 'custom';
  text?: string | null;
}
