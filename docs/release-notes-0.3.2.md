# ariane 0.3.2

Cette version de développement organise l’application en modules pour faciliter sa maintenance, en conservant les parcours d’écriture, l’interface et les formats existants.

- Contrats de données et transport IPC typés par domaine ; séparation des adaptateurs natif et navigateur.
- Composants et contrôleurs distincts pour l’écriture, la bibliothèque, les sources, les versions et la dictée ; cycle de vie CodeMirror préservé.
- Routage Rust, persistance et mémoire répartis par responsabilité, en conservant les verrous et la transaction SQLite avant les miroirs Markdown.
- CSS fractionné dans le même ordre de cascade ; règles de travail et vérification des dépendances documentées.

La [documentation d’architecture](architecture.md) et le [bilan de refactorisation](refactorisation-modulaire.md) détaillent les changements, les vérifications et leurs limites. Le benchmark natif lourd reste non concluant et l’annulation via le menu macOS n’a pas été validée ; ces deux limites ont été constatées sur la référence 0.3.1. Les tests de modèles ignorés, le microphone humain, l’IME réel et les autres machines nécessitent des recettes distinctes.

Les métadonnées npm, Cargo et Tauri ainsi que leurs fichiers de verrouillage indiquent **0.3.2**. Aucun changement de modèle, de seuil IA ou de format de projet n’est annoncé. Le bundle macOS local n’est pas notarié ; cette mise à jour ne crée ni tag ni release GitHub.
