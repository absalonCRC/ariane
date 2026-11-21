# Recette d’ariane 0.7.1

**21 novembre 2026.** Candidat local sur la branche `codex/0.7.1`, issue de `main` au commit `1c0bf7c`. La recette macOS utilise le bundle arm64 ad hoc `artifacts/validation-0.7.1/bundle-synthetique/ariane.app`, l’identifiant `fr.ariane.writer.synthetic07120261121` et un projet créé pour l’essai. La version 0.7.1 est synchronisée dans les cinq fichiers de version npm, Cargo et Tauri. L’exécutable du bundle a pour SHA-256 `25c1bd174a1a3f72e83ef3c1e7115a4c5cee380e3d37acb1c1716f8caf697761`.

## Parcours vérifiés

| Parcours | Résultat |
| --- | --- |
| Blancs | Dans Chrome, deux blancs dans deux scènes persistent après rechargement. **Blanc suivant** sélectionne le marqueur et change de scène. Remplir un blanc puis annuler restaure le marqueur et son indice. Dans WebKit natif, les crochets restent visibles lorsque le curseur quitte le marqueur. **Édition → Annuler la dernière action** rétablit le blanc, son indice et le compteur après remplacement. |
| Essai et compteur | Dans Chrome, Original et Essai alternent dans le paragraphe. Le compteur reste à cinq mots pendant l’aperçu, passe à huit à l’adoption et l’original revient à l’annulation. Dans l’app macOS relancée, la seconde formulation est retrouvée dans **Repères d’écriture**. |
| Exports confidentiels | Deux PDF produits depuis l’application macOS ont été comparés par extraction de texte. Avant adoption, le PDF contient « Le vieux phare. ». Après adoption, il contient « La lanterne tremblait au vent. ». Les deux conservent `[…]` et omettent l’indice. Les tests exécutent aussi les exports Markdown et Word. |
| Répétitions | Dans Chrome en clair et en sombre, sélectionner « pas » souligne les trois occurrences entières du paragraphe et de ses deux voisins, dont « Pàs ». « passage » reste intact. Échap et la frappe retirent les marques. |
| Données anciennes et restauration | Un témoin SQLite au schéma 5 migre au schéma 6 avec une copie de récupération cohérente. Un point de reprise retrouve l’indice et l’essai d’origine. Scission et réunion transportent les repères attachés. Après édition externe, l’essai reste récupérable avec une ancre détachée. |

## Vérifications

`RUST_TEST_THREADS=1 VITEST_MAX_WORKERS=2 npm run verify` a réussi sur les sources du bundle final. Le bilan comprend 433 tests TypeScript, 207 tests Rust et 27 tests Python réussis, ainsi que le build, les 23 ressources, les 116 commandes IPC et Clippy. Deux tests TypeScript et douze tests Rust sont ignorés par défaut. Les moteurs facultatifs et les benchmarks ignorés par défaut sont hors de cette recette. Les exports PDF natifs utilisent le moteur installé dans le bundle. Les tests ont aussi fait tourner Pandoc pour Word.

Les premiers essais ont révélé les crochets masqués par le rendu Markdown et un verrou SQLite au moment de produire une version automatique. Le marqueur conserve maintenant ses crochets dans l’éditeur. Le point de reprise automatique demande le verrou d’écriture avant sa lecture. Le premier passage Vitest a aussi rencontré l’attente existante de la vue Versions. Le test ciblé a réussi sans modifier ses assertions.

Les captures de l’essai et des deux thèmes se trouvent dans `output/playwright/`. Le raccourci natif ⌘ Z reste à vérifier sur clavier physique. L’automatisation a perdu l’accès à la fenêtre sur ce geste. L’endurance, la distribution notariée et l’installation sur un autre Mac restent à qualifier.
