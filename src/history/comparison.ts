import { t } from '../i18n';
import { diffArrays, diffWordsWithSpace } from 'diff';
import type { Section } from '../app/types';

export function sectionChanges(left?: Section, right?: Section): string[] {
  if (!left || !right) return [left ? t('Élément retiré') : t('Élément ajouté')];
  const changes: string[] = [];
  if (left.title !== right.title) changes.push(t('Titre modifié'));
  if (left.parent !== right.parent) changes.push(t('Emplacement modifié'));
  if (left.position !== right.position) changes.push(t('Ordre modifié'));
  if ((left.role || 'manuscript') !== (right.role || 'manuscript'))
    changes.push(t('Espace modifié'));
  if ((left.included !== false) !== (right.included !== false))
    changes.push(t('Inclusion dans le manuscrit modifiée'));
  if (left.synopsis !== right.synopsis) changes.push(t('Synopsis modifié'));
  if (left.status !== right.status) changes.push(t('Statut modifié'));
  if (left.goal !== right.goal) changes.push(t('Objectif modifié'));
  if (JSON.stringify(left.outline ?? null) !== JSON.stringify(right.outline ?? null))
    changes.push(t('Plan du texte modifié'));
  return changes;
}
export function comparePassages(left: string, right: string) {
  const parts = diffArrays(left ? left.split('\n\n') : [], right ? right.split('\n\n') : []);
  let leftStart = 0,
    rightStart = 0;
  const rows: {
    left: string[];
    right: string[];
    leftStart: number;
    rightStart: number;
    changed: boolean;
    words: ReturnType<typeof diffWordsWithSpace>;
  }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const a = part.added ? [] : part.value;
    const b = part.removed ? (parts[i + 1]?.added ? parts[++i].value : []) : part.value;
    const changed = !!(part.added || part.removed);
    rows.push({
      left: a,
      right: b,
      leftStart,
      rightStart,
      changed,
      words: changed
        ? diffWordsWithSpace(a.join('\n\n'), b.join('\n\n'))
        : [{ value: a.join('\n\n'), count: a.length, added: false, removed: false }],
    });
    leftStart += a.length;
    rightStart += b.length;
  }
  return rows;
}
export function reprisePassage(current: string, row: ReturnType<typeof comparePassages>[number]) {
  const paragraphs = current ? current.split('\n\n') : [];
  paragraphs.splice(row.rightStart, row.right.length, ...row.left);
  return paragraphs.join('\n\n');
}
