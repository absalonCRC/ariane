export type SaveState = 'saved' | 'editing' | 'saving' | 'error';

export type Surface =
  | 'none'
  | 'settings'
  | 'preferences'
  | 'sources'
  | 'history'
  | 'prepare'
  | 'export'
  | 'projects'
  | 'import'
  | 'manuscript'
  | 'tags'
  | 'entities';
