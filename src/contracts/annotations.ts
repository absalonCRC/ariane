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
export interface Annotation {
  document?: DocumentAnchor;
  id: string;
  section: string;
  quote: string;
  before: string;
  after: string;
  note: string;
  done: boolean;
  created: string;
  revision: number;
}
