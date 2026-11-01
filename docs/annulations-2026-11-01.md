# Annulations demandées le 1er novembre 2026

Cette liste utilise la numérotation détaillée fournie juste avant la demande d’annulation, et non celle de l’audit initial.

| Points | État après annulation |
| --- | --- |
| 3 et 4 | Citations et références insérées au curseur, avec remplacement de la sélection éventuelle. Le placement des définitions en fin de scène et la protection contre une insertion périmée sont conservés. |
| 9 | Import dans le projet ouvert, sans création d’un projet supplémentaire, archive des originaux, rapport enregistré ou manifeste SHA-256 d’import. Les dossiers et les images pris en charge restent importables. Les fichiers source restent à leur emplacement. |
| 13, 14 et 15 | Remplacement global, aperçu de remplacement, exclusion par texte et annulation dédiée retirés de l’interface et de l’API. La recherche normalisée reste disponible. |
| 18 | Retour au passage par l’accueil et son bouton Créer un projet ; retrait de l’ouverture directe du formulaire et du focus ajouté à l’éditeur après création. La gestion générale du focus des dialogues reste disponible. |
| 19 | Vue d’ensemble des scènes et son entrée de menu retirées ; classeur arborescent conservé. |
| 22 | Déplacement de sélection vers une scène retiré du dialogue et refusé par le moteur. |
| 23 | Versions de sécurité propres aux réorganisations, révisions attendues et contrôle supplémentaire des miroirs retirés. Le transport spécifique des notes et des identités de passages est retiré. La séparation et la réunion font une copie directe du texte, sans conservation du plan de passages des scènes modifiées. Les mécanismes généraux de sauvegarde, la transaction SQLite et les annotations conservées restent en place. |
| 32 | Simulation des nouvelles opérations et annotations dans l’adaptateur navigateur retirée ; ces fonctions utilisent l’application Mac. |

Les autres améliorations sont conservées, notamment les notes distinctes à l’export, l’import des formats retenus, les sources facultatives à la création, la recherche avec accents, les menus macOS, la séparation/réunion, la comparaison des métadonnées dans l’historique, les annotations dans la marge et les compteurs de références/mentions.

Aucun manuscrit existant, ancienne version, fichier d’import ou enregistrement vidéo n’est supprimé par ces annulations de code. La vidéo et les paquets précédents décrivent l’état antérieur ; ils ne représentent plus toutes les fonctions de la version actuelle.

## Simplification supplémentaire de l’accueil

L’accueil présente uniquement Créer un projet et Ouvrir un projet. La bibliothèque des projets est déplacée après Ouvrir ; l’import et les choix de sources disparaissent de l’accueil. La création demande seulement le nom puis l’emplacement.

## Vérification

`npm run verify` a réussi : 198 tests TypeScript, 93 tests Rust, 4 tests Python, vérification des ressources et Clippy. Un benchmark et trois tests de moteurs facultatifs restent exclus de la suite standard. Les tests couvrent les insertions au curseur/remplacement de sélection, l’import dans le projet courant en conservant le texte existant, l’absence d’archive des originaux, le refus des requêtes retirées et la séparation/réunion sans nouvelle version préalable.

Une archive du code avant annulation est disponible dans `/tmp/ariane-annulations-20261101/avant-annulations.tar.gz`. Les résultats de construction et le paquet actualisé se trouvent dans `artifacts/annulations-2026-11-01/`.

Contrôles natifs réalisés sur le bundle reconstruit : accueil réduit, création avec un seul champ, récents accessibles après Ouvrir, absence du remplacement dans Édition, absence de la vue d’ensemble, dialogue limité à Séparer/Réunir. Un import réel de deux scènes dans le projet témoin a conservé tous les textes existants ; aucune archive, rapport ou manifeste d’import n’a été créé. Le projet initial a été rouvert après les essais.

Le DMG actualisé est dans `artifacts/annulations-2026-11-01/accueil-simple/`. Son montage, sa signature et son SHA-256 ont été vérifiés.
