import type { Section } from './project';
export type DocumentRole = 'manuscript' | 'note';

export interface ManuscriptOperation {
  action: 'split' | 'join';
  sourceId: string;
  targetId?: string;
  offset?: number;
  title?: string;
}

export interface LibraryOperation {
  action: 'move' | 'add' | 'duplicate' | 'trash' | 'restore' | 'undo' | 'include';
  ids?: string[];
  target?: string | null;
  placement?: 'before' | 'after' | 'inside';
  role?: DocumentRole;
  title?: string;
  kind?: Section['kind'];
  included?: boolean;
}
