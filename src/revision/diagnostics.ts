import { t } from '../i18n';
export interface Remark {
  from: number;
  to: number;
  message: string;
}
const stop = new Set(
  'avec dans pour cette comme elles entre celui celle leur mais dont vous nous sont plus très alors sans aussi elle fait une les des que qui est par sur aux ses son'.split(
    ' ',
  ),
);
export function analyze(text: string): Remark[] {
  const remarks: Remark[] = [];
  const words = Array.from(text.matchAll(/[\p{L}]{4,}/gu));
  const seen = new Map<string, number>();
  for (const w of words) {
    const word = w[0].toLocaleLowerCase();
    if (stop.has(word)) continue;
    const prev = seen.get(word);
    if (prev !== undefined && w.index! - prev < 250)
      remarks.push({
        from: w.index!,
        to: w.index! + w[0].length,
        message: t('Répétition rapprochée de « {0} ».', { 0: w[0] }),
      });
    seen.set(word, w.index!);
  }
  for (const s of text.matchAll(/[^.!?\n]+[.!?]/gu)) {
    if (s[0].split(/\s+/).length > 40)
      remarks.push({
        from: s.index!,
        to: s.index! + s[0].length,
        message: t('Phrase de plus de 40 mots.'),
      });
  }
  return remarks;
}
