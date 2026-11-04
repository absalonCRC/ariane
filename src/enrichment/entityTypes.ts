import type { CSSProperties } from 'react';
import type { Outline } from '../app/types';
export interface EntityMention {
  from: number;
  to: number;
  title: string;
  kind: string;
  sourceId: string | null;
  entityId: string | null;
}
export interface EntityBatch {
  outline?: Outline | null;
  section: string;
  revision: number;
  text: string;
  mentions: EntityMention[];
}
export interface SelectedEntity extends EntityMention {
  blockFrom?: number;
  blockTo?: number;
  section: string;
  revision: number;
}
export const entityColors: Record<string, string> = {
  Personne: '#bd4545',
  Lieu: '#337bc1',
  Pays: '#347fa2',
  Organisation: '#9866b8',
  Ordre: '#a36694',
  Religion: '#ab7253',
  Note: '#8d719e',
  Œuvre: '#a17724',
  Événement: '#338874',
  Concept: '#8d719e',
  Objet: '#9c704a',
};
export function entityKind(kind: string): string {
  if (kind.startsWith('custom:')) return kind.slice(7);
  const key = kind.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (
    (
      {
        person: 'Personne',
        personne: 'Personne',
        place: 'Lieu',
        location: 'Lieu',
        lieu: 'Lieu',
        country: 'Pays',
        pays: 'Pays',
        organization: 'Organisation',
        organisation: 'Organisation',
        ordre: 'Ordre',
        order: 'Ordre',
        religion: 'Religion',
        note: 'Note',
        work: 'Œuvre',
        oeuvre: 'Œuvre',
        œuvre: 'Œuvre',
        event: 'Événement',
        evenement: 'Événement',
        concept: 'Concept',
        objet: 'Objet',
      } as Record<string, string>
    )[key] ?? kind
  );
}
export function entityColor(kind: string, custom: Record<string, string> = {}) {
  const key = entityKind(kind);
  const color = custom[key] ?? entityColors[key];
  return color && /^#[\da-f]{6}$/i.test(color) ? color : '#8d719e';
}

export function entityTint(kind: string, custom?: Record<string, string>): CSSProperties {
  return { '--entity-tint': entityColor(kind, custom) } as CSSProperties;
}
