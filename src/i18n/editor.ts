import { t } from './index';

// CodeMirror's built-in commands use English phrase identifiers.
export function editorPhrases() {
  return Object.fromEntries(
    Object.entries({
      'Go to line': 'Aller à la ligne',
      go: 'Aller',
      Find: 'Rechercher',
      next: 'suivant',
      previous: 'précédent',
      all: 'Tout',
      'match case': 'Respecter la casse',
      regexp: 'Expression régulière',
      'by word': 'Mots entiers',
      Replace: 'Remplacer',
      'replace all': 'Remplacer tout',
      'Replace with': 'Remplacer par',
      close: 'fermer',
      'Selection deleted': 'Sélection supprimée',
      'Control character': 'Caractère de contrôle',
      'current match': 'correspondance actuelle',
      'on line': 'à la ligne',
      'replaced match on line $': 'correspondance remplacée à la ligne $',
      'replaced $ matches': '$ correspondances remplacées',
    }).map(([key, value]) => [key, t(value)]),
  );
}
