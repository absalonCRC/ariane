# Direction d’interface — ariane

Ce document décrit les règles communes aux pages intégrées au projet. Il conserve l’identité existante ; il ne définit pas une nouvelle marque.

## Cadre et typographie

Le logo, la capsule du titre, le classeur et les accès du projet appartiennent au cadre permanent. Profil, Paramètres, Boîte de réception et Smart-tags occupent la zone centrale. Versions utilise les mêmes titre, marges et repères, avec ses outils de comparaison propres. Les opérations de confirmation restent des dialogues.

Les titres emploient `--literary` (EB Garamond), les commandes et les champs `--ui`, les contenus de code `--mono`. Le nom visible reste `ariane`. Les palettes claire/sombre et leurs accents viennent de `styles/tokens.css` et `styles/theme.css` ; les pages ne créent pas de palette parallèle.

## Espacement

L’échelle commune vit dans `src/styles/tokens.css` : 4, 8, 12, 16, 24, 32, 40, 48, 64 et 96 px. Les feuilles des pages utilisent les variables `--space-*`.

- 8–16 px relient des commandes ou les éléments d’un champ.
- 24–32 px séparent des groupes de réglages ou un titre de son contenu.
- 40–48 px forment les gouttières entre colonnes et les marges latérales sur grand écran.
- Le contenu commence à 96 px du haut, réduit à 80 px dans une fenêtre basse. La navigation de retour occupe la ligne qui précède le titre.
- La largeur utile atteint 1280 px dans la zone centrale. Au-delà, le contenu reste centré dans cette zone. Les textes explicatifs gardent une mesure d’environ 65 caractères.

Les groupes de réglages utilisent deux colonnes au plus et s’empilent lorsque chacune ne peut plus conserver une largeur lisible. Les listes de tags et de captures utilisent une colonne de sélection plus étroite que le détail. Le calendrier reste une grille annuelle avec défilement horizontal local sur petit écran. Aucun débordement du document ne doit servir à masquer une grille trop large.

## Densité et continuité

Les pages utilisent l’espace selon leur fonction : comparaison côte à côte dans Versions, groupes de formulaires dans Paramètres, activité et manuscrit dans Profil. Elles partagent un axe d’alignement mais ne prennent pas la grande marge supérieure réservée au manuscrit immersif. Les sections restent sur la feuille commune, sans empilement de cartes décoratives.

Les états actifs, le focus et les outils de chaque mode restent explicites. Le manuscrit et les traitements en arrière-plan restent montés ; seule leur présentation est masquée. Les opérations occupées verrouillent la navigation du cadre jusqu’à leur fin.

Les boutons utilisent un contour circulaire ou en capsule, également au survol et lorsqu’ils sont actifs. Dans la marge documentaire, chaque mention apparaît dans sa couleur. Au survol ou au focus clavier, un fond légèrement teinté avec le même arrondi de 18 px que la fiche ouverte révèle le contexte et un court extrait de la fiche, lorsqu’il est disponible. Les champs de texte et les sélecteurs adoptent l’arrondi des commandes, avec des marges adaptées à la saisie sur plusieurs lignes. Les icônes et libellés des commandes sont centrés dans leur surface. Les lignes de navigation conservent leur hiérarchie de lecture.

## Mouvement et vérification

Le changement de page utilise au plus une apparition de 150 ms en opacité, supprimée en mouvement réduit. Les contrôles gardent les états et la capsule de notifications existants. Vérifier le rendu clair et sombre, les fenêtres larges/étroites, le clavier et la restauration du contexte d’écriture.
