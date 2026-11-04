import type { MemoryEntity, MemoryPassage } from './memory';
export interface EntityDetail extends MemoryEntity {
  passages: MemoryPassage[];
  fields: { name: string; value: string; section: string; node: string | null; quote: string }[];
  timeline: {
    date: string;
    expression?: string;
    approximate?: boolean;
    text: string;
    section: string;
    node: string | null;
    quote: string;
  }[];
}
