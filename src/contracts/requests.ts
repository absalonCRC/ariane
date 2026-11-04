import type { Project, Section, TextPatch, ProjectEntry } from './project';
import type { Settings } from './settings';
import type { Source, SourcePage, Vault } from './sources';
import type { Version } from './history';
import type { LibraryOperation, ManuscriptOperation } from './library';
import type { Annotation } from './annotations';
import type { Report } from './import';
import type { NoteRef } from './notes';
import type { EntityBatch } from './entities';
import type { MemoryEntity, MemoryResult, SessionContext } from './memory';
import type { EntityDetail } from './entityDetail';
import type { LanguageIssue } from './revision';

export interface VoiceResult {
  text: string;
  raw: string;
  cleaned: boolean;
  candidates?: string[];
}
export interface RevisionResult {
  issues: LanguageIssue[];
  model: string | null;
  languageError: string | null;
  modelError: string | null;
}
export interface SaveReport {
  sections: { id: string; revision: number }[];
  mirrorErrors: { id: string; message: string }[];
}
export interface EntityAnalysis {
  available?: boolean;
  analyzed?: boolean;
  entities?: MemoryEntity[];
  anchorHash?: string;
  pending?: boolean;
  retryMs?: number;
  deferred?: boolean;
  busy?: boolean;
  stale?: boolean;
}
export interface IndexReport {
  errors: string[];
  cancelled?: boolean;
  semantic: boolean;
}
export interface Requests {
  bootstrap: {};
  appLanguage: { value: string };
  annotations: { projectPath: string };
  addAnnotation: {
    projectPath: string;
    section: string;
    revision: number;
    from: number;
    to: number;
    note: string;
  };
  updateAnnotation: {
    projectPath: string;
    id: string;
    revision: number;
    note: string;
    done: boolean;
  };
  importPreview: { source: string };
  importIntoProject: { source: string; projectPath: string };
  manuscriptOperation: { projectPath: string; operation: ManuscriptOperation };
  projects: {};
  projectCatalog: { path: string; pinned: boolean; archived: boolean };
  libraryOperation: { operation: LibraryOperation };
  browseSources: {
    query: string;
    vault?: string | null;
    kind?: string | null;
    folder?: string | null;
    offset: number;
  };
  create: { path: string; name: string; vaultPath?: string | null; initialTitle?: string | null };
  open: { path: string };
  save: { patches: TextPatch[] };
  add: { parent?: string | null; title: string; kind: string; role?: string | null };
  update: { section: Section };
  reorder: { ids: string[]; id: string; parent?: string | null };
  settings: { value: Partial<Settings> };
  resolveExternal: { id: string; keepLocal: boolean; pending?: string | null };
  vaults: {};
  connectVault: { path: string };
  createOwnedVault: {};
  noteSuggestions: { projectPath: string; query: string };
  classifyCreatedNote: { projectPath: string; id: string; context?: string };
  noteReferences: { projectPath: string; ids: string[] };
  createQuickNote: { projectPath: string; name: string; context?: string };
  createVaultEntity: { kind: string; name: string; description: string };
  vaultScope: { id: string; scope: string[] };
  removeVault: { id: string };
  index: {};
  scan: {};
  cancelIndex: {};
  suggest: { text: string; depth: number; allowEnd: boolean; anchor?: string | null };
  search: { query: string };
  source: { id: string };
  sourceFile: { id: string };
  versions: { offset?: number };
  version: { id: string };
  capture: { name: string; scope?: string | null };
  automaticVersion: { projectPath: string; scope: string };
  restore: { id: string };
  export: { path: string; format: string; scope?: string | null };
  cite: { id: string; payload: unknown };
  enrich: { projectPath: string };
  ignoreEnrichment: { projectPath: string; source: string; evidence?: string | null };
  memoryActivity: { active: boolean };
  memoryStatus: {};
  memoryQueue: {
    projectPath: string;
    section: string;
    node?: string | null;
    revision: number;
    depth: number;
    semantic?: boolean;
  };
  memoryEntities: { projectPath: string; section: string; node?: string | null; revision: number };
  memoryContext: { projectPath: string; section: string; node?: string | null; depth: number };
  inlineEntities: { projectPath: string; section: string; revision: number; autoCreate?: boolean };
  resolveDetectedEntity: {
    projectPath: string;
    section: string;
    revision: number;
    from: number;
    to: number;
    source: string;
  };
  updateSourceAliases: {
    projectPath: string;
    source: string;
    fingerprint: string;
    aliases: string[];
  };
  createDetectedEntity: {
    projectPath: string;
    section: string;
    revision: number;
    from: number;
    to: number;
    kind: string;
  };
  memoryEntity: { projectPath: string; id: string };
  memoryList: { projectPath: string };
  memoryDismiss: { projectPath: string; id: string; hash: string };
  memorySession: { projectPath: string; value?: unknown | null };
  memorySource: { id: string; fingerprint?: string | null };
  engineStatus: {};
  voiceStatus: {};
  voicePermission: {};
  voicePrepare: {};
  revisionStatus: {};
  revisionCheck: {
    text: string;
    language: string;
    stage?: string;
    before?: string;
    after?: string;
  };
  voiceTranscribe: {
    audio: string;
    language: string;
    live?: boolean;
    before?: string;
    after?: string;
    projectPath?: string | null;
  };
  quit: {};
  cancelExport: {};
  marginPins: { projectPath: string; section: string };
  pinSource: { projectPath: string; section: string; id: string };
  unpinSource: { projectPath: string; section: string; id: string };
  associate: { section: string; id: string; payload: unknown };
  links: { section: string };
}

