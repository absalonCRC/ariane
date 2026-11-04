# Refactorisation modulaire — novembre 2026

## Objectif et référence

Refactorisation réalisée sur `codex/refactorisation-modulaire`, à partir de `main` au commit `8aee0c4` (0.3.1), sans sous-agents. Le résultat attendu est une séparation par responsabilité, avec conservation des comportements, des données, de l’interface et des interactions. Aucun changement de schéma, modèle, seuil IA ou dépendance n’est associé à ce travail.

La référence a été mesurée avant les extractions : 323 tests TypeScript réussis et 2 ignorés, 155 tests Rust réussis et 12 ignorés, 27 tests Python réussis ; build, ressources et Clippy réussis. Un projet navigateur neuf a servi aux captures de référence et à la sauvegarde/relecture. Les anciennes descriptions de création directe de page ont été écartées : la version courante demande le nom dans la sidebar avant de créer la scène.

## Lots réalisés

| Lot | Résultat |
| --- | --- |
| 0 — Caractérisation | Référence complète, captures 1440×1000 et 800×650, inventaire des invariants et des tests. |
| 1 — Contrats et transport | DTO par domaine dans `contracts/`, association paramètres/résultats IPC, adaptateur navigateur dans `platform/browser`, transport dans `platform/client`. Migration des consommateurs et suppression des anciennes façades. |
| 2 — Composition | Extraction de l’en-tête, de la surface d’écriture, de la marge, de la suggestion et du cycle de géométrie du panneau bas. Conservation du DOM, des portails et des conditions de montage. |
| 3 — Coordination | Opérations de projet et de sources séparées du coordinateur ; registre de commandes avec identifiants stables ; différences natives/palette conservées. Les refs des files et verrous gardent leur propriétaire. |
| 4 — Bibliothèque | `Binder`, `useBinder` et `BinderRow` séparent vue, contrôleur et ligne d’arbre, avec les mêmes clés et la virtualisation existante. |
| 5 — Éditeur | Types, interface impérative, montage/nettoyage et marques de révision séparés. Les refs et dépendances des effets restent dans `Editor`. |
| 6 — Sources et mémoire UI | Interfaces d’entrée explicites pour les hooks de mémoire, entités, notes, annotations et réorganisation ; suppression de leur dépendance au type global `Workspace`. |
| 7a — Versions | Vue, contrôleur et outils du portail séparés. |
| 7b — Dictée | Contrôleur de session distinct du bouton et du panneau ; acquisition, file audio et nettoyage gardés ensemble. |
| 8 — API Rust | État, requêtes, admission, activation de session et routage par domaine séparés. Le verrou de projet reste détenu pendant toute l’opération. |
| 9a — Persistance | Schéma, lectures, mutations et miroirs extraits ; la sauvegarde transactionnelle reste dans `storage`. Les deux requêtes SQL qui appartiennent aux domaines ont quitté le routeur. |
| 9b — Mémoire Rust | Synchronisation des passages et lecture du contexte séparées de l’application des résultats ; files, caches et processus existants conservés. |
| 10 — Maintenance | CSS réparti avec ordre explicite ; contrôle d’architecture intégré à `verify` ; documentation actuelle et règles durables dans `AGENTS.md`. |
| 11 — Recette | Voir les résultats et limites ci-dessous. |

`App` conserve volontairement les interactions entre domaines et les points d’ancrage des portails. `useWorkspace` conserve la navigation et la coordination de session. Les contrôleurs d’arbre, d’historique et de voix gardent un état cohérent au lieu de le répartir entre plusieurs propriétaires. Leur taille n’a pas été traitée comme un quota à atteindre.

## Preuves de conservation

- Comparaison navigateur de cinq états : écriture, réglages, focus immersif, recherche et fenêtre étroite. Texte, géométrie et pixels sont identiques aux captures de référence, après stabilisation des animations.
- Recette complémentaire : même nœud CodeMirror à travers réglages, focus, recherche, Versions et retour à l’écriture ; outils des versions exclusifs ; annuler/rétablir et sauvegarde après rechargement réussis.
- Comparaison des arbres CSS après développement des imports : mêmes règles, déclarations et ordre dans les deux feuilles fractionnées.
- Comparaison des corps de fonctions Rust après la même normalisation rustfmt : les 23 fonctions de l’ancien `project/storage.rs` et les 21 fonctions de l’ancien `memory/mod.rs` sont présentes et inchangées après répartition.
- Nouveau témoin JSON partagé entre TypeScript et Rust : révision et offsets UTF-16 d’un texte accentué avec emoji. Nouveau test des commandes natives : navigation des surfaces, différence flush/checkpoint et blocage pendant une opération de bibliothèque.

Résultat final de `RUST_TEST_THREADS=1 npm run verify` : **326 tests TypeScript réussis, 2 ignorés ; 156 tests Rust réussis, 12 ignorés ; 27 tests Python réussis**. Les 23 ressources locales, les 74 noms IPC, le build et Clippy sont validés. Le contrôle d’architecture a aussi été vérifié avec un import React interdit, puis avec son retrait.

Recette macOS avec identifiant de bundle et données dédiés : ouverture de 2 000 scènes synthétiques et 2 500 sources, navigation vers une scène, insertion Unicode, persistance SQLite vérifiée contre le miroir Markdown, réouverture du texte, ouverture de Versions, outils contextuels et retour à l’écriture. Aucun manuscrit de travail n’a servi de fixture.

Deux limites ont été isolées :

- Le benchmark natif s’arrête sur `sourceStatus === 'ready'` alors que sa fixture fixe `enrichment: false`. Cette combinaison existe déjà dans `8aee0c4` ; le parcours de performance est donc non concluant. Le produit n’a pas été modifié pour contourner cette attente.
- Lors de la recette automatisée macOS, le menu natif « Annuler la dernière action » ne retire pas l’insertion. Le même scénario a été rejoué sur un bundle indépendant construit depuis `8aee0c4`, avec le même résultat. Cette observation est conservée comme limite préexistante ; elle ne remet pas en cause le résultat navigateur distinct, mais interdit de présenter l’annulation native comme validée.

Le bundle standard a également été reconstruit avec `npm run tauri build -- --bundles app`, sans la fonctionnalité de recette. Les builds de recette et le bundle standard sont signés ad hoc et ne constituent pas une publication notarifiée. Les avertissements de taille de chunks Vite restent présents. Les journaux et captures sont locaux et ne font pas partie des sources publiables.

## Limites et retour arrière

La conservation de cinq captures ne démontre pas l’équivalence de tous les écrans et de toutes les langues. Les tests de modèles ignorés, la dictée au microphone avec voix humaine, l’IME réel, les autres machines et les sessions de plusieurs heures demandent des recettes distinctes. Aucun gain de performance n’est revendiqué à partir du seul découpage.

Les invariants de sauvegarde, de révision, de conflits externes, de contexte asynchrone et de nettoyage sont couverts par les suites existantes et les contrôles ciblés ; cette couverture ne constitue pas une garantie d’absence de toute régression.

Aucun format n’ayant changé, le retour au code précédent ne demande pas de migration inverse. Revenir par commits ciblés en conservant les données et copies de récupération ; ne jamais réinitialiser un manuscrit ou supprimer les travaux locaux pour annuler une refactorisation. Aucune publication ou fusion n’est incluse dans cette branche locale.
