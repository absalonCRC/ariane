export type PropertyRelation =
  | { kind: 'source'; id: string; title: string }
  | { kind: 'line'; section: string; node: string; title: string };
export type PropertyValue = string | number | boolean | null | PropertyRelation[];
export interface TagProperty {
  id: string;
  name: string;
  type: 'text' | 'date' | 'number' | 'relation' | 'checkbox';
  defaultValue?: PropertyValue;
  entityType?: string;
  inherit?: boolean;
}
export type LineProperties = Record<string, PropertyValue>;
