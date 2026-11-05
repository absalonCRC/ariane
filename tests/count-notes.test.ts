import { describe, expect, it } from 'vitest';
import type { Source } from '../src/contracts/sources';
import { countVaultNotes } from '../src/sources/countNotes';
function source(id: string, path: string, vaultId = 'vault-a'): Source {
  return {
    id,
    path,
    vaultId,
    fingerprint: '',
    title: path,
    kind: '',
    aliases: [],
    tags: [],
    fields: {},
    text: '',
    page: null,
    matched: null,
    score: 0,
  };
}

describe('countVaultNotes', () => {
  it('counts unique suggested vault notes, excluding other source files', () => {
    const first = source('a', 'people/Claude.md');
    expect(
      countVaultNotes([
        first,
        { ...first, matched: 'Nougaro' },
        source('b', 'places/Toulouse.MD', 'vault-b'),
        source('c', 'document.pdf'),
        source('d', 'portrait.png'),
        source('e', 'not-in-vault.md', ''),
      ]),
    ).toBe(2);
    expect(countVaultNotes([])).toBe(0);
  });
});
