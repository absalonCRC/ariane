export interface QueryTerm {
  kind: 'tag' | 'entity';
  id: string;
}
/** Union of intersections; + binds more tightly than comma. */
export interface StructuredQuery {
  version: 1;
  groups: QueryTerm[][];
}
