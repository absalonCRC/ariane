export type SaveState = 'saved' | 'editing' | 'saving' | 'error';

export type Surface =
  | 'none'
  | 'settings'
  | 'preferences'
  | 'profile'
  | 'sources'
  | 'history'
  | 'prepare'
  | 'export'
  | 'projects'
  | 'import'
  | 'manuscript'
  | 'tags'
  | 'entities';
