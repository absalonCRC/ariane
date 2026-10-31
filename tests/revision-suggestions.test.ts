import { describe, expect, it } from 'vitest';
import { reviewSuggestions, type LanguageIssue } from '../src/revision/suggestions';

const issue = (offset: number, length: number, replacement: string): LanguageIssue => ({
  offset,
  length,
  message: 'Accord',
  replacements: [replacement],
});

describe('suggestions de révision', () => {
  it('associe les corrections du moteur aux positions UTF-16 et aux changements limités du modèle', () => {
    const text = '🌿 Les enfant joue dans le jardin.';
    const items = reviewSuggestions(
      text,
      [issue(7, 6, 'enfants')],
      '🌿 Les enfants jouent dans le jardin.',
    );
    expect(items.some((s) => s.from === 7 && s.to === 13 && s.replacement === 'enfants')).toBe(
      true,
    );
    expect(items.some((s) => s.original === 'joue' && s.replacement === 'jouent')).toBe(true);
  });
  it('écarte une réponse IA qui supprime des balises, un lien ou modifie la structure', () => {
    const input = '**Les enfant** joue. Voir [source](https://exemple.fr/a).';
    expect(reviewSuggestions(input, [], 'Les enfants jouent. Voir source.')).toEqual([]);
  });
  it('n’accepte aucun remplacement à l’intérieur des liens, du code et des noms protégés', () => {
    const input = 'Voir [Claude](https://exemple.fr) et `Maëlys`.';
    expect(
      reviewSuggestions(input, [issue(6, 6, 'Claudia')], input.replace('Maëlys', 'Maelys')),
    ).toEqual([]);
  });
  it('ignore les résultats hors limites et les remplacements vides', () => {
    expect(
      reviewSuggestions('Bonjour.', [issue(100, 3, 'x'), issue(0, 7, '')], 'Bonjour.'),
    ).toEqual([]);
  });
  it('ne présente pas comme correction un changement de nom propre ou de nombre', () => {
    expect(reviewSuggestions('Claude a 24 livres.', [], 'Claudia a 42 livres.')).toEqual([]);
  });
  it('rejette tout le résultat IA si un lien est modifié, même avec une correction voisine', () => {
    const text = 'Les enfant lisent [ce texte](https://exemple.fr).';
    expect(
      reviewSuggestions(text, [], 'Les enfants lisent [ce texte](https://example.fr).'),
    ).toEqual([]);
  });
  it('ne laisse pas une proposition LanguageTool enlever les balises', () => {
    const text = '**enfant** joue.';
    expect(reviewSuggestions(text, [issue(2, 13, 'enfants jouent')], null)).toEqual([]);
  });
});
