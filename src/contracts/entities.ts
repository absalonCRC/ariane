import type { Outline } from './project';
export interface EntityCandidate {
  id: string;
  title: string;
  kind: string;
}

export interface EntityMention {
  candidates?: EntityCandidate[];
  from: number;
  to: number;
  title: string;
  kind: string;
  sourceId: string | null;
  entityId: string | null;
}

export interface EntityBatch {
  outline?: Outline | null;
  section: string;
  revision: number;
  text: string;
  mentions: EntityMention[];
}
