import type { Source } from '../contracts/sources';
export function sourceRef(s: Source) {
  return 'source-' + s.id.slice(0, 10) + (s.fingerprint ? '-' + s.fingerprint.slice(0, 8) : '');
}
export function citation(s: Source, quote: string) {
  const id = sourceRef(s) + '-' + crypto.randomUUID().slice(0, 6);
  return `\n\n> ${quote.replace(/\n/g, '\n> ')}[^${id}]\n\n[^${id}]: ${s.title}${s.page ? ', p. ' + s.page : ''}. ${s.path}\n`;
}
export function reference(s: Source) {
  const id = sourceRef(s) + '-' + crypto.randomUUID().slice(0, 6);
  return `[^${id}]\n\n[^${id}]: ${s.title}${s.page ? ', p. ' + s.page : ''}. ${s.path}\n`;
}
export function composeCitation(s: Source, text: string, style: 'notes' | 'apa' | 'chicago') {
  if (style === 'notes') return text ? citation(s, text) : reference(s);
  return `${text ? '\n\n> ' + text.replace(/\n/g, '\n> ') + '\n\n' : ''}[@${sourceRef(s)}${s.page ? ', p. ' + s.page : ''}]\n`;
}
