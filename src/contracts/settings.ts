import type { WritingPoint, DocumentPosition, FilterPosition } from './writingSession';

export interface EntityTypeDefinition {
  name: string;
  description: string;
  examples: string[];
  enabled: boolean;
}

export interface Settings {
  projectGoal?: number;
  sessionGoal?: number;
  showGoals?: boolean;
  sessionWords?: number;
  sessionClosed?: boolean;
  lastEdit?: WritingPoint | null;
  tomorrow?: { point: WritingPoint; text: string } | null;
  documentPosition?: DocumentPosition | null;
  filterPosition?: FilterPosition | null;
  searchText?: string;
  binderOpen?: boolean;
  writingPosition?: WritingPoint | null;
  manuscriptScroll?: number;
  foldedPassages?: string[];
  collapsed?: string[];
  libraryView?: 'texts' | 'manuscript' | 'note' | 'sources' | 'trash';
  countMode: 'characters' | 'words' | 'lines';
  font: 'literary' | 'sans' | 'mono';
  fontSize: number;
  columnWidth?: number;
  lineHeight?: number;
  focus: 'none' | 'paragraph' | 'sentence' | 'word';
  immersiveFocus?: boolean;
  typewriter: boolean;
  typewriterSound: boolean;
  depth: number;
  revision: boolean;
  enrichment: boolean;
  entityHighlighting?: boolean;
  entityColors?: Record<string, string>;
  entityTypes?: EntityTypeDefinition[];
  classifyNewNotes?: boolean;
  language: string;
  citationStyle: 'notes' | 'apa' | 'chicago';
  cursor: number;
  active: string | null;
  continuous: boolean;
}

export const defaultSettings: Settings = {
  countMode: 'words',
  font: 'literary',
  fontSize: 26,
  columnWidth: 750,
  lineHeight: 1.5,
  focus: 'none',
  typewriter: false,
  typewriterSound: false,
  depth: 3,
  revision: false,
  enrichment: true,
  entityHighlighting: true,
  entityColors: {},
  language: 'fr',
  citationStyle: 'notes',
  cursor: 0,
  active: null,
  continuous: false,
};
