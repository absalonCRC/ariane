export interface ParsedTerm {
  kind: 'tag' | 'entity';
  name: string;
}
export function parseQuery(input: string): ParsedTerm[][] {
  const groups: ParsedTerm[][] = [[]];
  let i = 0;
  while (i < input.length) {
    while (/\s/.test(input[i] ?? '') && i < input.length) i++;
    const marker = input[i++];
    if (marker !== '#' && marker !== '@') throw Error('Un filtre doit commencer par # ou @.');
    while (/\s/.test(input[i] ?? '') && i < input.length) i++;
    let name = '';
    if (input[i] === '"') {
      i++;
      let closed = false;
      while (i < input.length) {
        const c = input[i++];
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === '\\' && i < input.length) name += input[i++];
        else name += c;
      }
      if (!closed) throw Error('Guillemet fermant manquant.');
      while (/\s/.test(input[i] ?? '') && i < input.length) i++;
      if (i < input.length && !['+', ','].includes(input[i]))
        throw Error('Opérateur manquant : utilisez + ou , .');
    } else {
      const start = i;
      while (i < input.length && !['+', ','].includes(input[i])) i++;
      name = input.slice(start, i).trim();
      if (/[#@]/.test(name)) throw Error('Opérateur manquant : utilisez + ou , .');
    }
    if (!name.trim()) throw Error('Expression incomplète.');
    groups.at(-1)!.push({ kind: marker === '#' ? 'tag' : 'entity', name: name.trim() });
    if (i < input.length) {
      if (input[i++] === ',') groups.push([]);
      if (!input.slice(i).trim()) throw Error('Expression incomplète.');
    }
  }
  if (!groups[0].length) throw Error('Expression incomplète.');
  return groups;
}
export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
export function quoteName(s: string) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
