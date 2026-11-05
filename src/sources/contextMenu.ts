import { t } from '../i18n';
import { ArrowUpRight, Copy, Quote, Link2 } from 'lucide-react';
import type { Source } from '../contracts/sources';
import type { MenuAction, MenuContent } from '../components/ContextMenu';
export const sourceExcerpt = (source: Source) =>
  source.text
    .slice(0, 700)
    .replace(/^#\s+.*\n+/, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target);

export function selectedSourceText(element: HTMLElement) {
  const selection = window.getSelection();
  return selection?.anchorNode &&
    selection.focusNode &&
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode)
    ? selection.toString().trim()
    : '';
}
export function sourceContext(
  source: Source,
  options: {
    quote?: string;
    onRead?: () => unknown;
    onCite?: (quote: string) => unknown;
    onAssociate?: () => unknown;
  } = {},
): MenuContent {
  const actions: MenuAction[] = [],
    copy: MenuAction[] = [];
  const quote = options.quote ?? sourceExcerpt(source);
  if (options.onRead)
    actions.push({ label: t('Ouvrir la note'), icon: ArrowUpRight, run: options.onRead });
  if (quote && options.onCite)
    actions.push({ label: t('Citer l’extrait'), icon: Quote, run: () => options.onCite!(quote) });
  if (options.onAssociate)
    actions.push({ label: t('Associer à la préparation'), icon: Link2, run: options.onAssociate });
  if (typeof navigator.clipboard?.writeText === 'function') {
    if (quote)
      copy.push({
        label: t('Copier l’extrait'),
        icon: Copy,
        run: () => navigator.clipboard.writeText(quote),
      });
    copy.push({
      label: t('Copier le titre'),
      run: () => navigator.clipboard.writeText(source.title),
    });
  }
  return { title: source.title, detail: source.kind, groups: [actions, copy] };
}
