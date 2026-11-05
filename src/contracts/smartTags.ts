export interface SmartTag {
  properties?: import('./lineProperties').TagProperty[];
  id: string;
  name: string;
  color: string;
  category: string;
}
export type TagOperation =
  | { action: 'save'; tag: SmartTag }
  | { action: 'assign'; section: string; node?: string | null; tagIds: string[] }
  | { action: 'delete'; id: string }
  | { action: 'merge'; id: string; target: string };
