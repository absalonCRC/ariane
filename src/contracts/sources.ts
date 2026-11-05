export interface Vault {
  id: string;
  path: string;
  name: string;
  scope: string[];
  count: number;
  available: boolean;
  owned?: boolean;
}

export interface Source {
  fingerprint: string;
  id: string;
  vaultId: string;
  path: string;
  title: string;
  kind: string;
  aliases: string[];
  tags: string[];
  fields: Record<string, unknown>;
  text: string;
  page: number | null;
  matched: string | null;
  score: number;
  enrichment?: Enrichment;
  selectedExcerpt?: string;
}

export interface Enrichment {
  fields: {
    field: string;
    value: string;
    target: string | null;
    evidence: string[];
    status: 'derived' | 'confirmed' | 'conflict';
  }[];
  passages: {
    id: string;
    node: string | null;
    section: string;
    sectionTitle: string;
    line: number;
    quote: string;
    uncertain: boolean;
    related: { id: string; title: string }[];
  }[];
  ignored: number;
}

export interface SourcePage {
  types?: { kind: string; count: number }[];
  items: Source[];
  total: number;
  kinds: string[];
  folders: string[];
}
