export const depthLevels = [
  'Notes repérées',
  'Liens directs',
  'Thèmes communs',
  'Sources proches',
  'Liens indirects',
  'Recherche élargie',
] as const;

export function depthLevel(value: number) {
  const index = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
  return { index, label: depthLevels[index] };
}
