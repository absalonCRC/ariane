export interface EntityRelation {
  id: string;
  from: string;
  to: string;
  name: string;
  status: 'proposed' | 'confirmed';
  provenance?: { source?: string; section?: string; node?: string | null; quote: string } | null;
}
