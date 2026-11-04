import { describe, expect, it } from 'vitest';
import { reviewSuggestions } from '../src/revision/suggestions';
import { type LanguageIssue } from '../src/contracts/revision';
const issue = (offset: number, length: number, replacement: string): LanguageIssue => ({
  offset,
  length,
  message: 'Accord',
  replacements: [replacement],
});

describe('suggestions de révision', () => {
  it('garde les noms fictifs et les nombres à l’abri du dictionnaire grammatical', () => {
    expect(
      reviewSuggestions(
        'Yséliane a 120 livres.',
        [{ ...issue(0, 8, 'Éliane'), spelling: true }, issue(11, 3, '900')],
        null,
      ),
    ).toEqual([]);
  });
  it('ne transforme pas un pluriel explicite en singulier et déduplique le même effet', () => {
    const text = 'Les enfant jouent.';
    const suggestions = reviewSuggestions(
      text,
      [{ ...issue(0, 10, 'Les enfants'), replacements: ["L'enfant", 'Les enfants'] }],
      'Les enfants jouent.',
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].replacement).toBe('Les enfants');
  });
  it('refuse aussi les suppressions de négation provenant de la grammaire', () => {
    expect(reviewSuggestions('Je ne veux pas partir.', [issue(3, 11, 'veux')], null)).toEqual([]);
  });
  it.each([
    ['Je dis non.', 'non', 'nom'],
    ['I will not publish.', 'not', 'now'],
    ['Yo no publico.', 'no', 'lo'],
    ['Ich habe kein Buch.', 'kein', 'klein'],
    ['Io non pubblico.', 'non', 'noi'],
    ["I don't publish.", "don't", 'do'],
    ['Je n’autorise rien.', 'n’autorise', 'autorise'],
  ])('préserve la négation dans %s, quel que soit le moteur', (text, original, replacement) => {
    const offset = text.indexOf(original);
    expect
      .soft(reviewSuggestions(text, [issue(offset, original.length, replacement)], null))
      .toEqual([]);
    expect.soft(reviewSuggestions(text, [], text.replace(original, replacement))).toEqual([]);
  });
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
  it('conserve les corrections locales sans appliquer les suppressions de balises ou liens', () => {
    const input = '**Les enfant** joue. Voir [source](https://exemple.fr/a).';
    const items = reviewSuggestions(input, [], 'Les enfants jouent. Voir source.');
    expect(items.every((s) => ['enfant', 'joue'].includes(s.original))).toBe(true);
    expect(items.some((s) => s.replacement === 'enfants')).toBe(true);
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
  it('conserve une correction indépendante en protégeant un lien altéré par le modèle', () => {
    const text = 'Les enfant lisent [ce texte](https://exemple.fr).';
    expect(
      reviewSuggestions(text, [], 'Les enfants lisent [ce texte](https://example.fr).'),
    ).toEqual([expect.objectContaining({ original: 'enfant', replacement: 'enfants' })]);
  });
  it('ne laisse pas une proposition LanguageTool enlever les balises', () => {
    const text = '**enfant** joue.';
    expect(reviewSuggestions(text, [issue(2, 13, 'enfants jouent')], null)).toEqual([]);
  });
});
