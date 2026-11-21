export interface WritingAid {
  id: string;
  kind: 'blank' | 'trial';
  /** UTF-16 offset in the scene. A detached aid retains its private content. */
  from: number | null;
  quote: string;
  value: string;
}
