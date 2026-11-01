> Rapport historique de la version précédente. Les annulations demandées ensuite sont décrites dans [annulations-2026-11-01.md](annulations-2026-11-01.md).

# Améliorations sélectionnées — validation du 1er novembre 2026

Les points **1, 2, 4, 5, 6, 7, 9, 11, 12, 13, 14 et 17** ont été intégrés. Le **point 10 est exclu** : les modules de révision linguistique ne diffèrent pas de la sauvegarde de départ. Après la demande de reprise en solo, aucun sous-agent n’a été relancé. Les modifications préexistantes du dépôt ont été conservées ; une archive du code avant ce travail se trouve dans `/tmp/ariane-selection-20261101/before-source.tar.gz`.

| Point | Comportement livré | Vérification |
| --- | --- | --- |
| 1 | Identifiants de notes distincts par scène à l’export ; doublons et définitions manquantes signalés. | Word converti par le moteur réel ; PDF créé depuis l’app avec deux notes `1`, dont les deux textes restent distincts. |
| 2 | Citation après le paragraphe, référence sans supprimer la sélection, définition en fin de scène, refus si le texte change pendant l’insertion. | Transactions CodeMirror, annulation, frontière de scène ; insertion native après « Élise Martin » sans couper « rentra à Lyon ». |
| 4 | Import Markdown, texte, dossier, DOCX et TextBundle dans un nouveau projet ; originaux, rapport et SHA-256 conservés. | Import natif d’un dossier, égalité binaire des originaux ; tests Rust pour hiérarchie, TextBundle, images, DOCX réel, notes et échec sans projet partiel. |
| 5 | Bundle arm64 signé ad hoc et DMG local, sans compte Apple payant. | Signature stricte, contrôle du DMG, montage en lecture seule, vérification de l’exécutable monté et manifeste. |
| 6 | Création avec nom et emplacement ; sources facultatives repliées ; focus du formulaire et de l’éditeur. | Création native d’un projet vierge, saisie, enregistrement, réouverture et comparaison SQLite/Markdown. |
| 7 | Recherche tolérante aux accents, apostrophes et ligatures ; remplacement par texte avec aperçu, exclusion et annulation protégée par révision. | Unicode et positions originales ; parcours natif Elise → Élise, remplacement Élise → Alice puis annulation exacte. |
| 9 | Menus Fichier, Édition, Présentation et Réglages ; actions natives et gestion du focus des dialogues. | Menus natifs et raccourcis recherche, remplacement, import, export ; retour du focus dans le manuscrit. |
| 11 | Vue d’ensemble facultative à la place de l’arbre, synopsis, statut, objectif et filtre. | Ouverture native depuis Options de la bibliothèque ; l’éditeur reste accessible. |
| 12 | Séparer, réunir, déplacer une sélection ; contrôle des révisions, version préalable, conservation des passages et des notes. | Séparation et déplacement natifs ; réunion, notes, structure, restauration et refus de révision périmée testés côté Rust. |
| 13 | Comparaison des titres, emplacements, ordre, synopsis, statut, objectifs, inclusion et plan, y compris les conteneurs. | Tests de comparaison ; version « Avant déplacement de passage » ouverte dans l’app et différence de plan visible. |
| 14 | Annotations et tâches dans la marge des sources : créer, modifier, résoudre, rouvrir, suivre un passage déplacé. | Persistance SQLite séparée du texte ; création/résolution/réouverture natives ; déplacement suivi depuis l’annotation vers la nouvelle scène. |
| 17 | Références explicites séparées des mentions littérales ; associations conservées à part. | Tests de détection et d’affichage ; fiche native montrant les compteurs séparés. |

## Résultats automatisés

- `npm run verify` sur l’état final : réussite, 21 ressources vérifiées, construction, **202 tests TypeScript, 96 tests Rust et 4 tests Python** réussis, puis Clippy sans avertissement. Total : **302 tests**.
- Les tests de régression couvrent aussi l’insertion d’une référence à la frontière entre deux scènes et l’identité d’un premier passage déplacé.
- Un benchmark TypeScript et trois tests Rust nécessitant des moteurs/échantillons facultatifs restent exclus de la suite standard. Le point 10 ne fait pas partie de cette livraison.
- Construction Tauri de production avec les ressources embarquées. L’avertissement Vite sur un bloc JavaScript dépassant 500 Ko reste présent ; aucune amélioration de performance n’est revendiquée.

Les journaux et le PDF témoin sont dans `artifacts/local-2026-11-01/livraison/preuves/`. Les projets d’essai, entièrement synthétiques, sont sous `/tmp/ariane-selection-20261101/`. Le projet de démonstration de l’utilisateur n’a pas servi aux écritures des essais.

## Limites explicites

- Le DMG est un paquet local **non notarié**, testé sur ce Mac. L’installation après téléchargement sur un autre Mac ou compte vierge reste à vérifier. Les instructions d’installation sont incluses dans le volume.
- L’import ne reprend pas les projets Scrivener `.scriv` directement, ni les métadonnées propres à Ulysses. Les pertes de mise en page/commentaires DOCX et les limites des liens/images sont décrites dans le guide d’utilisation et dans le rapport d’import.
- Les annotations ne modifient jamais le manuscrit ni les exports. Un passage changé, coupé ou ambigu peut laisser une annotation détachée, explicitement signalée. Les annotations sont conservées lors d’une restauration de version.
- L’aperçu navigateur n’effectue ni import de fichiers natifs, ni conversion de documents ; les réorganisations de textes avec notes y sont réservées à l’app Mac. Les parcours natifs et les tests de composants sont des preuves distinctes.
- Le contrôle clavier effectué n’est pas un audit complet VoiceOver. La validation ne prouve pas qu’Ariane dépasse tous ses concurrents sur tous les usages.

Consulter le [guide d’utilisation](usage.md), les [instructions d’installation](installing.md) et le [flux de construction du paquet](releasing.md).
