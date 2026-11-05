# Ariane — Roadmap vers la version 1.0.0

Date de cadrage : **4 novembre 2026**. Échéance impérative demandée : **version stable prête à être distribuée avant le 1er janvier 2027**. Cible de livraison : **30 décembre 2026**, avec le 31 décembre comme dernier jour de réserve.

Statut : **roadmap issue des 20 réponses ; jalons de développement 0.3.0 et 0.4.0 implémentés les 4–5 novembre 2026**. Les jalons 0.5.0 et suivants restent planifiés ; voir les notes de version pour les preuves et limites de qualification. La recette de dictée au microphone en application native et l’endurance restent à compléter ; aucune release publique du paquet final n’est publiée.

> Exécution future : réaliser les lots dans l’ordre de leurs dépendances, avec une démonstration et une recette à chaque version. Les jalons décrivent des résultats utilisables. Les changements de périmètre nécessitent une nouvelle décision du propriétaire du projet ; aucun élément convenu n’est reporté automatiquement après la 1.0.0.

**Objectif produit.** Une application locale d’écriture pour romanciers et auteurs de textes documentés, traités à égalité. Le manuscrit occupe le centre ; sources, structure et assistance apparaissent à la demande. L’interface conserve la direction artistique ultra minimaliste actuelle.

**Architecture de départ.** Tauri 2 / Rust, React / TypeScript, CodeMirror 6, projets SQLite avec miroirs Markdown, historique et moteurs locaux. Conserver cette architecture ; ajouter des responsabilités ciblées pour les tags, les requêtes structurées, la capture et la prédiction, sans refonte générale.

**Périmètre de plateforme.** Mac Apple Silicon, macOS 26 ou ultérieur. Interface française, anglaise et espagnole conservée. Écriture et données locales ; les sources externes connectées restent en lecture seule.

## 1. Faisabilité et engagement de périmètre

Les 12 idées initiales et tous les ajouts retenus font partie de la 1.0.0. Cela comprend les relations entre entités, les vues filtrées, les commandes et raccourcis personnalisables, la reprise complète et les objectifs de mots. Les versions initiales sont volontairement précises : tags avec propriétés personnalisées depuis les précisions du 5 novembre, vues filtrées en consultation, prédiction d’un mot, relations dans les fiches et lecteur PDF/image.

Le calendrier repose sur un travail presque quotidien avec Codex et des validations régulières de l’utilisateur. Du 4 novembre au 31 décembre, il existe **58 jours calendaires et 42 jours du lundi au vendredi, avant prise en compte des jours fériés**. La période des fêtes réduit potentiellement la disponibilité des testeurs.

**Le risque de calendrier est élevé.** L’inspection du dépôt établit des dépendances et des bases réutilisables ; elle ne mesure pas une capacité de production permettant de garantir toutes ces dates. Les dates ci-dessous sont des cibles conditionnelles. Le travail sur la distribution et les prototypes incertains commence dès novembre. Le 17 décembre est la cible de fin des ajouts fonctionnels ; les 18–30 décembre sont réservés à la qualification et aux corrections.

Si un jalon dépasse son enveloppe, publier immédiatement une prévision révisée, identifier le blocage et les moyens nécessaires. Ne pas maquiller une fonction incomplète en fonction terminée, ni qualifier de stable une version qui échoue aux critères. Si périmètre, moyens et date deviennent incompatibles, l’exposer explicitement : cette roadmap n’autorise ni suppression silencieuse ni glissement silencieux.

## 2. Les 20 décisions conservées

| N° | Décision |
| --- | --- |
| 01 | La date vise la **1.0.0 stable et distribuable**, pas une 0.0.0. |
| 02 | Romanciers et auteurs de textes documentés sont prioritaires à égalité. |
| 03 | Apple Silicon et macOS 26+ uniquement pour la 1.0.0. |
| 04 | Priorités d’usage : mode focus, smart-tags, puis persistance et actualisation locale des suggestions. |
| 05 | Le focus conserve une correction orthographique et une suggestion du prochain mot discrètes. |
| 06 | Smart-tags : nom, couleur, catégorie/type. Décision révisée le 5 novembre : propriétés typées héritables et alimentation configurée depuis les mentions, sans inférence automatique de relations sémantiques. |
| 07 | Héritage entre lignes d’outline et dans la hiérarchie chapitres/sections/scènes/contenu. |
| 08 | Une source modifiée actualise automatiquement les suggestions concernées seulement. |
| 09 | Le mode compact crée des notes dans une boîte de réception globale, à rattacher ensuite à un projet. |
| 10 | La prédiction apprend une base personnelle commune, adaptée au projet actif. |
| 11 | Machine à écrire sensorielle : sons et animations subtils, correction libre, esthétique minimaliste. |
| 12 | Une annotation du manuscrit retrouve un extrait précis du PDF ou une zone précise de l’image. |
| 13 | Gestionnaire d’entités : consultation, édition des fiches Ariane, alias, types, fusion manuelle, relations ; détections et confirmations distinctes. |
| 14 | Gestionnaire de tags limité à l’administration. Navigation, combinaisons et vues enregistrées passent par la recherche et l’éditeur. |
| 15 | Vues filtrées en **consultation** ; cliquer ouvre le passage original pour l’éditer. |
| 16 | Floutage mémorisé dans l’éditeur ; option d’export avec texte original ou masqué. |
| 17 | `#` désigne les smart-tags ; `@` désigne les entités ou sujets. Les deux sont combinables. |
| 18 | Commandes et raccourcis personnalisables dans la recherche ; reprise complète ; objectifs discrets dans le compteur, réglables dans les paramètres. Modèles de projet non retenus. |
| 19 | Travail utilisateur + Codex presque quotidien, avec essais réguliers de l’utilisateur. |
| 20 | Tout le périmètre convenu est indispensable avant la 1.0.0 ; les risques doivent être exposés. |

## 3. État observé dans le dépôt

Inspection statique du commit **af2747dd644a9b09db329094ccc3628a6d704264**, branche `main`, version **0.2.2** dans npm, Cargo et Tauri. Aucun essai natif ni relancement de la suite de tests n’a été effectué pour rédiger cette roadmap. Les résultats de tests des notes de version sont des preuves historiques, pas une certification renouvelée ici.

| Domaine | Base existante vérifiée | Travail restant |
| --- | --- | --- |
| Focus | Concentration mot/phrase/paragraphe, réglages et défilement machine à écrire. | Un véritable état de présentation sans menus, marges ni couleurs d’entités, indépendant de l’activité des moteurs. |
| Mémoire | Cache d’encodage persistant par passage et identifiants de nœuds. | Persistance des résultats visibles et invalidation ciblée : `useMemory.onTyping()` vide le résultat ; `useInlineEntities` vide les marques quand la sauvegarde n’est plus à l’état `saved`. |
| Tags | Tags de sources déjà présents ; nœuds d’outline identifiés. | Smart-tags du manuscrit, affectations par nœud/section, héritage, administration et requêtes. Les tags des sources ne suffisent pas à ce nouveau modèle. |
| Entités | Détection, types personnalisés, fiches, occurrences, liste et distinctions d’homonymes. | Gestion cohérente des identités, éditions, fusions réversibles et relations explicites. |
| Recherche | Worker manuscrit, recherche de sources, palette dans la barre existante. Les commandes utilisent déjà `/`. | Parseur `#`/`@`/`+`/`,`, projection des lignes dans l’espace d’édition, vues enregistrées et raccourcis configurables. |
| Documents | `Reader.tsx` affiche un PDF dans une iframe ou une image. Annotations de manuscrit déjà ancrées par texte/contexte. | Lecteur partagé pilotable, sélection de fragments, coordonnées de zones et liens persistants entre les deux côtés. |
| Prédiction | Lexique de noms/alias utilisé par la dictée. | Moteur de prochain mot, apprentissage personnel, classement par projet, présentation et acceptation inline. Le lexique n’est pas déjà un prédicteur. |
| Compact | Fenêtre principale Tauri et stockage de projets. | Fenêtre dédiée, raccourci global, cycle de vie et boîte de réception indépendante d’un projet ouvert. |
| Confort | Sons, animations de défilement, compteur, Pomodoro, préférences et contexte de reprise partiel. | Raffinement sensoriel, objectifs, paramètres cohérents et reprise de tous les nouveaux états. |
| Distribution | Scripts de vérification/paquet local, CI et procédure de release. | Preuve d’installation du paquet final signé/notarié sur environnement vierge, installation des modules et validation des nouveaux formats de données. |

