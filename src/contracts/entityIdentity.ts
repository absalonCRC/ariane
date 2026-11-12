import type { EntityRelation } from './entityRelations';
export interface EntityIdentity {
  id: string;
  title: string;
  kind: string;
  aliases: string[];
  sourceIds: string[];
  detectedIds: string[];
  confirmed: boolean;
  redirect?: string | null;
}
export interface EntityCatalog {
  revision: number;
  entities: EntityIdentity[];
  relations: EntityRelation[];
}
export type EntityOperation =
  | { action: 'save'; entity: EntityIdentity }
  | { action: 'relation'; relation: EntityRelation }
  | { action: 'removeRelation'; id: string }
  | { action: 'merge'; source: string; target: string; token: string }
  | { action: 'undoMerge'; id: string };
export interface EntityMergePreview {
  token: string;
  source: EntityIdentity;
  target: EntityIdentity;
  relations: EntityRelation[];
}
export interface EntityMergeRecord {
  id: string;
  source: string;
  target: string;
  undone: boolean;
}
