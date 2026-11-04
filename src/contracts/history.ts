import type { Section } from './project';
export interface Version {
  automatic?: boolean;
  id: string;
  name: string;
  created: string;
  scope: string | null;
  sections: Section[];
}
