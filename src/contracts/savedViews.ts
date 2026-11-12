import type { StructuredQuery } from './structuredQuery';
export interface SavedView {
  id: string;
  name: string;
  query: StructuredQuery;
}
