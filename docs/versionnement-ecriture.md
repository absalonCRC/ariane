# Versions et variantes d’écriture

Implémentation de développement du 5 novembre 2026. Les changements restent locaux ; aucun paquet public ni synchronisation GitHub n’est créé.

## Utilisation

Le sélecteur en haut de l’éditeur indique le texte principal ou la variante active. Il ouvre l’espace des versions, composé de trois vues.

- **Modifications** compare le brouillon courant à la dernière version nommée du projet, ou à l’origine de la variante. Les autres captures restent sélectionnables. La lecture Markdown garde les ajouts et retraits visibles ; la vue Source et la reprise d’un passage restent disponibles.
- **Historique** présente les versions nommées et les séances automatiques dépliables. « Nommer cette version » conserve le contenu et la date de la capture et la protège de la rétention. Le nom d’une version ne détermine jamais si elle est automatique.
- **Variantes** crée une piste indépendante depuis le brouillon courant ou une version complète de l’historique. « Créer et écrire » et « Ouvrir » ramènent à l’éditeur. Le changement de variante conserve le brouillon sortant sans exiger de version nommée.

## Sauvegardes automatiques

L’enregistrement courant reste différé de 650 ms. Les points automatiques restent déclenchés après 90 secondes de pause, lors des transitions et, côté natif, au cours des longues séances et avant une suppression importante. La consultation de l’historique demande seulement l’enregistrement du texte ; elle ne force pas une capture de récupération.

La déduplication et le délai natif de cinq minutes sont propres à chaque variante et périmètre. Une séance regroupe les captures séparées de moins de trente minutes. La rétention native garde au maximum 40 captures automatiques par périmètre et variante, avec un budget global de 128 MiB ; elle favorise les états récents et espace les anciens. Les versions nommées, les origines de variantes et les points d’intégration ne sont pas éligibles à cette purge. Un échec de capture après enregistrement du texte dispose d’un état distinct et d’une action de réessai.

L’historique ouvert s’actualise lorsqu’une nouvelle capture automatique est créée, sans changer la version de référence choisie.

## Relecture et intégration

L’intégration cible le texte principal. Elle compare l’origine commune, le brouillon principal et celui de la variante, y compris leurs changements non nommés. Des modifications indépendantes sont combinées ; les changements ambigus sont soumis à un choix explicite.

La relecture permet d’exclure une scène ou un passage, de garder le principal, de reprendre la variante ou de réécrire un texte en divergence. L’aperçu tient compte des passages sélectionnés. Un choix portant sur le texte ou son plan conserve les autres modifications indépendantes de la scène ; si le plan conservé ne correspond pas au texte choisi, l’intégration est bloquée sans modifier les brouillons. Les divergences de structure ou de références demandent un choix de côté. L’algorithme de texte est volontairement conservateur : des réécritures dispersées dans la même scène peuvent demander une résolution manuelle même si une fusion plus complexe serait possible. Il ne déduit pas l’intention littéraire.

Avant l’application, une empreinte vérifie que la relecture est encore valable. Les références, l’arborescence, les identifiants et les plans sont vérifiés avant la transaction. Une modification externe de la copie Markdown bloque l’opération. L’intégration conserve « Avant intégration » dans l’historique principal : restaurer ce point annule l’intégration, en conservant à nouveau l’état courant. La variante source reste disponible. Les changements exclus restent proposés lors d’une relecture ultérieure ; une intégration partielle peut alors demander une résolution manuelle.

## Données et compatibilité

Le schéma SQLite passe de 1 à 2 avec copie cohérente préalable dans `recuperation/avant-versions-*.sqlite`. La migration conserve les anciennes captures et ne leur invente pas de parents. Les nouvelles versions possèdent une variante, un parent et, pour une intégration, un second parent. Les brouillons de variantes et l’état actif sont enregistrés dans SQLite. Le remplacement de l’espace de travail utilise la transaction et le protocole existant de copies Markdown récupérables ; les révisions augmentent pour invalider les anciennes réponses asynchrones.

Les états couvrent le texte, la hiérarchie, la corbeille, les rôles, le synopsis, le statut, les objectifs, le plan, les réglages, les citations, les liens, les épingles et désormais les annotations. Les versions anciennes dépourvues d’annotations conservent les annotations présentes lors de leur restauration. Le contenu des fichiers du vault et son index restent extérieurs au versionnement et ne sont jamais restaurés ou réécrits par ces opérations.

L’aperçu navigateur utilise des données locales et un budget automatique de 2 MiB adapté à localStorage. Il sert aux vérifications d’interface ; les tests Rust vérifient les transactions et le système de fichiers natifs.

## Vérification

Commande du projet : `npm run verify` (ressources, packaging Python, build, tests TypeScript, tests Rust, Clippy). Les nouveaux scénarios couvrent la migration, la promotion, les brouillons, les variantes imbriquées, les modifications de deux côtés, la relecture périmée, les divergences et suppressions, les choix partiels, les références/annotations, les échecs transactionnels et les modifications externes. La vérification visuelle utilise un projet fictif distinct des projets existants.

Les essais manuels ont aussi été rejoués dans une application macOS construite pour les tests, avec son propre dossier de données et un projet fictif. Ils couvrent une capture automatique après une pause réelle de 90 secondes et son apparition dans l’historique ouvert, la création et la réouverture de variantes, la restauration de leur origine, l’intégration avec choix des passages et résolution d’une divergence, puis la restauration de l’état avant intégration. Les brouillons et les points de récupération ont été vérifiés dans le projet de test. Ces essais ciblés ne constituent pas une qualification d’endurance prolongée.

Dernière exécution de `npm run verify` : 349 tests TypeScript, 171 tests Rust et 27 tests Python réussis, ainsi que le build, la vérification des ressources et Clippy. La suite existante conserve 2 tests TypeScript et 12 tests Rust ignorés.