Principaux points d’entrée du dépôt : [types](https://github.com/absalonCRC/ariane/blob/main/src/app/types.ts), [mémoire visible](https://github.com/absalonCRC/ariane/blob/main/src/enrichment/useMemory.ts), [entités inline](https://github.com/absalonCRC/ariane/blob/main/src/enrichment/useInlineEntities.ts), [cache](https://github.com/absalonCRC/ariane/blob/main/src-tauri/src/memory/encoding_cache.rs), [palette](https://github.com/absalonCRC/ariane/blob/main/src/app/Palette.tsx), [lecteur](https://github.com/absalonCRC/ariane/blob/main/src/sources/Reader.tsx), [distribution](https://github.com/absalonCRC/ariane/blob/main/docs/releasing.md).

## 4. Règles de version

Poursuivre **0.2.2 → 0.3.0 → … → 0.9.0 → 1.0.0-beta.n → 1.0.0-rc.n → 1.0.0**. Un jalon mineur correspond à un ensemble fonctionnel utilisable ; un correctif `0.x.1`, `0.x.2` est créé seulement pour des corrections réellement nécessaires. Aucun correctif fictif n’est planifié pour remplir le calendrier.

La convention reprend [SemVer](https://semver.org/lang/fr/) : correctifs, ajouts fonctionnels, préversions et première version stable. Pour cette application, documenter avant la 1.0.0 le contrat de compatibilité des projets, de leurs métadonnées, des exports et des commandes. La version du schéma SQLite est indépendante du numéro de l’application. Toute migration doit préserver une possibilité de récupération ; un ancien exécutable doit refuser un schéma trop récent avec un message clair.

Les versions `0.x` sont des jalons de développement, pas des promesses de stabilité publique. Des builds `0.x.0-alpha.n` peuvent servir aux essais avant validation du jalon. Les préversions de 1.0.0 contiennent tout le périmètre retenu. Après le gel, les différences entre bêta, RC et stable sont des corrections et de la qualification.

Synchroniser les versions dans `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` et `src-tauri/tauri.conf.json`. Chaque livraison documente changements, migrations, vérification et limites. Aucun numéro de version de l’application n’est modifié par la rédaction de ce plan.

## 5. Calendrier cible

Les plages incluent implémentation, tests du lot, intégration et recette. Le chantier distribution et les prototypes de risque utilisent une part du même temps disponible ; ce ne sont pas des ressources supplémentaires supposées.

| Version | Fenêtre cible 2026 | Résultat attendu | Incertitude |
| --- | --- | --- | --- |
| **0.3.0** | 4–10 novembre | Focus et suggestions persistantes, actualisation locale. | Forte : dépendances des résultats et ordonnancement des moteurs. |
| **0.4.0** | 11–17 novembre | Smart-tags, héritage, gestionnaire simple et sélection Shift des lignes. | Forte : identité des nœuds et migrations. |
| **0.5.0** | 18–25 novembre | Gestionnaire d’entités, relations, recherche structurée, vues et commandes configurables. | Très forte : lot le plus dense. |
| **0.6.0** | 26 novembre–1er décembre | Capture compacte, boîte de réception globale, machine à écrire affinée. | Forte : fenêtres et sauvegarde de captures. |
| **0.7.0** | 2–7 décembre | Suggestion du prochain mot et apprentissage local personnalisé. | Très forte : qualité à prouver, pas seulement fonctionnement. |
| **0.8.0** | 8–13 décembre | PDF/image en vue partagée, annotations précises, floutage et exports masqués. | Très forte : ancrage et fidélité des exports. |
| **0.9.0** | 14–17 décembre | Paramètres finalisés, objectifs dans le compteur, reprise complète et intégration globale. | Forte : fenêtre courte, fondations livrées dans les lots précédents. |
| **1.0.0-beta.1** | 18 décembre | Tout le périmètre disponible ; début de recette complète du candidat. | Conditionnée à la fin réelle des fonctions. |
| **1.0.0-beta.2** | 21 décembre, si corrections | Corrections issues des premiers parcours complets. | Le numéro n’est créé que si le build change. |
| **1.0.0-rc.1** | 23 décembre | Candidat signé/notarié, fonctionnellement gelé. | Installation vierge et données anciennes qualifiées. |
| **1.0.0-rc.2** | 28 décembre, si corrections | Nouveau candidat après corrections, avec nouvelle qualification ciblée. | Toute correction invalide les preuves affectées. |
| **1.0.0** | **30 décembre** | Paquet stable prêt à être distribué, sources et documentation correspondantes. | Tous les critères de sortie doivent être satisfaits. |
| Réserve | **31 décembre** | Dernier contrôle ou incident final de distribution. | Ce jour ne doit pas servir à terminer une fonctionnalité. |

L’ordre des premiers lots respecte la priorité focus puis tags. La persistance, troisième priorité exprimée, est avancée dans le premier lot parce qu’elle garantit le retour correct depuis le focus.

## 6. Livrables par version

### 0.3.0 — Écrire sans interruption

**Résultat.** Le focus n’affiche que l’éditeur et, en bas, le compteur, la recherche et le vocal. Les panneaux, suggestions documentaires, notes liées, points de l’outline, marques de tags et couleurs/interactions d’entités sont masqués. La correction orthographique reste discrète ; le prochain mot y sera intégré à partir de 0.7.0. Le curseur et le texte gardent leur place.

- [x] Ajouter un état « focus immersif » indépendant des modes existants de concentration par mot/phrase/paragraphe. Entrée/sortie au clavier et par la recherche ; retour fiable à la disposition précédente.
- [x] Séparer affichage et traitement : cacher l’interface documentaire ne désactive ni l’indexation ni les files de détection. Les tâches progressent en arrière-plan avec une priorité à la frappe ; elles n’attendent pas la sortie du focus pour être relancées.
- [x] Remplacer les remises à zéro globales par un état durable des résultats par projet/section/nœud. Conserver les propositions inchangées pendant la frappe, la navigation et la réouverture du projet.
- [x] Invalider le bloc logique modifié et ses dépendances réellement touchées. Une ligne visuelle due au retour automatique n’est pas une unité d’analyse. Déplacement, scission, réunion et changement de contexte parent doivent actualiser ce qui dépend effectivement de ces changements.
- [x] Conserver les résultats ancrés dans une zone restée valide ; retirer ou marquer périmé un résultat devenu invalide. Une réponse asynchrone ancienne ne peut pas remplacer un résultat plus récent.
- [x] Une source ou un alias modifié invalide ses rapprochements concernés. Une nouvelle source peut enrichir les passages pertinents en arrière-plan sans effacer les suggestions existantes encore valides.
- [x] Définir les identités persistantes, le versionnement des métadonnées et leur prise en charge dans l’historique pour les lots suivants. Préparer une copie cohérente avant migration.

**Recette de sortie.** Créer des suggestions sur trois blocs ; modifier le deuxième ; vérifier que les résultats et marques du premier et du troisième restent présents et ne sont pas redemandés inutilement. Modifier ensuite la source du premier et constater une actualisation ciblée. Entrer en focus, écrire, dicter, rechercher et quitter : aucune couleur d’entité pendant le focus, résultats actualisés au retour, aucune perte de texte ni déplacement arbitraire. Si un moteur n’a pas fini, afficher son état de traitement plutôt qu’un résultat périmé présenté comme à jour. Refaire le parcours après fermeture/réouverture.

**Points d’entrée existants.** `src/app/App.tsx`, `src/enrichment/useMemory.ts`, `src/enrichment/useInlineEntities.ts`, `src/enrichment/useEnrichment.ts`, `src/editor/entities.ts`, `src/editor/outline/state.ts`, `src-tauri/src/memory/{queue,storage,encoding_cache}.rs`, `src-tauri/src/project/storage.rs`.

**Suivi du 4 novembre.** Implémentation de la 0.3.0, versions npm/Cargo/Tauri alignées. Vérification complète réussie : 304 tests TypeScript, 27 Python, 141 Rust, ressources, build et Clippy. Paquet macOS local construit, version 0.3.0 arm64, signature ad hoc et 23 ressources embarquées vérifiées. Recette de rendu Chrome/Playwright en 1440 × 1000 et 800 × 650, avec projet fictif et page héritée, sans erreur console. Les cas ignorés de la suite, la dictée réelle en focus et l’endurance sont documentés dans [les notes 0.3.0](https://github.com/absalonCRC/ariane/blob/main/docs/release-notes-0.3.0.md).

### 0.4.0 — Smart-tags, propriétés et vues

**Résultat.** Appliquer plusieurs smart-tags inline à une ligne d’outline ou à un chapitre, une section, une note ou une scène. Un tag possède un nom, une couleur et un type/catégorie. Son identité reste stable lors d’un renommage.

- [x] Créer les définitions et affectations explicites des tags ; séparer les smart-tags du projet des tags déjà lus dans les sources externes.
- [x] Calculer l’héritage à travers la structure des textes et celle de l’outline. Afficher discrètement la provenance d’un tag hérité et éviter les doublons entre héritage et affectation directe.
- [x] Ajouter une saisie inline par `#` et autocomplétion ; un tag saisi devient une métadonnée attachée au bon élément, sans polluer le texte littéraire exporté.
- [x] Créer le gestionnaire d’administration : créer, renommer, typer, colorer, fusionner, supprimer et afficher le nombre d’utilisations. Les opérations modifient les affectations, jamais le texte du manuscrit.
- [x] Garantir les tags à travers déplacements, annulation/rétablissement, corbeille, restauration d’une version, scission et réunion des textes.
- [x] Ajouter **Shift + clic sur les points de l’outline** pour sélectionner le contenu complet des lignes. Convention proposée : le premier Shift-clic établit l’ancre, les suivants étendent une plage contiguë ; les descendants d’une branche sélectionnée sont inclus, même repliés. Ne pas déclencher en même temps le pliage ou le glisser-déposer. Vérifier le geste avec l’utilisateur pendant la recette.

**Recette de sortie.** Un chapitre et une ligne parent transmettent leurs tags à tous leurs descendants ; déplacer une branche réévalue uniquement son héritage, en conservant ses tags propres. Renommer/fusionner un tag conserve les liens. Fermer/réouvrir puis restaurer une version retrouve les tags attendus. Une sélection Shift permet de copier exactement le contenu complet des lignes, y compris une branche repliée.

**Dépendance.** Identités et métadonnées de 0.3.0. Le gestionnaire de tags n’ajoute pas de vue de navigation permanente : celle-ci arrivera dans la recherche en 0.5.0.

**Précisions du 5 novembre, demandées par l’utilisateur.** Création/réutilisation automatique par `#nom`, couleurs distinctes à la création, libellés à la fin du passage (le placement à gauche essayé pendant la recette est abandonné), points d’outline colorés selon les tags effectifs, répétitions de libellés masquées sur les enfants sans retirer l’héritage. Le gestionnaire est une page plein écran accessible depuis la sidebar ; aucun formulaire d’ajout sous le titre. Un clic sur un tag ouvre une projection temporaire en lecture seule, directs et hérités compris, puis rejoint l’original par clic. Ce parcours simple de 0.5.0 est avancé ; les requêtes combinées, vues enregistrées et raccourcis restent au jalon suivant. Les [notes 0.4.0](release-notes-0.4.0.md) distinguent implémentation, recette et limites. Le geste Maj-clic reste à valider par l’utilisateur.

**Ajouts validés pendant la recette du 5 novembre.** Les tags du titre se saisissent par `#nom`, s’affichent sur la même ligne en petite typographie, près du titre, et sont hérités par toutes les lignes de la page. Fond capsule et croix de retrait apparaissent au survol ; la croix retire une affectation, pas la définition du tag. Les points sans tag restent masqués hors survol ; un chevron distinct possède le pliage. Un clic sur le point ouvre les propriétés de la ligne dans la marge droite.

Les propriétés des tags sont du texte, une date, un nombre, une case ou un lien nommé vers une note ou une ligne existante. Les mentions actuelles et non ambiguës alimentent les champs de lien configurés par type ; les valeurs saisies restent prioritaires. Cette évolution lève l’exclusion initiale des champs personnalisés. Les identités stables et références préparent le graphe interconnecté souhaité ; sa visualisation complète n’est pas livrée ici.

La vue d’un tag couvre toutes les pages et les héritages. Elle conserve le chrome, la recherche et le compteur adapté aux passages affichés. Le bouton à la place de « Aa » alterne texte/tableau ; le tableau présente toutes les propriétés actives et adapte sa largeur aux colonnes. La profondeur est désactivée pendant le filtre. La capsule de titre et de notifications est réutilisée selon le contexte ; la branche apparaît uniquement si une variante existe, et jamais pendant une notification.

### 0.5.0 — Retrouver, relier et commander depuis la recherche

Ce lot comporte deux livrables successifs : **gestion des identités**, puis **requêtes et actions**. Prévoir des démonstrations intermédiaires sans attendre le 25 novembre.

- [ ] Livrer le gestionnaire d’entités : recherche, filtres par type, occurrences, création et édition des fiches appartenant à Ariane, alias et correction de type.
- [ ] Distinguer les mentions détectées, les identités confirmées et les homonymes. Une fusion est manuelle, prévisualisée et réversible ; elle réconcilie occurrences, liens et alias sans fusion automatique de deux personnes de même nom.
- [ ] Ajouter les relations entre entités : source, relation nommée, destination, éventuelle provenance documentaire. Présentation dans les fiches ; pas de graphe permanent imposé. Les relations manuelles, sourcées et proposées restent distinguables.
- [ ] Étendre la recherche existante : `#tag`, `@entité`, `+` pour ET, `,` pour OU. Les filtres par tags incluent les affectations directes et héritées ; une entité ou un sujet est identifié par son ID, pas seulement par sa chaîne de caractères.
- [ ] Afficher dans l’espace de l’éditeur uniquement les lignes correspondantes, avec un contexte d’origine discret. Vue en consultation ; cliquer ouvre le document original, révèle les parents repliés et place le curseur au bon endroit.
- [ ] Enregistrer une requête sous un nom et la retrouver depuis la recherche. Recalculer sa vue à l’ouverture et après modification pertinente. Les renommages de tags/entités actualisent son libellé sans casser ses références.
- [ ] Réutiliser le préfixe de commandes `/` déjà présent. Ajouter les commandes des nouvelles fonctions et l’affectation des raccourcis depuis cette même barre. Les paramètres présentent aussi la liste, les conflits et la réinitialisation.
- [ ] Établir un registre commun pour les raccourcis de l’éditeur et de l’application, puis le raccourci global du compact. Une combinaison conflictuelle est expliquée ; les raccourcis de saisie, IME, indentation et navigation restent utilisables.

**Grammaire 1.0.0.** `#enquête + #à revoir` correspond à l’intersection ; `#enquête, #à revoir` à l’union ; `@christianisme + #à revoir` combine entité et tag. Les noms à espaces restent utilisables, avec autocomplétion et guillemets possibles. Proposition de priorité : `+` est évalué avant `,` ; l’interface explicite une expression mixte. Une expression incomplète ne déclenche pas une recherche trompeuse. Les « formules » de cette version sont ces combinaisons de recherche, pas du code exécutable.

**Recette de sortie.** Tester intersections, unions, mélange `#`/`@`, accents, espaces, homonymes et renommages sur un projet contenant lignes isolées et branches héritées. Tous les résultats respectent la requête ; la vue ne modifie jamais le manuscrit. Un raccourci reconfiguré fonctionne après redémarrage et une commande n’est jamais exécutée par une simple recherche textuelle.

**Dépendances.** Tags et nœuds de 0.4.0, liens et invalidation de 0.3.0. Réutiliser `src/app/Palette.tsx`, `src/app/useUnifiedSearch.ts`, `src/app/projectSearch.ts`, `src/app/manuscriptSearch.worker.ts`, `src/sources/SourceOccurrences.tsx`, `src/enrichment/MemoryReader.tsx` et `src-tauri/src/memory/entities.rs`.

### 0.6.0 — Capturer une idée depuis une autre application

**Résultat.** Un raccourci global fait apparaître une petite fenêtre au-dessus de l’application courante, depuis le bas de l’écran. Elle utilise un éditeur ultra minimaliste et le défilement machine à écrire. Le contenu rejoint une boîte de réception globale indépendante du projet actif.

- [ ] Ajouter le raccourci global configurable et la fenêtre compacte. Positionnement sur l’écran utilisé, restauration correcte du focus à la fermeture, essais avec plusieurs écrans et Spaces.
- [ ] Sauvegarder progressivement chaque capture dans un stockage durable global. Échapper/masquer conserve le brouillon ; une action explicite termine la note et prépare la suivante.
- [ ] Ouvrir la boîte de réception depuis la bibliothèque et la recherche, sans panneau permanent supplémentaire. Ranger une capture dans un projet, y compris en créer un depuis le parcours habituel si nécessaire.
- [ ] Rendre le rangement récupérable et idempotent : en cas d’arrêt entre l’écriture dans le projet et le marquage de la capture comme rangée, reprendre sans doublon ni perte. Le texte de la capture ne doit pas être effacé avant la confirmation de destination.
- [ ] Empêcher la fenêtre compacte de modifier implicitement le projet actif du backend. Tester les sauvegardes simultanées des deux fenêtres.
- [ ] Affiner le mode machine à écrire commun aux deux éditeurs : sons cohérents de touche/espace/retour, volume réglable, mouvement discret du texte, continuité du curseur et retour de chariot subtil. Respecter les animations réduites et permettre le silence.
- [ ] Préserver correction, sélection, annulation et déplacement libre. Aucun blocage volontaire des retours en arrière. Aucun dessin décoratif de machine ou commande permanente ajoutée.

**Recette de sortie.** Depuis une autre application, ouvrir, écrire, masquer, rouvrir, terminer et ranger trois captures. Répéter sans projet ouvert, avec la fenêtre principale fermée mais l’application active, puis après redémarrage. Interrompre le rangement et récupérer une seule note complète. Vérifier la restitution du focus et le mode à animations réduites. Comparer la sensation de frappe dans la fenêtre principale et la compacte.

**Hypothèse de fonctionnement.** Le raccourci global est actif tant qu’Ariane est lancée, même sans fenêtre principale visible. Quitter explicitement l’application l’arrête. Un service capable de réveiller une application totalement quittée n’est pas implicitement ajouté. Le [plugin global-shortcut de Tauri](https://v2.tauri.app/plugin/global-shortcut/) fournit la base de gestion des raccourcis ; le comportement exact des fenêtres flottantes doit être validé sur macOS.

**Dépendances.** Registre de commandes 0.5.0, sauvegarde et identités 0.3.0. La boîte de réception globale doit aussi être couverte par la sauvegarde/récupération et les paramètres de données.

### 0.7.0 — Proposer le prochain mot

**Résultat.** Une proposition d’un seul mot apparaît discrètement à la suite du curseur. Elle tient compte des mots précédents, du vocabulaire personnel et du projet actif. Elle fonctionne aussi en focus et en compact.

- [ ] Prototyper d’abord un prédicteur local léger fondé sur fréquences et séquences de mots, enrichi du lexique des noms/alias. Évaluer avant de choisir le moteur définitif ; aucun nouveau grand modèle n’est présupposé.
- [ ] Séparer la base personnelle commune et les contributions du projet actif ; donner une priorité contrôlée à ce dernier. Dans la capture sans projet, employer la base commune.
- [ ] Apprendre des textes réellement conservés et des acceptations/rejets. Les propositions non acceptées ne doivent pas nourrir le modèle. Une sauvegarde ou une réouverture ne doit pas recompter tout le corpus.
- [ ] Gérer corrections, suppression de textes, noms propres, apostrophes, accents et langues. Garder les contributions identifiables pour réindexer ou oublier un projet sans contaminer tout le profil.
- [ ] Ajouter l’acceptation par un raccourci configurable, le rejet et la désactivation. Résoudre explicitement le conflit avec Tab pour l’indentation de l’outline ; proposer par défaut une combinaison libre après vérification du registre.
- [ ] Ne rien insérer sans acceptation. Suspendre la proposition pendant la composition IME, une sélection, l’édition de code ou une navigation qui ne correspond pas à la frappe courante.
- [ ] Ajouter aux paramètres l’activation, le niveau de discrétion et la réinitialisation de l’apprentissage. Les sources externes servent au lexique des entités autorisées ; leur prose n’est pas absorbée silencieusement dans le style personnel.

**Recette de sortie.** Corpus fixes, séparés entre apprentissage et évaluation, avec textes littéraires et documentaires en français, anglais et espagnol. Mesurer exactitude du premier mot proposé, couverture, latence et acceptations/rejets en usage réel. Comparer le profil appris à la même base sans personnalisation ; la personnalisation doit produire un gain mesuré sur le corpus personnel tenu à l’écart de l’apprentissage. Vérifier aussi les erreurs d’un projet vers l’autre et publier les limites. Une proposition qui fonctionne techniquement mais ne devient pas plus pertinente avec l’usage ne satisfait pas cette demande.

**Point de décision anticipé.** Le prototype doit fournir un premier bilan au plus tard le 12 novembre. Fixer alors les seuils de qualité et de latence de recette à partir des mesures initiales et du ressenti utilisateur, avant le lot principal de décembre. Cette incertitude reste ouverte tant que ces mesures n’existent pas ; ne pas repousser sa découverte au 7 décembre.

**Dépendances.** Registre de commandes, lexique et stockage personnel. Le temps de frappe ne doit jamais attendre un calcul de prédiction.

### 0.8.0 — Lire, annoter et masquer précisément

**Résultat.** Ouvrir un PDF ou une image bascule vers une vue partagée inspirée de Versions : manuscrit éditable à gauche, document à droite. Fermer le document restitue l’espace précédent. Un lien depuis l’annotation retrouve exactement l’extrait ou la zone visée.

- [ ] Étendre le lecteur existant avec navigation de pages, zoom et sélection. Évaluer un rendu local pilotable tel que [PDF.js](https://mozilla.github.io/pdf.js/), plateforme de lecture/rendu PDF, au lieu de supposer que l’iframe actuelle offre les contrôles nécessaires.
- [ ] Ancrer un extrait PDF par identité/empreinte du fichier, page, texte sélectionné, contexte et rectangles normalisés. Ancrer une zone d’image par identité/empreinte et coordonnées normalisées. Stocker les annotations côté Ariane ; ne pas réécrire les fichiers externes.
- [ ] Créer depuis la sélection une annotation liée à un passage du manuscrit ; conserver le lien lors des modifications, déplacements et restaurations. Le retour vers le document sélectionne et révèle l’emplacement, au bon zoom si utile.
- [ ] Gérer fichier déplacé, remplacé, absent ou extrait devenu ambigu : proposer de retrouver/reconnecter la source et conserver la note ; ne pas réattacher silencieusement à un autre passage.
- [ ] Pour un PDF scanné sans couche texte, permettre une sélection de zone comme pour une image. L’OCR n’est pas un prérequis ajouté à cette 1.0.0.
- [ ] Ajouter « Flouter / Déflouter » au menu contextuel d’une sélection. Conserver les plages comme métadonnées remappées avec les éditions, l’annulation et l’historique, avec un repère de plage lorsque le flou empêche de lire.
- [ ] Proposer à l’export **texte original** ou **passages masqués**, pour Markdown, PDF, Word et EPUB. En mode masqué, remplacer le contenu des plages avant conversion : blocs opaques ou marqueur textuel compatible avec le format. Une surcouche CSS sur du texte encore présent ne suffit pas.
- [ ] Vérifier les contenus textuels, annotations et métadonnées générés par l’export : le texte masqué ne doit pas subsister dans une couche sélectionnable ou cachée liée à ces plages. L’original demeure dans le projet. La copie normale depuis l’éditeur conserve le texte, conformément à la portée d’affichage et d’export retenue ; ce comportement doit être compréhensible.

**Recette de sortie.** Lier une sélection sur deux lignes d’un PDF et une zone d’image ; fermer, rouvrir, changer le zoom et revenir depuis le manuscrit. Modifier le fichier source et constater un état de lien à vérifier. Flouter une phrase, éditer avant et dans la plage, annuler, redémarrer et restaurer une version. Exporter un texte témoin unique dans les quatre formats : original présent en export normal, absent des contenus extractibles des plages masquées en export masqué. Vérifier aussi les tableaux, citations et styles proches de ces plages.

**Dépendances.** Identités et annotations de 0.3.0, lecteur existant, exports. Le choix de moteur PDF et la stabilité des coordonnées doivent être éprouvés par prototype avant le 12 novembre.

### 0.9.0 — Finaliser les réglages et retrouver sa séance

Les réglages propres à chaque fonction sont intégrés lors de son lot. Cette version assure leur cohérence visuelle et leur articulation, afin d’éviter de réserver toute l’interface des paramètres à quatre jours de décembre.

- [ ] Revoir la présentation des paramètres dans la direction artistique actuelle : typographie, espacements, hiérarchie simple, navigation au clavier, contrôles contextuels. Conserver un accès léger aux réglages d’écriture courants.
- [ ] Couvrir apparence, lecture/écriture, focus, machine à écrire et sons, prédiction, objectifs, sources/entités/tags, vocal et modules locaux, raccourcis, données/sauvegardes et reprise. Clarifier ce qui s’applique à toute l’application et au projet courant.
- [ ] Intégrer un objectif de mots par séance et/ou par projet au compteur existant : progression discrète, objectif atteint sans alerte intrusive, désactivation possible. Configurer objectifs et affichage dans les paramètres.
- [ ] Définir un comptage compréhensible : objectif de projet sur le texte inclus dans le manuscrit ; séance sur le solde net de mots ajoutés pendant la séance, corrections et annulations incluses. Dictée et mots acceptés participent au même texte ; le classement d’une capture ne doit pas compter deux fois une production. Une recherche filtrée ne transforme pas le total du projet en total de résultats sans indication.
- [ ] Étendre la reprise de session : projet, document, nœud/curseur, défilement, branches repliées, focus et machine à écrire, document PDF/image ouvert avec position, requête/vue enregistrée, objectif/séance et brouillon compact.
- [ ] Restaurer seulement après résolution du projet et des sources ; si un élément manque, revenir au contexte disponible sans bloquer l’ouverture. Ne jamais réactiver le microphone ni exécuter une commande par simple restauration.
- [ ] Vérifier les parcours combinés : focus + prédiction + objectif, compact + capture + reprise, recherche + entité + PDF + annotation, puis passage vers Versions et retour.
- [ ] Compléter les libellés français/anglais/espagnol, les contrastes, le focus clavier et les comportements à animations réduites dans toutes les nouvelles surfaces.

**Recette de sortie.** Configurer un objectif, changer un raccourci et le volume, ouvrir un PDF sur un extrait, lancer une vue filtrée puis quitter. À la reprise, retrouver l’état attendu et les réglages, sans microphone actif. Vérifier les compteurs après frappe, dictée, annulation, import et rangement de capture. Comparer les écrans clair/sombre et les trois langues, dans une fenêtre de taille minimale.

**Dépendances.** Tous les états livrés de 0.3 à 0.8 ; `src/app/Settings.tsx`, `src/app/Preferences.tsx`, `src/components/WritingCounter.tsx`, `src/enrichment/useMemory.ts`, `src/timer/usePomodoro.ts` et leurs persistances.

## 7. Chantier continu : données, installation et distribution

Ce chantier est indispensable à la 1.0.0 et consomme une part des plages ci-dessus. Il commence immédiatement ; il n’attend pas la bêta. Le dépôt dispose déjà de migrations et d’une procédure de publication : les compléter pour les nouvelles données et qualifier leurs résultats.

| Échéance | Livrable vérifiable |
| --- | --- |
| **7 novembre** | Établir la disponibilité du compte/certificat Developer ID, des accès de notarisation et d’un Mac ou compte vierge de test. Leur disponibilité n’a pas été vérifiée lors de cette roadmap. Documenter les propriétaires et le chemin de construction reproductible. |
| **10 novembre** | Copie cohérente avant migration, restauration éprouvée et jeux de projets 0.2.2 conservés pour toute la campagne. Sauvegardes transactionnelles et reprise après arrêt forcé couvertes. |
| **12 novembre** | Premier paquet de la base existante signé/notarié et essai de téléchargement/installation. En cas de blocage administratif, le signaler immédiatement. |
| **17 novembre** | Parcours de sauvegarde complète et restauration accessible depuis les paramètres, comprenant projet, métadonnées et pièces jointes appartenant au projet. Les sauvegardes indépendantes de l’historique sont documentées ; destination et conservation sont maîtrisées. |
| **25 novembre** | Installation/activation des moteurs facultatifs depuis l’application, avec progression, erreur et reprise, sans Terminal pour l’utilisateur final. Réutiliser les installateurs existants après qualification ; vérifier les dépendances réellement absentes sur un environnement vierge. Écriture/export fonctionnent sans ces modules. |
| **1er décembre** | Inclure boîte de réception et données personnelles nécessaires dans le parcours de sauvegarde des données globales. Tester restauration de capture et état interfenêtres. |
| **7 décembre** | Refaire l’installation sur environnement vierge avec la prédiction et les modules annoncés ; téléchargement interrompu, manque d’espace et moteur indisponible donnent un état compréhensible et récupérable. |
| **17 décembre** | Documentation d’utilisation, notices, inventaire des ressources, guides de récupération, compatibilité des projets et matrice des fonctions installées à jour. |
| **23 décembre** | RC construite proprement, signée et notariée ; vérifier les moteurs embarqués, le paquet téléchargé et ses empreintes. |
| **30 décembre** | Paquet 1.0.0, sources correspondantes, notes de version, guide d’installation, limitations mesurées et procédure de signalement prêts ensemble. |

La [procédure Tauri de signature macOS](https://v2.tauri.app/distribute/sign/macos/) distingue signature ad hoc, Developer ID et notarisation. Le paquet de développement actuel ne prouve pas la distribution finale. Suivre aussi les exigences du [guide de release du dépôt](https://github.com/absalonCRC/ariane/blob/main/docs/releasing.md), notamment les notices et sources redistribuables. La publication sur un canal public est une action distincte de la préparation demandée ici.

Les sauvegardes couvrent les données réellement possédées par Ariane. Une connexion à un vault externe ne vaut pas sauvegarde de ce vault ; il reste en lecture seule. Vérifier le refus d’un projet ouvert simultanément de manière incompatible, le manque d’espace disque, une fermeture immédiate après frappe et la reprise des miroirs Markdown en retard.

## 8. Règles transversales et choix proposés

Les décisions de l’entretien sont conservées dans la section 2. Les points ci-dessous sont des **choix de conception proposés pour rendre le plan exécutable**, à éprouver dans les recettes ; ils ne sont pas présentés comme de nouvelles réponses de l’utilisateur.

| Sujet | Convention proposée pour la 1.0.0 |
| --- | --- |
| Portée des tags | Définitions et affectations propres au projet. Les sources externes gardent leurs tags d’origine. Pas de synchronisation interprojets implicite. |
| Type d’un smart-tag | Catégorie descriptive configurable, distincte du type d’une entité. Depuis la demande du 5 novembre, chaque tag peut aussi définir des propriétés typées héritables. |
| Héritage | Union dynamique des tags directs et des ancêtres, sans copier toutes les affectations dans chaque enfant. Pas d’exceptions négatives d’héritage dans cette première version. Retirer un tag direct ne masque pas un même tag encore hérité. |
| Métadonnées inline | Les smart-tags sont visibles au bon endroit dans l’éditeur, conservés dans les données du projet et exclus par défaut du texte littéraire exporté. Ils restent restaurables avec le projet et ses versions. |
| Scission/réunion | Les IDs des passages non modifiés sont conservés autant que possible. Les tags directs d’un bloc scindé suivent les fragments ; les fusions dédupliquent les tags. Les liens ambigus sont signalés, pas devinés. |
| Suppression/fusion | Prévisualiser les conséquences ; permettre annulation/restauration. Supprimer un tag ne supprime pas les passages qui le portaient. Fusionner une entité ne réécrit pas automatiquement les phrases du manuscrit. |
| Focus et recherche | Une action de recherche peut afficher temporairement ses résultats ou sa vue filtrée. À sa fermeture, revenir au focus sans réafficher les marges. La recherche ne réactive pas les suggestions documentaires cachées. |
| Focus et documents | Ouvrir volontairement un PDF/image suspend la présentation focus pour afficher la vue partagée ; fermer le document rétablit le focus. Le choix est mémorisé pour la reprise. |
| Focus et correction | Conserver les soulignements orthographiques discrets et le mot prédit. Les panneaux de révision développés restent accessibles sur demande, sans surgir pendant la frappe. |
| Vues enregistrées | Requêtes enregistrées à l’échelle du projet, incluant leurs références stables. Les passages restent dans leurs fichiers d’origine ; aucune copie de manuscrit n’est produite. |
| Raccourcis | `/` reste le préfixe de commandes. Personnalisation accessible depuis la recherche ; liste et remise à zéro dans les paramètres. Pas de deuxième palette indépendante. |
| Apprentissage | Profil local commun + contributions identifiables par projet. Les suggestions non acceptées ne constituent jamais des textes d’apprentissage. La remise à zéro de l’apprentissage n’efface aucun manuscrit. |
| Relations | Relations explicites et éventuellement sourcées dans les fiches. Une relation proposée n’est pas une affirmation confirmée. Pas de fusion des homonymes sans intervention. |
| Reprise | Restaurer l’espace de travail et les brouillons. Ne pas restaurer une opération en cours telle qu’un enregistrement audio, une exportation destructive ou une commande. |
| Floutage | Masquage visuel réversible ; option d’export réellement expurgé des plages choisies. Le fichier de projet conserve l’original et n’est pas un document anonymisé à partager. |

## 9. Carte d’implémentation et contrats

Les chemins ci-dessous sont des points d’entrée **existants vérifiés**. Les responsabilités nouvelles sont proposées ; leur emplacement exact sera fixé lors du plan d’implémentation de chaque lot. Ne pas créer des abstractions partagées si un module spécialisé suffit.

| Responsabilité | Points d’entrée existants | Extension attendue |
| --- | --- | --- |
| États et composition | `src/app/App.tsx`, `src/app/useWorkspace.ts`, `src/app/types.ts` | État focus, projection de recherche, lecteur partagé, reprise ; conserver la logique métier hors d’App. |
| Identités de blocs | `src/editor/outline/model.ts`, `state.ts`, `view.ts` ; `src-tauri/src/project/outline.rs` | Métadonnées par ID, remappage, sélection Shift et gestes compatibles. |
| Données durables | `src-tauri/src/project/storage.rs`, `io.rs`, `guard.rs`, `src-tauri/src/history/mod.rs` | Migrations incrémentales, snapshots incluant les nouvelles métadonnées, sauvegarde cohérente et restauration. |
| Résultats documentaires | `src/enrichment/useMemory.ts`, `useInlineEntities.ts`, `useEnrichment.ts` ; `src-tauri/src/memory/queue.rs`, `storage.rs`, `inline.rs` | Résultats persistants, invalidation par dépendance, réponses versionnées et rendu stable. |
| Smart-tags | Types de projet, outline, stockage et recherche existants | Module métier dédié aux définitions, affectations, héritage et opérations d’administration. |
| Entités et relations | `src/enrichment/MemoryReader.tsx`, `src/enrichment/entityTypes.ts`, `src/sources/SourceOccurrences.tsx`, `src-tauri/src/memory/entities.rs`, `src-tauri/src/vaults/owned.rs` | Identités confirmées, alias, fusion réversible et relations explicites ; accès externes inchangés. |
| Requêtes et commandes | `src/app/Palette.tsx`, `useUnifiedSearch.ts`, `projectSearch.ts`, `manuscriptSearch.worker.ts`, `src-tauri/src/platform.rs` | Parseur de requêtes, stockage des vues, projection en consultation et registre d’actions/raccourcis. |
| Capture | `src-tauri/src/lib.rs`, `platform.rs`, `src-tauri/capabilities/default.json`, `src/editor/Editor.tsx` | Fenêtre compacte et service de boîte de réception globale, avec frontière de stockage distincte du projet actif. |
| Prédiction | `src/editor/Editor.tsx`, `src-tauri/src/voice/lexicon.rs` | Moteur local spécialisé, contributions communes/par projet, décoration de texte fantôme et commande d’acceptation. |
| Documents et annotations | `src/sources/Reader.tsx`, `src-tauri/src/source_files.rs`, `src/project/annotations.ts`, `src-tauri/src/project/annotations.rs` | Lecteur pilotable, ancres de source et lien vers une annotation du manuscrit. |
| Floutage/export | `src/editor/contextMenu.ts`, `src/editor/Editor.tsx`, `src/export/Export.tsx`, `src/export/useExport.ts`, `src-tauri/src/export/mod.rs` | Plages persistantes et transformation avant conversion, contrôles des sorties. |
| Confort | `src/editor/typewriter.ts`, `typewriterSound.ts`, `src/components/WritingCounter.tsx`, `src/app/Settings.tsx`, `Preferences.tsx` | Sensation de frappe, objectifs, réglages communs et cohérence visuelle. |
| Distribution | `scripts/setup-*.py`, `scripts/install_runtime.py`, `scripts/package-local.py`, `.github/workflows/verify.yml`, `src-tauri/tauri.conf.json` | Parcours d’installation intégré, ressources vérifiées, paquet signé/notarié et recette vierge. |

**Contrats à arrêter dès 0.3/0.4.**

- Une référence de passage comporte projet, section, nœud stable et, si nécessaire, plage/contextes de texte. Distinguer explicitement les offsets UTF-16 de l’éditeur des offsets Rust ; une convention convertie aux frontières évite les erreurs sur accents et emoji.
- Un résultat documentaire conserve identité d’ancre, empreinte du texte/contexte nécessaire, références de sources avec empreintes, version de politique/modèle et état de validité. Déplacer les offsets n’équivaut pas à recalculer le contenu.
- Un tag possède un ID, un nom, une catégorie et une couleur ; son affectation cible une section ou un nœud. L’héritage est dérivé et versionné dans son cache, pas confondu avec l’affectation explicite.
- Une entité possède une identité distincte de ses mentions ; une relation pointe vers des identités et conserve son statut/provenance. Le nom affiché ne sert jamais de clé unique.
- Une vue enregistrée conserve l’expression structurée résolue en IDs et son libellé. Une erreur de requête n’est pas un résultat vide silencieux.
- Une ancre de PDF/image conserve identité/empreinte du fichier et position normalisée ; un texte sélectionné conserve aussi contexte et citation. Une ancre introuvable reste visible comme telle.
- Une capture est autonome et possède un identifiant durable ; son transfert conserve un journal d’opération pour reprendre sans perte ni duplication.

Ces contrats évitent les réimplémentations entre persistance, tags, annotations, floutage et reprise. Ils ne justifient pas une refonte générale de l’éditeur.

## 10. Risques et décisions anticipées

| Risque | Vérification anticipée | Conséquence si non résolu |
| --- | --- | --- |
| Le contexte d’une suggestion dépend de davantage que la ligne modifiée | Prototype d’invalidation avec contexte parent/voisin et sources avant le 10 novembre. | 0.3.0 non validée tant que les dépendances sont fausses ou que les autres résultats disparaissent. |
| Métadonnées perdues lors d’une opération de structure | Projet témoin avec tags, notes et identités ; déplacer/scinder/réunir/restaurer avant le 17 novembre. | Bloque tags, recherche et liens précis. Corriger le modèle avant d’empiler les interfaces. |
| Lot 0.5 trop dense | Identités et relations démontrées vers le 20 novembre ; requêtes vérifiées sur fixtures pendant leur intégration. | Réestimer immédiatement le calendrier, sans déplacer silencieusement les fonctions après la 1.0.0. |
| Prédiction peu utile ou polluée par d’autres projets | Prototype mesuré sur corpus séparé avant le 12 novembre ; session d’usage réelle avant fin novembre. | Choisir une méthode locale mieux adaptée pendant novembre. Une proposition arbitraire n’est pas un résultat acceptable. |
| PDF difficile à piloter/ancres fragiles | Prototype sélection, zoom, retour et fichier remplacé avant le 12 novembre. | Choisir le rendu avant le lot de décembre ; ne pas compter sur une iframe non contrôlable. |
| Fenêtre compacte incohérente avec Spaces/plein écran | Prototype natif avant le 12 novembre, puis test multiécran. | Adapter l’intégration native ; expliciter les limites réellement observées. |
| Installation des modules dépendante du poste de développement | Recette vierge durant novembre, avec moteurs absents puis installés. | Revoir l’empaquetage/parcours d’installation, pas simplement documenter une commande développeur pour la 1.0.0. |
| Compte de signature ou notarisation indisponible | Vérification administrative au 7 novembre, premier paquet au 12. | Le blocage est indépendant de la qualité du code et peut rendre la date impossible. |
| Faible disponibilité de test fin décembre | Réserver les essais externes en novembre et concentrer la recette principale entre le 18 et le 23 décembre. | Ne pas compter sur les 24–27 décembre comme capacité garantie. |

Les prototypes ci-dessus sont de petits parcours jetables ou réutilisables sur données synthétiques. Ils vérifient les inconnues ; ils ne remplacent pas les livrables et leurs recettes. Leur capacité est prélevée sur le travail presque quotidien annoncé.

## 11. Qualification de chaque livraison

Chaque lot livre comportement, stockage, migration éventuelle, interface, accessibilité, traductions et recette concernée ensemble. Les tests doivent porter sur les effets observables et la conservation des données, pas reproduire les lignes de l’implémentation.

**À chaque jalon fonctionnel :** tests ciblés des comportements modifiés, contrôle natif des parcours concernés, puis checks requis du projet avant de déclarer la version validée. La commande actuelle `npm run verify` couvre ressources, tests de packaging, build, tests TypeScript, tests Rust et Clippy. Les essais Python des moteurs non inclus dans cette commande doivent être lancés séparément lorsque leur comportement change ; les validations natives ne sont pas remplacées par les adaptateurs de prévisualisation.

**Mesures proposées, non encore obtenues :** enregistrer p50/p95 de latence de frappe, recherche, ouverture compacte et proposition inline, ainsi que mémoire et activité des moteurs. Employer le même matériel et les mêmes corpus avant/après. Le projet synthétique de 2 000 scènes et 2 500 sources décrit dans le [rapport de validation existant](https://github.com/absalonCRC/ariane/blob/main/docs/validation-ia-2026-11-04.md) peut servir de point de départ, complété de cas avec tags/relations/ancres. Les budgets de latence et de qualité sont fixés à l’issue des prototypes de novembre et figés avant la campagne finale ; aucune amélioration chiffrée n’est affirmée par cette roadmap.

**Parcours romancier :** créer une scène, saisir/dicter en focus, accepter un mot, taguer des passages, suivre un personnage et ses relations, comparer une version, sélectionner des branches, exporter un manuscrit.

**Parcours auteur documenté :** ouvrir une source PDF/image, annoter un fragment précis, écrire à côté, rechercher un sujet et un tag, retrouver le contexte, modifier une source puis constater l’actualisation ciblée, exporter avec citations et passages masqués.

**Parcours quotidien transversal :** capture depuis une autre application, rangement dans un projet, objectif de séance, fermeture immédiate, reprise, moteur absent/en erreur et récupération après arrêt forcé.

### Conditions d’entrée en bêta — 18 décembre

- [ ] Toutes les fonctions F01–F16 de la matrice ci-dessous sont réellement utilisables et ont leur recette ciblée.
- [ ] Les migrations depuis les projets 0.2.2 et les jalons intermédiaires sont testées sur copies ; les versions, métadonnées, captures et liens se restaurent.
- [ ] L’installation et les modules ont déjà été exercés sur environnement vierge.
- [ ] Aucun blocage connu de sauvegarde ou perte de données. Les limites non bloquantes sont listées.
- [ ] Gel des ajouts : le travail porte désormais sur les défauts et la qualification.

### Conditions de sortie 1.0.0 — 30 décembre

- [ ] Toutes les recettes de versions et les trois parcours complets passent sur le candidat final.
- [ ] Aucun défaut connu bloquant l’ouverture, la frappe, la sauvegarde, la récupération, l’export ou une fonction obligatoire ; aucun défaut connu de perte/corruption de données ou d’exposition du texte dans les plages exportées masquées.
- [ ] Checks du projet réussis sur le commit exact du candidat ; toute correction ultérieure relance les contrôles affectés et la qualification du nouveau paquet.
- [ ] Installation du paquet réellement téléchargé sur un autre Mac Apple Silicon sous macOS 26+, ou au minimum un environnement vierge documenté. Un autre Mac physique reste la cible pour vérifier l’écart matériel.
- [ ] Les parcours des moteurs absents, installés, refusés, interrompus et relancés préservent le travail et donnent des états compréhensibles.
- [ ] Signature/notarisation, ressources embarquées, sources correspondantes, notices et empreintes vérifiées pour le paquet distribué.
- [ ] Séances prolongées d’écriture et de recherche, mémoire, latences et prédiction évaluées ; résultats et limites publiés sans généraliser au matériel non testé.
- [ ] Validation visuelle utilisateur : ultra minimalisme préservé, aucun nouveau tableau de bord permanent, commandes/recherches regroupées et objectifs discrets.
- [ ] Documentation, notes de version, installation, récupération et procédure de retour d’anomalies prêtes.

La RC n’est pas promue en stable tant qu’une case bloquante reste ouverte. Si une correction arrive le 28 décembre, ses effets et le paquet correspondant doivent être revérifiés avant le 30 ; la date seule ne constitue pas une preuve.

## 12. Matrice de couverture du périmètre

| ID | Demande | Livraison principale | Preuve de fin |
| --- | --- | --- | --- |
| F01 | Focus, outils de bas de page, disparition des menus/entités, arrière-plan actif | 0.3.0 ; prédiction intégrée en 0.7.0 | Parcours entrée/écriture/recherche/dictée/sortie avec continuité des résultats. |
| F02 | Compact global depuis le bas de l’écran, au-dessus des fenêtres, machine à écrire | 0.6.0 | Captures depuis une autre application, sans projet ouvert, puis rangement et reprise. |
| F03 | Prochain mot inline et apprentissage personnel adapté au projet | 0.7.0 | Mesures séparées apprentissage/évaluation et validation en usage. |
| F04 | Paramètres plus complets, cohérents avec la direction artistique | Chaque lot ; consolidation 0.9.0 | Tous les réglages fonctionnels et persistants, recette visuelle et clavier. |
| F05 | PDF/image partagé avec manuscrit, annotations précises | 0.8.0 | Retour à l’extrait/zone après fermeture, zoom et réouverture. |
| F06 | Machine à écrire sensorielle et minimaliste | 0.6.0 | Sons/mouvements validés avec édition libre et animations réduites. |
| F07 | Smart-tags multiples, typés, inline et hérités à deux niveaux | 0.4.0 | Héritage, déplacement, renommage et restauration corrects. |
| F08 | Gestionnaire d’entités avec alias, doublons et relations | 0.5.0 | Édition locale, distinction des homonymes, fusion réversible et relations retrouvables. |
| F09 | Gestionnaire de smart-tags limité à l’administration | 0.4.0 | Créer/renommer/typer/colorer/fusionner/supprimer sans altérer le texte. |
| F10 | Floutage contextuel réversible et export masqué optionnel | 0.8.0 | Plages persistantes et contrôle des quatre formats exportés. |
| F11 | Détections/suggestions persistantes, recalcul local et sources actualisées | 0.3.0 | Modification d’un bloc ou d’une source sans effacement/recalcul inutile des autres. |
| F12 | Shift + clic sur plusieurs points de l’outline | 0.4.0 | Sélection/copie du contenu complet des lignes et branches attendues. |
| F13 | Recherche `#`, `@`, ET/OU, vues enregistrées dans l’éditeur en consultation | 0.5.0 | Résultats exacts, navigation à l’original et requêtes retrouvées. |
| F14 | Commandes et raccourcis personnalisables dans la recherche existante | 0.5.0 ; global compact en 0.6.0 | Affectation, conflits, exécution et persistance après redémarrage. |
| F15 | Reprise complète de session | Fondations par lot ; 0.9.0 | Restauration croisée du manuscrit, lecteur, vue filtrée, modes et capture. |
| F16 | Objectifs de mots discrets dans le compteur, configurables | 0.9.0 | Comptage cohérent, annulation, dictée, reprise et absence de double comptage. |

Le socle de données, d’installation et de distribution de la section 7 s’ajoute à cette matrice comme condition de stabilité. Aucune demande initiale ni ajout retenu n’est placé après 1.0.0.

## 13. Ce qui ne fait pas partie de ce périmètre

Windows, Linux, Intel et anciens macOS ; synchronisation distante et collaboration ; champs structurés et règles automatiques de smart-tags ; édition directe des vues filtrées ; modèles de projet ; génération de paragraphes ; contraintes empêchant de corriger en mode machine à écrire ; OCR complet ; graphe relationnel permanent ; modification des vaults externes. Ces éléments n’ont pas été retenus pour cette 1.0.0. Ils ne remplacent aucun engagement des sections précédentes.

## 14. Suivi et démarrage

Pour chaque version, suivre : date cible, avancement des cases, défauts bloquants, preuves de recette, risques ouverts et prévision révisée. Les cases ne sont cochées qu’avec une preuve observable. Une revue courte à la fin de chaque lot compare le résultat au texte de cette roadmap, sans ajouter automatiquement de nouveaux objectifs.

**Premier lot concret : 0.3.0.** Reproduire sur un projet de test l’effacement actuel des suggestions ; instrumenter les blocs modifiés et les requêtes ; stabiliser leurs identités et résultats ; livrer le focus avec ses contrôles de bas de page et sa continuité d’analyse. En parallèle de ce travail au sens du calendrier, préparer les vérifications de distribution et les prototypes PDF, compact et prédiction. Le lot 0.3.0 est désormais implémenté ; les autres lots et prototypes restent des travaux planifiés.

**Vérification de ce document.** Les 20 réponses et les 16 exigences figurent dans les matrices ; chaque exigence dispose d’un jalon et d’une preuve de fin. La cohérence des versions, dates et dépendances a été relue, les liens vers les sources contrôlés et la structure Markdown vérifiée. La rédaction initiale était documentaire ; la vérification de l’implémentation 0.3.0 est consignée ci-dessus. Cette version publiée de la roadmap accompagne les changements applicatifs de la 0.3.0 dans `main`.
