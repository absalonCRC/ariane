import { useSyncExternalStore } from 'react';
import messages from './messages.json';

export type Locale = 'fr' | 'en' | 'es';
export const languages: readonly { value: Locale; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
const storageKey = 'ariane.locale';
const supported = (value: unknown): value is Locale =>
  value === 'fr' || value === 'en' || value === 'es';
export function savedLocale(): Locale {
  try {
    const value = localStorage.getItem(storageKey);
    if (supported(value)) return value;
  } catch {
    /* Keep the interface usable when storage is unavailable. */
  }
  return 'fr';
}
let locale = savedLocale();
const listeners = new Set<() => void>();
export function getLocale(): Locale {
  return locale;
}
export function setLocale(value: Locale) {
  if (!supported(value)) return;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* Session-only preference. */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  if (locale === value) return;
  locale = value;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => 'fr' as const);
}
export function localeTag() {
  return { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[locale];
}
type TranslationParameters = Record<string, string | number | boolean | null | undefined>;
const catalog: Record<string, string[]> = messages;
export function translate(
  message: string,
  language: Locale,
  parameters: TranslationParameters = {},
): string {
  const translated =
    language === 'fr' ? message : (catalog[message]?.[language === 'en' ? 0 : 1] ?? message);
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name)
      ? parameters[name] == null || typeof parameters[name] === 'boolean'
        ? ''
        : String(parameters[name])
      : match,
  );
}
export function t(message: string, parameters?: TranslationParameters) {
  return translate(message, locale, parameters);
}

// Native errors may contain file names or titles. Only translate known messages;
// interpolated values are carried through verbatim.
export function localizeMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  const prefix = message.startsWith('Error: ') ? 'Error: ' : '';
  const body = prefix ? message.slice(prefix.length) : message;
  if (!body) return message;
  if (catalog[body]) return prefix + t(body);
  for (const [source, translations] of Object.entries(catalog)) {
    for (const candidate of [source, ...translations]) {
      if (candidate === body) return prefix + t(source);
      if (!candidate.includes('{')) continue;
      const names: string[] = [];
      const pattern = candidate
        .split(/(\{\w+\})/g)
        .map((part) => {
          const match = /^\{(\w+)\}$/.exec(part);
          if (match) {
            names.push(match[1]);
            return '([\\s\\S]*?)';
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
      const match = new RegExp('^' + pattern + '$').exec(body);
      if (match)
        return (
          prefix +
          t(source, {
            ...Object.fromEntries([...source.matchAll(/\{(\w+)\}/g)].map((part) => [part[1], ''])),
            ...Object.fromEntries(names.map((name, i) => [name, match[i + 1]])),
          })
        );
    }
  }
  return message;
}
