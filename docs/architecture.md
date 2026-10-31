# Organisation du code

Ariane est une application macOS Tauri 2, Rust, React/TypeScript et CodeMirror 6. La référence visuelle est `maquette-imagegen/04.png` ; l’interface utilise EB Garamond embarquée, une surface blanche et des commandes contextuelles.

## Frontend

- `src/app/App.tsx` compose l’espace d’écriture. Il ne gère ni le stockage des fichiers ni l’inférence.
- `src/app/useNativeClose.ts` partage le chemin de sauvegarde entre le bouton de fermeture et la demande native de quitter l’application.
- `src/app/useWorkspace.ts` coordonne la session, les commandes et les surfaces. `WorkspaceDialogs` et `WorkspaceNotices` rendent les dialogues et les états transversaux.
- `src/project/useProject.ts` possède le tampon des scènes modifiées, la file de sauvegarde et les révisions confirmées. Une sauvegarde en échec conserve son tampon. Le titre utilise un état local distinct pour préserver le focus de l’éditeur.
- `src/editor/` contient CodeMirror, le Markdown contextuel, la concentration, les titres de scène et le document composite. `sectionMapping` inclut les limites de scènes dans l’historique d’annulation. La saisie n’est pas contrôlée par React et ne transmet pas le manuscrit entier à chaque touche. Le comptage recalcule les scènes modifiées ; l’échantillon documentaire visible est limité à 8 000 caractères. Les identifiants techniques des notes de bas de page sont masqués hors édition de leur marqueur.
- `src/sources/` présente les annotations de marge, fiches, recherches, lecteurs et citations. La source complète s’ouvre en lecture seule. Une fiche associée au projet est une copie éditable indépendante.
- `src/history/` compare les variantes. Les différences sont détaillées à la sélection et la reprise sélective vérifie la révision courante.
- `src/export/` sépare le dialogue du travail d’export persistant. Fermer le dialogue ne perd ni sa progression ni son résultat ; la conversion et son annulation s’effectuent dans Rust.
- `src/revision/` contient les règles de style explicables ; l’orthographe est confiée à la WebView et aux langues disponibles sur macOS.
- `src/styles/` sépare les tokens, l’éditeur et les surfaces de l’application.

Le transport `request` a deux adaptateurs. Dans Tauri, toutes les opérations passent par Rust. Le navigateur fournit une persistance locale pour la conception et la vérification de l’interface ; il ne simule pas une recherche IA ni une connexion à des fichiers natifs.

## Backend

- `platform.rs` conserve les menus natifs et remplace « Quitter » par une demande de sauvegarde à l’éditeur. Le backend ne valide la sortie qu’après confirmation du frontend.
- `api.rs` définit les requêtes typées et les achemine vers les modules métier, hors du fil d’interface.
- `project/` gère les transactions SQLite, les révisions, les miroirs Markdown, les conflits et les copies de récupération.
- `vaults/` lit les dossiers connectés, YAML, tags, alias et PDF. SQLite FTS5 et les chunks sont dans une base d’index distincte des manuscrits.
- `retrieval/` distingue identification exacte, liens explicites, tags et proximité sémantique. Un prénom ambigu n’identifie pas automatiquement une personne. Les résultats sont filtrés par périmètre du projet. Pendant une occupation du modèle, la recherche interactive garde ses résultats textuels sans attendre la file d’indexation.
- `inference/` possède le processus llama.cpp, son authentification locale et son cycle de vie. Seule l’adresse de bouclage est utilisée. Le modèle installé est EmbeddingGemma 300M Q8, testé en 768 dimensions ; il ne rédige pas de contenu.
- `history/` conserve les versions de texte, structure, paramètres, références et fiches. Les listes ne chargent pas les corps de toutes les anciennes versions.
- `export/` assemble les sections, conserve les notes et traite les références avec des styles CSL locaux. Pandoc et Typst sont embarqués. L’annulation arrête le groupe de processus de conversion.

## Format de projet

Un dossier contient `ariane.sqlite`, `manuscrit/<identifiant>.md` et, si nécessaire, `recuperation/`. SQLite est le journal durable et la source transactionnelle du projet ; les Markdown sont des miroirs lisibles, réconciliés au démarrage. Une écriture validée en base mais interrompue avant la matérialisation est reprise. Un projet avec conflit externe s’ouvre avec les identifiants en conflit ; une ouverture échouée ne change pas le projet actif du backend. Les modifications externes des Markdown sont détectées ; la résolution conserve une copie de l’autre version, y compris le tampon local non encore sauvegardé. Les fichiers de récupération ne sont pas supprimés automatiquement.

Les sauvegardes portent des révisions et ne réécrivent que les scènes modifiées. L’historique automatique est limité en fréquence, pas en nombre de versions. Les snapshots sont locaux ; aucun compte GitHub ni dépôt distant n’est utilisé.

Les vaults sont enregistrés dans le projet en lecture seule. L’index partagé et la dernière session sont placés dans le dossier de données de l’application. Une réconciliation périodique vérifie les changements ; une indexation suspendue reste suspendue jusqu’à reprise explicite. Le modèle, les outils et les polices sont livrés localement.

## Ajouter une fonction

1. Définir les données dans `model.rs` et `src/app/types.ts` si elles traversent l’IPC.
2. Implémenter la règle dans son module métier Rust, avec un test portant sur le résultat ou la conservation des données.
3. Ajouter une variante à `Request`, puis son acheminement dans `api.rs`.
4. Placer l’interface dans le module de fonction concerné ; conserver `App` comme composition.
5. Vérifier les scénarios concernés, `npm run build`, `npm test`, `cargo test` et Clippy.

Les migrations de schéma et les changements de modèle devront être explicitement versionnés avant une distribution plus large. La génération actuelle est une première version locale, pas une certification de tous les objectifs du plan.

## Espace Writer

`src/writer/` contient la bibliothèque, le plan/statistiques, le traitement des métadonnées, l’expansion des blocs de scènes, les calculs de tableaux et l’aperçu. L’aperçu est chargé à la demande et ne fait pas exécuter de HTML fourni par les documents. Les images sont lues par un IPC limité au projet ; les références réseau ne sont pas téléchargées par l’aperçu.

`src/editor/writerCommands.ts` contient les commandes Markdown et substitutions de frappe. `authorship.ts` mappe les annotations sur les changements et retire l’attribution de provenance du texte inséré au milieu d’une référence. Les annotations sont conservées dans les réglages du projet, hors du Markdown exporté. Les écritures de réglages sont séquencées ; les changements de projets attendent la sauvegarde de l’état courant.

`linguistics.ts` analyse le texte visible après temporisation. Le programme Swift `scripts/syntax.swift`, embarqué dans `resources/engine/syntax`, utilise NaturalLanguage et renvoie des positions UTF-16. La révision de style combine répétitions, longueurs de phrases et listes explicites fr/en/de/es ; ces règles ne constituent pas une équivalence avec le dictionnaire d’iA Writer. Les suggestions documentaires automatiques s’activent avec l’affichage des sources.

`src-tauri/src/documents.rs` gère les imports, les pièces jointes et le moteur grammatical. Les images des archives DOCX/ODT/EPUB sont extraites dans un sous-dossier unique du projet. La lecture de pièces jointes refuse les chemins qui sortent du projet après résolution des liens symboliques.
