# ariane 0.3.2

Cette version de développement organise l’application en modules pour faciliter sa maintenance, avec les ajustements d’interface demandés autour de la reprise, des notifications et de la fenêtre.

- Contrats de données et transport IPC typés par domaine ; séparation des adaptateurs natif et navigateur.
- Composants et contrôleurs distincts pour l’écriture, la bibliothèque, les sources, les versions et la dictée ; cycle de vie CodeMirror préservé.
- Routage Rust, persistance et mémoire répartis par responsabilité, en conservant les verrous et la transaction SQLite avant les miroirs Markdown.
- CSS fractionné dans le même ordre de cascade ; règles de travail et vérification des dépendances documentées.

- Bouton « Reprendre le fil » dans l’en-tête et journal local des événements de notes, avec notifications brèves dans la capsule supérieure. Les notifications globales de sauvegarde, de liens et d’indexation passent également par cette capsule, sans bandeau en bas.
- Slider horizontal conservé sur grand écran ; panneau au-dessus du bouton sur écran étroit (1 100 px et moins), sans déplacement du bouton.
- Zone native de glissement dans la partie libre de la barre supérieure, y compris à l’accueil.

La [documentation d’architecture](architecture.md) et le [bilan de refactorisation](refactorisation-modulaire.md) détaillent les changements, les vérifications et leurs limites. Le benchmark natif lourd reste non concluant et l’annulation via le menu macOS n’a pas été validée ; ces deux limites ont été constatées sur la référence 0.3.1. Les tests de modèles ignorés, le microphone humain, l’IME réel et les autres machines nécessitent des recettes distinctes.

Les métadonnées npm, Cargo et Tauri ainsi que leurs fichiers de verrouillage indiquent **0.3.2**. Les modèles et seuils IA sont conservés. Le journal ajoute une table locale `note_activity` au projet ; les textes et les miroirs Markdown ne sont pas modifiés par sa création. Le bundle macOS local n’est pas notarié ; cette mise à jour ne crée ni tag ni release GitHub.
