# ariane 0.3.0

Version de développement du 4 novembre 2026 pour macOS 26+ sur Apple Silicon.

## Focus

Le mode focus immersif est distinct de la concentration par mot, phrase ou paragraphe. Il s’active avec `⌘ ⇧ F`, depuis les commandes de recherche (« Activer le mode focus » / « Quitter le mode focus »), ou dans les réglages d’écriture.

Il conserve le texte, le compteur de mots, la recherche et le vocal en bas de la fenêtre. Les menus de l’application, le titre, la bibliothèque, les marges, les propositions, les points d’outline et les couleurs/interactions d’entités sont masqués. La correction orthographique reste active. Les paramètres et dialogues ouverts volontairement peuvent être utilisés avant de revenir à la page.

L’activation depuis les réglages ramène directement à la page. Le focus modifie la présentation ; il ne désactive pas l’enrichissement. Les files de mémoire, d’entités et de notes liées continuent avec les mêmes fenêtres de repos et priorités de saisie qu’en mode normal. Quitter le focus restitue les panneaux conservés et les données actualisées ; les calculs non terminés restent signalés. La prédiction du prochain mot est prévue en 0.7.0 et n’est pas ajoutée par cette version.

## Suggestions persistantes et actualisation locale

Les recherches de marge sont organisées par bloc logique de l’outline, avec un ancrage stable indépendant des retours à la ligne visuels. Modifier un bloc conserve les résultats des autres blocs et limite la nouvelle recherche au bloc modifié. Les coordonnées des marges sont relues depuis leur nœud, pour suivre le texte sans rattacher une suggestion à une autre ligne.

Les marques d’entités des blocs inchangés sont conservées et remappées à travers les transactions CodeMirror et les changements d’offset UTF-16. Les blocs modifiés sont invalidés ; une réponse tardive ne peut pas réintroduire les données d’un ancien texte ou d’un autre projet.

SQLite conserve les résultats de mémoire, les références et classements des suggestions de sources, les mentions inline et les extractions de notes liées. Les documents sources complets ne sont pas dupliqués dans chaque résultat. Les modifications de sources et d’alias réconcilient leurs dépendances ; les autres résultats sont réutilisés. La suppression d’une source ou un changement de périmètre retire les liens devenus invalides. Les nouvelles entités calculées en arrière-plan déclenchent leur affichage sans attendre une nouvelle frappe.

Un résultat vide peut être réexaminé lorsque des vecteurs deviennent disponibles après l’indexation ; l’absence initiale de résultat ne se fige pas dans le cache. Les réponses commencées sur un ancien catalogue ne peuvent pas réintroduire leurs résultats périmés.

Les pages héritées sans outline enregistrent les frontières logiques déjà construites par l’éditeur avant leur première analyse, sans modifier leur texte.

Les caches sont dérivés : le texte du manuscrit, les identités de l’outline, les fiches originales et l’historique restent les données de référence. Une suggestion n’est toujours pas une affirmation vérifiée. Une source externe connectée reste en lecture seule.

## Migration et récupération

Le schéma de mémoire passe de 3 à 4 ; la version du schéma principal des projets reste inchangée. Avant de migrer une mémoire existante, ariane crée une copie SQLite cohérente dans `recuperation/avant-memoire-v4-<identifiant>.sqlite`, incluant les écritures validées encore dans le WAL. Un échec de copie arrête la migration. Les projets sans mémoire existante initialisent directement le nouveau cache.

Cette copie préalable contient la base du projet ; conserver une sauvegarde indépendante du dossier complet, notamment pour les pièces jointes et les miroirs Markdown. Les futurs tags et annotations spécialisés ne sont pas introduits dans cette version.

## Vérification

Les scénarios ajoutés couvrent trois blocs dont seul celui du milieu change, la conservation des entités après édition Unicode, le retour sur un bloc déjà analysé, les changements de sources/alias/périmètre, la persistance SQLite et la copie de migration.

La vérification de rendu utilise Playwright avec Chrome installé, sur la prévisualisation locale `http://127.0.0.1:1420/` : entrée/sortie du focus, saisie, recherche, conservation du texte, réouverture en focus et fenêtre 800 × 650. Elle utilise un projet de recette fictif, indépendant des manuscrits de l’utilisateur. L’adaptateur navigateur ne prouve pas le fonctionnement des moteurs natifs.

`RUST_TEST_THREADS=1 npm run verify` réussit : 23 fichiers de modèles/moteurs vérifiés, 27 tests Python, build de production, 304 tests TypeScript et 141 tests Rust, puis Clippy avec refus des avertissements. Deux tests TypeScript et douze tests Rust restent ignorés selon leur configuration existante. Après le dernier ajustement d’activation dans les réglages, 21 tests d’interface ciblés passent et la construction native revérifie le build.

La construction native `npm run tauri build -- --bundles app` réussit. Le paquet indique 0.3.0, contient un exécutable arm64 et passe `codesign --verify --deep --strict` ainsi que la vérification des 23 ressources embarquées. Il est signé ad hoc et n’est pas notarié ; il s’agit d’un paquet local de développement.

La recette Playwright passe sans erreur de page ni erreur console : activation par raccourci et par les réglages, maintien du compteur/recherche/vocal, saisie, recherche, restitution de la bibliothèque et du texte, réouverture du projet en focus, initialisation d’une page héritée et fenêtre réduite. Les captures et scripts de recette sont dans `/tmp/ariane-0.3-*`, hors du dépôt.

La dictée réelle au microphone et une séance prolongée d’écriture en application native demandent une recette dédiée ; cette tâche ne renouvelle pas les mesures de précision des modèles décrites dans le rapport 0.2.2.
