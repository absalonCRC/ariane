export type NoteAction =
  | 'detected'
  | 'suggested'
  | 'opened'
  | 'consulted'
  | 'created'
  | 'classified'
  | 'associated'
  | 'cited'
  | 'pinned'
  | 'unpinned'
  | 'updated'
  | 'resolved'
  | 'dismissed';
export interface NoteEventInput {
  kind: NoteAction;
  title: string;
  sourceId?: string | null;
  entityId?: string | null;
  section?: string | null;
  dedupKey?: string | null;
}
export interface NoteEvent extends NoteEventInput {
  id: number;
  created: string;
}
export interface NoteEventPage {
  items: NoteEvent[];
  hasMore: boolean;
}
