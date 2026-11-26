import type { StructuredQuery } from './structuredQuery';

export interface WritingPoint {
  section: string;
  node: string | null;
  offset: number;
  position: number; // UTF-16 offset within this scene, including in continuous mode.
  branch?: string;
}
export interface DocumentPosition {
  id: string;
  fingerprint?: string;
  page: number;
  zoom: number;
  top: number;
  left: number;
}
export type FilterPosition =
  | { tag: string; mode: 'text' | 'table' }
  | { query: StructuredQuery; name?: string; mode: 'text' | 'table' };
