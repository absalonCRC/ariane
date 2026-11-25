export type Region = [number, number, number, number];
export interface DocumentAnchor {
  version: 1;
  sourceId: string;
  vaultId: string;
  path: string;
  fingerprint: string;
  page: number;
  rectangles: Region[];
  quote: string;
  before: string;
  after: string;
}
export interface PassageAnchor {
  offset?: number;
  sceneRevision?: number;
  detached?: boolean;
  section: string;
  quote: string;
  before: string;
  after: string;
}

export type PassageAction =
  | { kind: 'link'; origin: PassageAnchor; destination: PassageAnchor; caption: string }
  | { kind: 'dictation'; origin: PassageAnchor; note: string }
  | { kind: 'reattach'; selection: PassageAnchor; destination: boolean; revision: number };

export interface Annotation extends PassageAnchor {
  document?: DocumentAnchor;
  peer?: PassageAnchor;
  id: string;
  note: string;
  done: boolean;
  created: string;
  revision: number;
}
