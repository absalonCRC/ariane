# Validation du candidat 0.9.0

## Application macOS

La recette utilise une application nommée **ariane**, un identifiant de bundle distinct et un profil synthétique. Le premier lancement ouvre un projet vide avec le vault de `tests/fixtures/document-reader`. Le scénario de la 0.9.0 s’exécute dans la WKWebView et utilise les commandes natives de l’application.

| Lancement | Résultat observé |
| --- | --- |
| Création | Après une insertion puis son annulation, le compteur de séance affiche trois mots. Le mot pour demain est enregistré au curseur. La lecture d’une deuxième scène conserve la dernière frappe de la première. Le PDF est ouvert à la page 2, agrandi à 125 % et défilé. |
| Réouverture | Le lecteur retrouve la page, le zoom et le défilement du PDF. Le projet retrouve les deux objectifs, le solde de séance et le mot dans la marge. Son effacement conserve le texte. Une image est ensuite ouverte et agrandie. |
| Retour à l’image | L’image se rouvre au zoom de 125 %. |
| Source déplacée | Après déplacement de l’image dans le vault synthétique pendant la fermeture, le projet rouvre le manuscrit et libère le lecteur. |

Pour rejouer le scénario, construire le bundle de recette avec la commande suivante.

```sh
VITE_PERFORMANCE=1 VITE_SESSION_REHEARSAL=1 npm run tauri -- build --debug \
  --features performance-harness --config scripts/performance-config.json \
  --config '{"identifier":"fr.ariane.writer.session090-synthetique"}' --bundles app
```

Créer un dossier temporaire avec `mktemp -d`, y créer le fichier vide `.ariane-performance` et y copier `tests/fixtures/document-reader` sous le nom `vault`. Lancer le bundle avec `open -n src-tauri/target/debug/bundle/macos/ariane.app --env "ARIANE_PERF_DIR=$profil"`, où `profil` désigne le chemin absolu de ce dossier. Après chaque phase, conserver le fichier `report.json`, quitter normalement et relancer avec le même profil. Avant le quatrième lancement, renommer uniquement l’image du vault synthétique. Les quatre rapports attendus portent les phases `creation`, `reopening`, `image` et `missing-source`.

## Navigateur

- **Classeur.** Un passage bref reste silencieux. Après le premier aperçu, quatre titres voisins actualisent le même cadre et conservent le focus du manuscrit. Échap ferme l’aperçu. Le menu ouvert par ⇧ F10 permet d’afficher celui d’une autre page.
- **Rangement.** Un déplacement au pointeur place une scène avant sa voisine. Le début du trait et celui du titre mesurent tous deux 78 px depuis le bord de la ligne testée. Un second déplacement fait apparaître le contour du chapitre et enregistre ce chapitre comme parent.
- **Composition.** Sur une scène longue de 95 paragraphes, le curseur reste au même offset pendant un essai de police, un essai d’interligne, l’annulation et la validation au clavier. Les mesures sont prises après recomposition dans Chrome.
- **Reprise du manuscrit.** Après rechargement d’une scène de 84 lignes, le curseur retrouve la position UTF-16 2 350 et le défilement retrouve 1 718 px. Le passage replié avant la fermeture reste replié.
- **Dernière frappe et variantes.** Après une saisie dans une variante et un retour au texte principal, la commande « Revenir à la dernière frappe » rouvre la variante et replace le curseur à la fin du texte saisi, à la position 20.
- **Paramètres.** À 760 × 600, avec le thème système sombre et la réduction des animations, la réouverture des raccourcis redonne le focus au même contrôle et rétablit le défilement de 5 329 px. Les objectifs sont accessibles en français, en anglais et en espagnol.
- **Compteurs et vues.** Deux projets gardent leurs propres objectifs. Après clôture et redémarrage d’une séance, un rechargement immédiat retrouve cinq mots dans le projet et un mot dans la nouvelle séance. Une recherche textuelle puis une vue filtrée en tableau survivent au rechargement. Le filtre conserve le total des scènes incluses du projet.

## Couverture complémentaire

`npm run verify` a réussi. Les 27 tests Python de packaging, 458 tests TypeScript et 224 tests Rust ont réussi. La suite a ignoré trois tests TypeScript et douze tests Rust. Les contrôles d’architecture et de ressources, le build et Clippy ont également réussi.

Les tests du dépôt exercent les homonymes, les transactions d’édition et les changements de variante. Le test d’export littéraire compare le Markdown avant l’ajout du mot pour demain, pendant sa présence et après son effacement. Les trois fichiers ont le même contenu.

La recette de cette version ne comprend pas de dictée au microphone physique ni d’écoute des voix sur matériel. L’acceptation visuelle par l’auteur reste ouverte.
