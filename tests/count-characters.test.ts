import { describe, expect, it } from 'vitest';
import { countCharacters } from '../src/editor/countCharacters';

describe('character count', () => {
  it('includes spaces, punctuation and line breaks', () => {
    expect(countCharacters('')).toBe(0);
    expect(countCharacters('Bonjour !\nOui')).toBe(13);
  });

  it('counts composed accents and emoji as one visible character', () => {
    expect(countCharacters('é e\u0301 👨‍👩‍👧‍👦')).toBe(5);
  });
});
