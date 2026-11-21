# Recette d’ariane 0.7.2

**21 novembre 2026.** Candidat local sur `codex/0.7.2`, à partir de `main` au commit `e5f8cd7`. Les cinq fichiers de version indiquent 0.7.2. Le schéma des projets reste à 6.

## Comparaison dans Chrome

- Depuis un projet vierge, nommer une version puis allonger le paragraphe d’ouverture. Sélectionner une phrase commune et activer **Aligner ici**. La différence entre les deux premiers rectangles de texte est inférieure à 0,75 pixel CSS après stabilisation.
- En mode Source, une phrase déplacée de l’autre côté d’un paragraphe commun reste alignable. Un redimensionnement à 850 px conserve l’alignement dans ce scénario.
- À 760 px, les deux cellules d’une même rangée sont empilées au départ. Sur le témoin, les ancres sont à 188,95 px d’écart. La commande dispose cette rangée côte à côte et l’écart mesuré passe à 0 px. Le retour à 1 350 px conserve cet alignement.
- Une phrase répétée et une phrase absente de la version de droite conservent le défilement et l’alignement précédent. Le contrôle explique le refus.
- Sur le build Vite final, la réouverture du projet et l’alignement en Lecture passent sans erreur JavaScript. L’écart est passé de 175,94 px à 0 px sur ce témoin.
- Captures locales sous `output/playwright/`, dont `ariane-0.7.2-alignement.png` et `ariane-0.7.2-alignement-760.png`.

## Scission native sur Mac

Le témoin utilise un projet synthétique vierge, un bundle de débogage arm64 signé ad hoc et le profil `fr.ariane.writer.synthetic07220261121`. Le bundle de la recette de scission se trouve dans `artifacts/validation-0.7.2/bundle-synthetique/ariane.app`. Il a été construit avant l’ajustement d’alignement en fenêtre étroite.

1. Saisir un texte avec l’emoji 🌿 et placer le curseur immédiatement après celui-ci. **⌘ K → Scinder la scène** affiche « Sur la rive 🌿 » et la suite «  derrière le phare. », puis le paragraphe suivant.
2. **Échap** garde une seule scène, tout son texte et le curseur. Rouvrir la palette donne les mêmes extraits.
3. **Entrée** ajoute la scène suivante. Ouvrir chaque scène confirme les deux extraits, l’espace à droite de la coupure et les sauts de paragraphe. La lecture de SQLite retrouve les deux textes exacts et `PRAGMA integrity_check` renvoie `ok`.
4. Les tests Rust vérifient les annotations, les identités et propriétés d’outline, les smart-tags, les repères d’écriture et l’absence de version de sécurité dédiée après réorganisation.

## Vérifications automatisées

`RUST_TEST_THREADS=1 VITEST_MAX_WORKERS=2 npm run verify` a réussi sur les sources finales. La suite compte 436 tests TypeScript, 207 Rust et 27 Python réussis. Les 116 commandes IPC, 23 ressources, le build et Clippy passent. Deux tests TypeScript et douze Rust restent ignorés par défaut.

Les tests ciblés vérifient l’aperçu UTF-16, le refus d’un curseur au milieu d’un emoji, le contexte périmé, la validation à la palette et les refus d’alignement. Deux passages ont révélé une attente à durée fixe instable dans le test de continuité. Il attend maintenant la résolution du module Versions. Son assertion de rendu, de sélection et d’annulation est conservée.

L’alignement géométrique est mesuré dans Chrome. La recette native couvre la scission sur Mac. Les mesures d’endurance, les moteurs facultatifs et la distribution notariée demeurent hors de cette recette.

## Jalon suivant

La 0.7.5 est inscrite entre la 0.7.2 et la 0.8.0. Elle prévoit un audit de sécurité, une référence de performance reproductible et des améliorations ciblées du code et des modules. [Roadmap](roadmap-1.0.0.md#075--sécurité-performance-et-simplification) · [Plan](plan-0.7.0-a-1.0.0.md#075--durcir-et-simplifier-la-base-technique)
