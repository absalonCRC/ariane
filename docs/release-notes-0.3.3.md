# ariane 0.3.3

Cette version de développement enrichit les versions pour explorer plusieurs directions d’écriture tout en conservant les sauvegardes automatiques et les brouillons de chaque variante. Elle reprend les améliorations d’interface et l’architecture modulaire de la [0.3.2](release-notes-0.3.2.md).

## Écrire et retrouver ses versions

- Les captures automatiques restent déclenchées pendant l’écriture, après une pause et lors des transitions ; elles sont dédupliquées, limitées et regroupées par séance. L’historique ouvert se met à jour lorsqu’une nouvelle capture est créée.
- Une capture automatique peut être nommée : son contenu et sa date sont conservés et elle ne fait plus partie de la rétention automatique.
- Une variante indépendante peut partir du brouillon courant ou d’une version complète. Elle conserve son texte en cours, ses propres captures et son origine lorsqu’on passe d’une piste à une autre. La capsule du titre affiche la variante active ; son menu d’arborescence permet de changer de piste et de gérer les variantes.

## Relire et intégrer

L’espace Versions propose une comparaison lisible, un historique et une liste de variantes. La relecture met en regard le texte principal et la variante, permet de sélectionner les passages à intégrer et demande un choix explicite en cas de divergence. Les changements indépendants restent conservés. Une comparaison devenue périmée doit être actualisée.

Une version du texte principal est conservée avant intégration ; une autre est créée avant restauration. Le brouillon source reste disponible. Les modifications exclues peuvent être relues ultérieurement. Le plan de passages et l’arborescence sont vérifiés avant toute application. En cas de conflit avec un fichier Markdown externe, l’application ne remplace pas ce fichier silencieusement.

## Données et limites

La migration vers le schéma SQLite 2 crée une copie cohérente de la base précédente dans `recuperation/`. Les anciennes captures sont conservées ; les fichiers des vaults externes ne sont ni versionnés ni restaurés. Le journal d’activité des notes reste indépendant de l’historique des textes. La rétention automatique native est limitée à 40 captures par périmètre et variante et à 128 Mio par projet ; les états nommés et les points de récupération sont conservés.

Les versions npm, Cargo et Tauri indiquent **0.3.3**. Cette PR prépare des sources de développement ; elle ne crée ni tag, ni release GitHub, ni application notariée. Le [guide des versions](versionnement-ecriture.md) précise le fonctionnement, la migration et les vérifications.
