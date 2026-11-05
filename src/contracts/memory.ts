export interface MemoryPosition {
  section: string;
  node: string | null;
  offset: number;
  cursor: number;
}

export interface MemoryPassage {
  id?: string;
  section: string;
  node: string | null;
  title: string;
  quote: string;
  hash: string;
  score?: number;
}

export interface MemoryEntity {
  id: string;
  title: string;
  kind: string;
  passageCount?: number;
}

export interface Evidence {
  id: string;
  hash: string;
  title: string;
  sourceId: string;
  fingerprint: string;
  page: number | null;
  quote: string;
  reason: string;
}

export interface MemoryResult {
  entities: MemoryEntity[];
  recall: MemoryPassage | null;
  evidence?: Evidence | null;
  anchorHash: string;
  analyzed?: number;
  pending?: boolean;
  busy?: boolean;
  deferred?: boolean;
  stale?: boolean;
  modelError?: string | null;
}

export interface SessionContext extends MemoryPosition {
  sourceId?: string | null;
  sourcePage?: number | null;
  recent: { section: string; node: string | null }[];
}
