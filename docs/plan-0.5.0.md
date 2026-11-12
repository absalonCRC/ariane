# Plan de passage à ariane 0.5.0

Date : 12 novembre 2026. Statut : **implémenté ; qualification consignée dans `validation-0.5.0.md`**.

**Objectif.** Réaliser le jalon « Retrouver, relier et commander depuis la recherche » de la [roadmap](roadmap-1.0.0.md), sans réduire la version à un changement de numéro.

**Exécution.** Travailler dans le checkout existant, sans sous-agents. Réaliser les lots dans l’ordre indiqué ; démontrer les identités et relations avant de terminer les requêtes et actions. Les cases décrivent les travaux réalisés ; les preuves et limites de chaque environnement sont consignées dans `docs/validation-0.5.0.md`.

## 1. Référence inspectée et écarts documentaires

- Branche locale `codex/0.5.0`, commit `ef4f393` (« Merge pull request #15 from absalonCRC/codex/v0.4.0 »). Arbre de travail propre avant rédaction. L’état distant n’a pas été vérifié.
- `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` indiquent encore `0.4.0`.
- Architecture conservée : Tauri 2, Rust, React/TypeScript, CodeMirror 6, SQLite et miroirs Markdown ; Apple Silicon et macOS 26+, interface FR/EN/ES.
- Les smart-tags, leur héritage, les propriétés typées, les vues texte/tableau d’un tag et le retour à l’original existent déjà : `src/tags/{model,passages,properties,table}.ts`, `TagFilterView.tsx`, `TagPassageTable.tsx`. Les réutiliser.
- Les détections et résolutions existent dans `src-tauri/src/memory/{entities,inline}.rs`. La création de fiches et l’édition protégée des alias existent dans `src-tauri/src/vaults/{owned,aliases}.rs`. Cela ne constitue pas encore le gestionnaire complet, les identités confirmées ou la fusion réversible demandés.
- Les identifiants de sources sont calculés à partir du vault et du chemin dans `vaults/parse.rs`. Ne pas les confondre avec une identité métier indépendante du nom et du déplacement d’un fichier.
- La recherche actuelle utilise `src/app/{Palette,useUnifiedSearch,projectSearch,manuscriptSearch.worker}`. Les actions à identifiants existent dans `app/commands/useWorkspaceCommands.ts`, mais les raccourcis sont répartis entre ce hook, CodeMirror et `src-tauri/src/platform.rs`. Le type `Command` de `Palette.tsx` rend encore l’identifiant facultatif.
- Le schéma projet est à 3 ; le schéma mémoire à 4 est indépendant. Les snapshots de `history/mod.rs` ne couvrent pas encore les nouveaux objets envisagés ici.

**Passages historiques à corriger pendant la livraison :** l’état initial de la roadmap décrit la 0.2.2 et cite notamment l’ancienne façade `src/app/types.ts` ; sa section d’exclusions mentionne encore les propriétés de tags, pourtant autorisées et livrées en 0.4.0. `docs/releasing.md` annonce encore 0.3.3 et parle d’un premier commit. L’annulation historique de la conservation des nœuds lors des scissions a été partiellement dépassée par l’évolution explicite de 0.4.0 décrite dans l’architecture ; elle n’autorise pas à réintroduire les autres fonctions retirées.

## 2. Périmètre et décisions proposées

La 0.5.0 comprend huit résultats : gestionnaire d’entités ; distinction détection/confirmation/homonymes ; fusion manuelle réversible ; relations nommées et éventuellement sourcées ; recherche combinée ; projection en consultation ; vues enregistrées ; commandes et raccourcis configurables.

Choix de mise en œuvre proposés pour rendre le plan exécutable :

- Une identité confirmée reçoit un ID durable dans le projet. Ses mentions, fiches et éventuelles sources externes sont des références distinctes. Deux noms identiques ne suffisent jamais à fusionner des identités. L’autocréation existante d’une fiche ne vaut pas confirmation humaine.
- Les nouvelles identités, relations, vues et informations de récupération appartiennent au SQLite du projet, pas au cache de détection. L’index des sources reste reconstructible. Les fichiers des fiches Ariane conservent leurs protections d’écriture ; un vault externe reste strictement en lecture seule.
- Une relation comporte un ID, une origine, un libellé, une destination, un statut de confirmation et une provenance facultative. Statut et provenance sont deux dimensions séparées : une proposition peut avoir une source sans être confirmée. Les propriétés de lien de 0.4.0 ne deviennent pas automatiquement des affirmations relationnelles.
- Les vues sont enregistrées par projet avec une expression structurée résolue en IDs et un nom choisi. Le nom choisi reste stable ; les libellés des références suivent leurs renommages. Une référence supprimée ou introuvable produit un état explicite.
- `+` a priorité sur `,`. Les noms à espaces sont sélectionnables par autocomplétion et utilisables entre guillemets ; la saisie non citée d’un nom à espaces doit également rester exploitable. Aucun évaluateur de code ni langage de script.
- Les filtres portent sur les lignes logiques actuelles de l’outline, hors corbeille, avec héritage des tags. `@` utilise une identité résolue ; une mention ambiguë n’est pas attribuée silencieusement. Une analyse absente ou périmée est signalée, pas présentée comme une preuve d’absence.
- Les raccourcis personnalisés sont des préférences locales de l’application. Les vues restent propres au projet. Le raccourci global de capture et sa fenêtre relèvent de 0.6.0 ; la 0.5.0 prépare uniquement le registre dont ils dépendront.

Restent hors de ce jalon : graphe permanent, édition du manuscrit dans les vues filtrées, capture compacte, prédiction, nouveau lecteur PDF/image, refonte générale ou changement de modèles IA. Les fonctions existantes restent disponibles.

## 3. Livrable A — Identités et relations

### Lot 1 — Identités durables et compatibilité des données

**Fichiers existants concernés :** `src/contracts/{entities,entityDetail,requests}.ts`, `src-tauri/src/project/schema.rs`, `src-tauri/src/memory/{entities,inline,storage}.rs`, `src-tauri/src/api/{request,memory_commands}.rs`, `src-tauri/src/history/{mod,branches,automatic}.rs` et leurs contrats frontend.

**Nouveaux modules proposés :** `src/contracts/entityIdentity.ts`, `src-tauri/src/project/entities.rs`. Le premier définit les DTO sans dépendance UI ; le second possède les identités confirmées, leurs rattachements et les mutations transactionnelles. Ne pas déplacer les moteurs de détection dans ce domaine.

- [x] Formaliser les contrats identité/mention/fiche, les statuts, les références stables et les préconditions de mutation : projet, révision et empreinte lorsque nécessaire. Prévoir les identités de sujets comme celles des autres types.
- [x] Ajouter une migration incrémentale avec copie SQLite préalable, reprise sûre et refus des schémas futurs. Fixer le numéro selon l’état réellement présent au début de l’exécution, indépendamment de `0.5.0`.
- [x] Raccorder les résolutions existantes sans convertir toutes les détections en confirmations ; conserver les références historiques et marquer les cas ambigus à résoudre.
- [x] Définir et implémenter explicitement la portée des snapshots : identités/relations avec les données du projet ; vues enregistrées comme préférences de projet conservées lors d’une restauration de texte ; raccourcis hors snapshots. Pour les variantes, conserver les IDs, isoler leurs états éditables et traiter les conflits lors d’une réunion. Une restauration ciblée ne doit pas retirer une identité encore utilisée ailleurs.
- [x] Prévoir une reprise durable pour toute mutation impliquant SQLite et une fiche sur disque : ne pas prétendre à une transaction atomique entre ces supports. Un cache réindexable ne doit pas devenir le seul détenteur d’une décision utilisateur.

**Acceptation :** un projet 0.4.0 s’ouvre sans perte de texte, tags, propriétés, annotations, versions ni résolution existante ; deux homonymes gardent deux IDs ; une réindexation conserve les confirmations ; une réponse d’un ancien projet est rejetée ; un schéma trop récent est refusé sans écriture. Tester restauration, variantes et panne aux frontières d’écriture.

### Lot 2 — Gestionnaire et fusion réversible

**Réutiliser :** `src/enrichment/MemoryReader.tsx`, `src/sources/SourceOccurrences.tsx`, `src-tauri/src/vaults/{owned,aliases}.rs`, les écrans existants et les contrôles d’empreinte.

**Ajouter :** `src/entities/EntityManager.tsx` et son contrôleur `useEntityManager.ts` ; un module d’opérations de fusion dans le domaine projet seulement si sa responsabilité le justifie. Composer depuis `App.tsx` et `app/workspace/types.ts` avec une interface ciblée.

- [x] Présenter recherche, filtres par type/statut, occurrences et accès aux fiches. Distinguer clairement mentions détectées, identité confirmée et source externe.
- [x] Créer/éditer les fiches Ariane, leur nom affiché, type, contenu et alias ; conserver le chemin pendant un simple renommage de titre afin de ne pas casser les IDs de sources. Refuser les écritures externes et les éditions sur empreinte périmée.
- [x] Permettre une résolution explicite des homonymes, sans réécriture des phrases du manuscrit.
- [x] Prévisualiser une fusion : identité conservée, alias, occurrences, liens, propriétés de relation et conflits. Conserver les fiches originales et les informations nécessaires à l’inversion ; ne pas supprimer physiquement un fichier pour fusionner.
- [x] Exécuter la fusion de manière récupérable et idempotente. Remapper les références ; garder une redirection pour les références anciennes. Permettre son annulation après redémarrage. Si une modification ultérieure empêche une inversion exacte, afficher le conflit et préserver les deux états plutôt qu’écraser le travail récent.
- [x] Actualiser les résultats concernés et conserver le contexte de navigation, les brouillons et le focus.

**Acceptation :** rechercher deux personnes homonymes, ouvrir leurs occurrences, corriger une fiche locale, prévisualiser/fusionner/annuler puis rouvrir le projet. Vérifier une fiche modifiée sur disque pendant l’édition, l’interruption d’une fusion, le réessai et l’intégrité des vaults externes. Réutiliser notamment `tests/{inline-entities,source-aliases,source-occurrences-ui}.test.tsx` ; ajouter des tests des nouveaux comportements et des transactions Rust.

### Lot 3 — Relations nommées dans les fiches

**Ajouter :** contrat `src/contracts/entityRelations.ts`, stockage `src-tauri/src/project/entity_relations.rs`, composant `src/entities/EntityRelations.tsx`. Brancher ces éléments dans le gestionnaire et les lecteurs de fiches existants.

- [x] Créer, modifier et retirer une relation dirigée entre identités ; présenter ses relations entrantes et sortantes dans la fiche.
- [x] Rendre visibles confirmation et provenance ; permettre l’ouverture de la source ou du passage cité. Conserver une provenance introuvable comme telle.
- [x] Ne créer aucune relation par simple cooccurrence. Une proposition éventuellement affichée nécessite une confirmation explicite ; aucun nouveau moteur d’inférence n’est requis par ce lot.
- [x] Préserver les relations lors des renommages, fusions, annulations et restaurations. Dédupliquer sans perdre statut ni provenance ; exposer les conflits.

**Acceptation et démonstration A :** deux homonymes, une troisième entité et une relation sourcée ; navigation dans les deux sens, modification, réouverture, fusion puis annulation. Même résultat avec moteur facultatif absent ; aucun fichier externe modifié. FR/EN/ES, clavier et focus vérifiés.

## 4. Livrable B — Requêtes et actions

### Lot 4 — Recherche structurée et projection des originaux

**Ajouter :** `src/contracts/structuredQuery.ts`, `src/search/{query,resolveQuery,evaluateQuery}.ts`. Responsabilités : syntaxe et diagnostics ; résolution en IDs avec désambiguïsation ; intersection/union de références de passages. Garder ces fonctions indépendantes de React et Tauri.

**Étendre :** `src/app/{Palette,useUnifiedSearch,projectSearch,manuscriptSearch.worker}`, `src/tags/{passages,TagFilterView,TagPassageTable,table}`, `src/app/App.tsx` et les points de navigation de l’éditeur. Extraire une projection partagée uniquement quand elle est effectivement consommée par les deux parcours.

- [x] Parser `#`, `@`, `+`, `,`, guillemets et espaces ; afficher les erreurs à l’endroit pertinent. Un opérateur final, un nom introuvable ou ambigu ne produit pas une recherche vide présentée comme valide.
- [x] Résoudre les IDs via autocomplétion et choix explicite des homonymes. Une recherche textuelle ordinaire reste textuelle ; les commandes nécessitent leur mode explicite `/` et une activation.
- [x] Évaluer tags directs/hérités et mentions résolues sur le même ensemble de passages, sans doublons. Lire les brouillons courants ; conserver les contrôles projet/révision/empreinte sur les résultats asynchrones. Signaler les mentions en attente de réanalyse.
- [x] Étendre la vue existante en consultation : contexte d’origine discret, compteur exact, texte/tableau et propriétés disponibles. Conserver l’éditeur monté et empêcher les insertions indirectes, dont la dictée, dans l’original masqué.
- [x] Ouvrir l’original au nœud courant, révéler les parents repliés et positionner la sélection en UTF-16. Si l’ancre a disparu, expliquer l’impossibilité au lieu de choisir arbitrairement une ligne.
- [x] Restaurer focus immersif, sélection et défilement à la sortie ; ne pas rouvrir les marges masquées. Conserver recherche, capsule et ancrage des boutons sur petit écran.

**Acceptation :** fixtures à résultats exacts pour `#enquête + #à revoir`, `#enquête, #à revoir`, `@christianisme + #à revoir`, expression mixte, accents, espaces, guillemets, homonymes, héritages et branches repliées. Inclure brouillon non sauvegardé, suppression/déplacement de ligne et réponse périmée. Le texte exporté et les miroirs ne contiennent aucune copie issue de la projection. Étendre `tests/{tag-filter-view,unified-search,search-editor-navigation}.test.tsx` et ajouter les tests purs de grammaire/évaluation.

### Lot 5 — Vues enregistrées par projet

**Ajouter :** `src/contracts/savedViews.ts`, `src-tauri/src/project/saved_views.rs`, un contrôleur ciblé dans `src/search/`. Étendre les contrats IPC, le routage projet et la recherche existante. L’adaptateur navigateur conserve ses capacités propres, sans simuler des accès natifs.

- [x] Enregistrer, nommer, renommer et supprimer une vue sans modifier les passages. Stocker un AST versionné et les IDs résolus, pas seulement le texte de la barre de recherche.
- [x] Retrouver les vues dans la même recherche ; recalculer à l’ouverture et après changement pertinent du texte, des tags, résolutions ou identités. Rejeter les résultats d’une ancienne requête ou d’un ancien projet.
- [x] Actualiser les libellés après renommage ; suivre les redirections après fusion. Une identité supprimée/inaccessible appelle une réparation explicite, sans substitution par un homonyme.
- [x] Conserver les vues après redémarrage et appliquer les règles de restauration fixées au lot 1, y compris le cas où une restauration rend une référence indisponible.

**Acceptation :** enregistrer une combinaison, quitter/rouvrir, renommer un tag et une entité, fusionner/annuler, modifier un héritage, puis ouvrir un autre projet. Les résultats se recalculent et aucune vue ne fuit entre projets. Tester aussi une expression persistée invalide ou d’une version future.

### Lot 6 — Commandes et raccourcis personnalisables

**Ajouter :** `src/contracts/commands.ts`, `src/app/commands/{registry,shortcuts}.ts` et un stockage ciblé des préférences locales. Le registre contient identifiant, portée, combinaison par défaut et disponibilité ; les propriétaires existants conservent leurs actions métier.

**Étendre :** `useWorkspaceCommands.ts`, `Palette.tsx`, `Preferences.tsx`, `src/editor/runtime/{mount,commands}.ts`, `src/editor/outline/view.ts` et `src-tauri/src/platform.rs` pour les accélérateurs natifs.

- [x] Recenser les raccourcis réels et leurs portées avant de les réunir. Rendre obligatoire l’ID des commandes exécutables persistées ; ne pas utiliser le libellé traduit comme clé.
- [x] Ajouter gestionnaire, relations et vues enregistrées au mode `/` existant. Permettre l’affectation depuis la recherche ; proposer liste, conflits et remise à zéro dans les paramètres.
- [x] Détecter les collisions selon le contexte : application, éditeur, champ de saisie, dialogue et menu macOS. Préserver IME, touches mortes, indentation, navigation, annuler/rétablir et raccourcis système réservés.
- [x] Synchroniser affichage, écouteurs frontend, keymaps CodeMirror et menus natifs ; retirer l’ancienne combinaison et garantir une seule exécution par geste. Préserver les différences actuelles de checkpoint, flush, navigation et erreurs entre points d’entrée.
- [x] Reconfigurer sans recréer CodeMirror. Nettoyer les abonnements et gérer un échec natif sans enregistrer une configuration mensongère. Ne pas activer le raccourci global de capture avant 0.6.0.

**Acceptation et démonstration B :** une combinaison modifiée fonctionne après redémarrage, l’ancienne ne déclenche plus l’action, les menus affichent la nouvelle, un conflit est expliqué et la remise à zéro fonctionne. Recherche textuelle sans exécution ; une activation produit exactement une action. Réutiliser `tests/workspace-commands.test.tsx`, compléter par des tests CodeMirror et une recette macOS réelle.

## 5. Intégration, version et qualification

Ordre : **1 → 2 → 3 → démonstration A → 4 → 5 → 6 → démonstration B → qualification**. La grammaire peut être préparée sur fixtures après le lot 1, mais ne doit pas figer une fausse identité. Aucun déplacement de fonction vers un jalon ultérieur n’est décidé implicitement.

- [x] Après chaque lot : tests ciblés et vérification des erreurs/concurrences affectées. Exécuter `npm run verify:architecture` après ajout/déplacement de modules ; compléter le comptage IPC par des témoins des champs et valeurs sérialisés.
- [x] Ajouter les traductions avec chaque interface. Vérifier clavier, contraste des états, lecture des erreurs et fermeture avec retour du focus.
- [x] Quand les fonctions sont présentes, aligner `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` sur **0.5.0**, sans mise à jour opportuniste des dépendances.
- [x] Exécuter `RUST_TEST_THREADS=1 npm run verify` sur le candidat intégré. Rapporter séparément échecs, tests ignorés et tests de moteurs réels. Ne pas reprendre les chiffres historiques de 0.4.0 comme résultats courants.
- [x] Faire la recette navigateur sur build de production : projet vide, projet existant, changements rapides de projet, réouverture ; tailles de référence 1440×1000 et 800×650 ; console, focus, sélection, défilement, héritage, vues et commandes. Mesurer les coordonnées des déclencheurs après stabilisation des animations.
- [x] Construire avec `npm run tauri build -- --bundles app`. Faire une recette native isolée avec identifiant et données synthétiques distincts, nom visible **ariane**. Vérifier le projet ouvert avant toute saisie. Tester données anciennes sur copies, écritures protégées, sauvegarde/fermeture/réouverture et menus/raccourcis. Le glissement de fenêtre reste non mesuré avec les outils de recette disponibles (voir le bilan).
- [x] Vérifier ressources du bundle, version et signature réellement produites. Le paquet local ad hoc ne vaut pas notarisation ; conserver cette distinction. Une éventuelle release publique relève des conditions de `docs/releasing.md` et ne fait pas partie du simple passage au jalon de développement.
- [x] Ajouter `docs/release-notes-0.5.0.md`, mettre à jour `CHANGELOG.md`, `docs/{architecture,usage,roadmap-1.0.0,releasing}.md` selon les changements réalisés et les preuves obtenues. Décrire clairement migrations et récupération. Si un commit ou une PR est créé, fournir une description détaillée des ajouts et vérifications.

**Définition de terminé.** Les huit résultats du périmètre sont utilisables ; les démonstrations A/B et les vérifications pertinentes passent ; aucune perte de données connue, écriture externe, confusion automatique d’homonymes ou double exécution de commande ; les cinq fichiers de version concordent ; documentation et paquet correspondent au candidat. Un parcours natif bloqué reste non qualifié et empêche de déclarer ce parcours terminé.

## 6. Risques et limites du plan

1. **Identité et chemins des fiches.** La stabilité des références doit être prouvée avant le gestionnaire et les vues. Une correspondance incertaine après déplacement externe reste à résoudre explicitement.
2. **Fusion et supports multiples.** SQLite, fichiers des fiches, index et historique n’ont pas une transaction commune. Les états avant/après et la reprise sont un livrable, pas une note de bas de page.
3. **Historique et variantes.** Les identités, relations et sources ne sont pas aujourd’hui toutes restaurées ensemble. La matrice de portée du lot 1 évite de promettre une restauration des fichiers externes ou d’écraser une édition ultérieure.
4. **Raccourcis natifs.** Un test DOM ne prouve pas l’absence de double événement macOS. La recette native est nécessaire avant livraison.
5. **Volume et calendrier.** La roadmap fixe une cible historique au 18–25 novembre et qualifie ce lot de très dense. Conserver cette cible comme repère, sans promettre une durée non mesurée. Réestimer après la démonstration A ; toute modification de périmètre reste une décision utilisateur.

La préparation du 12 novembre était documentaire. L’implémentation et ses vérifications ont ensuite été autorisées dans cette conversation et réalisées sur le checkout existant. Les résultats sont consignés dans les notes de version et le bilan de qualification ; les cases ne qualifient pas les moteurs facultatifs, l’endurance ou une distribution publique.