export interface Responses {
  bootstrap: Project | null;
  appLanguage: unknown;
  annotations: Annotation[];
  addAnnotation: Annotation;
  updateAnnotation: Annotation;
  importPreview: Report;
  importIntoProject: { project: Project; report: Report };
  manuscriptOperation: Project;
  projects: ProjectEntry[];
  projectCatalog: ProjectEntry[];
  libraryOperation: Project;
  browseSources: SourcePage;
  create: Project;
  open: Project;
  save: SaveReport;
  add: Section[];
  update: Section[];
  reorder: Section[];
  settings: unknown;
  resolveExternal: Project;
  vaults: Vault[];
  connectVault: Vault[];
  createOwnedVault: Vault[];
  noteSuggestions: NoteRef[];
  classifyCreatedNote: { pending?: boolean; source?: Source };
  noteReferences: NoteRef[];
  createQuickNote: Source;
  createVaultEntity: { path: string };
  vaultScope: null;
  removeVault: Vault[];
  index: IndexReport;
  scan: IndexReport;
  cancelIndex: unknown;
  suggest: Source[];
  search: Source[];
  source: Source;
  sourceFile: { url: string; mime: string };
  versions: Version[];
  version: Version;
  capture: Version;
  automaticVersion: Version | null;
  restore: Project;
  export: string;
  cite: unknown;
  enrich: { changed: boolean; pending?: boolean };
  ignoreEnrichment: Source;
  memoryActivity: unknown;
  memoryStatus: { available: boolean; entitiesAvailable: boolean };
  memoryQueue: MemoryResult;
  memoryEntities: EntityAnalysis;
  memoryContext: MemoryResult;
  inlineEntities: Omit<EntityBatch, 'section' | 'revision'> & { created?: boolean };
  resolveDetectedEntity: Source;
  updateSourceAliases: Source;
  createDetectedEntity: Source;
  memoryEntity: EntityDetail & { unresolved?: boolean };
  memoryList: MemoryEntity[];
  memoryDismiss: unknown;
  memorySession: SessionContext | null;
  memorySource: Source;
  engineStatus: { available: boolean; model?: string; local?: boolean };
  voiceStatus: { available: boolean; model?: string; local?: boolean };
  voicePermission: unknown;
  voicePrepare: unknown;
  revisionStatus: { available: boolean; model?: boolean; language?: boolean };
  revisionCheck: RevisionResult;
  voiceTranscribe: VoiceResult;
  quit: unknown;
  cancelExport: unknown;
  marginPins: Source[];
  pinSource: Source[];
  unpinSource: Source[];
  associate: unknown;
  links: Source[];
}
