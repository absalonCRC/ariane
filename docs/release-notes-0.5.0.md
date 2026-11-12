# ariane 0.5.0

Version de développement du 12 novembre 2026 : retrouver, relier et commander depuis la recherche. Les versions npm, Cargo et Tauri sont alignées sur **0.5.0**.

## Entités et relations

La commande `/Gérer les entités` et le menu macOS Présentation ouvrent le gestionnaire. Il permet de rechercher et filtrer les identités par type et statut, consulter leurs occurrences, modifier leur nom, leurs alias et leur confirmation, rattacher une fiche existante et créer une fiche ariane. Les détections, identités confirmées et sources externes restent distinctes. Deux homonymes possèdent deux identifiants ; un nom identique ne suffit pas à les réunir.

Les fiches ariane sont modifiables avec contrôle de leur empreinte. L’éditeur charge le texte complet, indépendamment de l’aperçu abrégé de la liste. Modifier leur titre ne renomme pas leur fichier. Les vaults externes restent en lecture seule. L’écriture d’une fiche conserve une intention durable contenant les deux états jusqu’à la mise à jour réussie de l’index ; un conflit de récupération conserve ces états et demande une résolution.

Les relations sont dirigées et nommées, présentées dans les fiches dans les deux sens. Leur statut proposé/confirmé est indépendant de leur provenance documentaire facultative. Une proposition sourcée reste une proposition. La cooccurrence de deux noms n’ajoute aucune relation automatiquement. Les sources et passages cités sont accessibles depuis la relation.

Une fusion se prévisualise avant confirmation : identité et type conservés, alias, fiches, occurrences, relations et vues concernées. Elle réunit les références et laisse les fiches originales intactes. Son journal permet une annulation après réouverture ; les réessais de la même fusion sont idempotents. Plusieurs fusions peuvent s’annuler dans l’ordre inverse. Si une édition ultérieure empêche une inversion exacte, ariane refuse de l’écraser et conserve les données récentes.

## Recherche et vues enregistrées

La recherche existante accepte `#tag`, `@entité`, `+` pour ET et `,` pour OU. ET est évalué en premier. Les noms à espaces peuvent être saisis directement ou entre guillemets et sont proposés par autocomplétion. Les homonymes nécessitent un choix explicite ; une expression incomplète ou une référence introuvable produit un diagnostic.

Les résultats utilisent les tags directs et hérités, les mentions résolues et les originaux courants du projet. Une analyse de mentions absente ou périmée reste signalée. Une vue n’attribue pas silencieusement un homonyme et ne crée pas de copie du manuscrit. Elle conserve les présentations texte/tableau, les propriétés et un compteur des passages affichés. Le clic rejoint l’original ; l’éditeur masqué reste monté et en lecture seule.

Une requête peut être nommée, enregistrée, retrouvée depuis la même barre, renommée ou supprimée. Ses références sont des IDs, indépendants des libellés : les renommages et redirections de fusion conservent les liens. Les vues appartiennent au projet et sont recalculées à l’ouverture. Une référence disparue reste à réparer explicitement. Depuis le focus, une vue peut être consultée puis refermée sans réafficher les marges.

## Commandes et raccourcis

`/` reste le mode de commandes de la barre existante. `/Configurer les raccourcis` rejoint directement la page Raccourcis des paramètres. Le registre utilise des IDs stables et distingue actions de l’application et de l’éditeur. Les combinaisons peuvent être remplacées ou retirées, les collisions sont expliquées et la remise à zéro restaure les valeurs d’origine. Les préférences persistent après redémarrage.

Les accélérateurs des menus macOS suivent les réglages. Leur chemin d’exécution reste distinct de celui de la palette lorsqu’il possède des règles de sauvegarde différentes. Pendant l’enregistrement d’une combinaison, les accélérateurs natifs sont suspendus puis rétablis ; le clavier intercepte la recherche avant CodeMirror et dédoublonne l’événement de menu correspondant. Les commandes de structure respectent aussi la lecture seule. La capture globale du jalon 0.6.0 n’est pas activée par cette version.

## Données et compatibilité

Le schéma projet passe de **3 à 4**, avec copie SQLite cohérente dans `recuperation/` avant migration. Le schéma mémoire, également à 4, reste un mécanisme indépendant. Les anciens formats d’historique demeurent lisibles ; un schéma projet futur est refusé.

Les identités et relations appartiennent au projet et sont incluses dans les versions et brouillons de variantes. Une restauration ciblée conserve les identités encore utiles ailleurs. Les réunions de variantes exposent les divergences d’identités et de relations. Les vues restent des préférences de projet lors d’une restauration de texte ; les raccourcis sont des préférences de l’application. Restaurer une version du manuscrit ne restaure pas les fichiers des fiches et ne modifie jamais les sources externes. Le journal des fusions refuse une annulation incompatible avec le contexte courant.

## Vérifications

`RUST_TEST_THREADS=1 npm run verify` réussit sur les changements applicatifs livrés : **405 tests frontend réussis, 2 ignorés ; 188 tests Rust réussis, 12 ignorés ; 27 tests Python réussis**. Architecture (**92 noms IPC**), ressources, build de production et Clippy passent. Un témoin JSON commun contrôle les champs IPC des relations, leur statut et leur provenance ; il complète le contrôle des noms de commandes.

Les nouveaux tests couvrent grammaire et résultats exacts, renommages, ambiguïtés, mentions résolues avec texte courant, réponses périmées, persistance navigateur, variantes, migration, restauration, fusion/annulation/réessais, écriture protégée des fiches, récupération de leur index, contenu complet de l’éditeur et collisions des raccourcis. Les tests existants de création de scène et de smart-tags sont conservés.

La recette navigateur et la recette native sont consignées dans [le bilan de qualification](validation-0.5.0.md). Les avertissements Vite relatifs aux imports dynamiques et aux chunks de plus de 500 ko restent visibles ; aucun gain de performance n’est annoncé.

Les tests ignorés de modèles, les benchmarks, l’endurance, la dictée au microphone et l’installation sur un autre Mac sont des preuves distinctes. Le paquet local est signé ad hoc ; aucune notarisation ni release publique n’est annoncée.
