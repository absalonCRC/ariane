# Ariane

Éditeur Markdown local pour macOS, conçu pour écrire des textes longs et retrouver ses sources sans quitter le manuscrit.

**0.1.0-alpha.1 — version expérimentale, macOS 26 ou ultérieur, Apple Silicon uniquement.** Les sources sont disponibles sur GitHub ; aucun paquet notarifié n’est encore proposé.

## Ce que permet cette alpha

- Écrire dans une colonne épurée, organiser scènes et passages hiérarchiques, utiliser les modes de concentration.
- Sauvegarder localement, retrouver des versions et conserver des copies en cas de conflit avec un fichier externe.
- Connecter des vaults Obsidian en lecture seule ou créer un vault propre au projet.
- Retrouver des sources dans la marge, insérer des citations et exporter en Markdown, PDF, Word ou EPUB.
- Retrouver des passages proches avec EmbeddingGemma. La détection d’entités, la dictée et la révision locales nécessitent des installations supplémentaires facultatives.

Les suggestions restent à relire. Aucun service cloud ni compte utilisateur n’est nécessaire pour écrire. L’installation des dépendances et des modèles nécessite Internet ; leur traitement s’effectue ensuite localement.

## Construire et lancer

Prérequis : Mac Apple Silicon sous macOS 26+, outils de ligne de commande Xcode, Node.js 24 ou ultérieur, Rust/Cargo 1.95.0 et Python 3.11 ou ultérieur. Prévoir plusieurs Go libres pour la compilation. Homebrew n’est pas nécessaire à la préparation des moteurs.

Dans le dossier des sources :

```sh
npm ci
python3 scripts/setup-resources.py
npm run verify
npm run tauri build -- --bundles app
open src-tauri/target/release/bundle/macos/Ariane.app
```

La préparation télécharge les moteurs natifs à versions et empreintes figées, ainsi qu’EmbeddingGemma 300M Q8 (environ 334 Mo). Ses [conditions Gemma](https://ai.google.dev/gemma/terms) s’appliquent au modèle. Le paquet construit localement porte une signature ad hoc, sans notarisation Apple.

Pour développer : `npm run tauri dev`. `npm run dev` ouvre seulement l’aperçu navigateur, avec des données simulées dans le stockage du navigateur : ce n’est pas une connexion aux fichiers du Mac.

Voir les [instructions de construction](docs/building.md), le [guide d’utilisation](docs/usage.md) et l’[architecture](docs/architecture.md).

## Modules facultatifs

Ces commandes s’exécutent depuis les sources, avec Python et [uv](https://docs.astral.sh/uv/getting-started/installation/) disponibles. Les modèles sont installés dans les données locales d’Ariane, séparément du manuscrit.

```sh
python3 scripts/setup-memory.py    # Entités du manuscrit : GLiNER
python3 scripts/setup-voice.py     # Dictée : Parakeet et Spokenly Cleanup
python3 scripts/setup-revision.py  # Révision : LanguageTool et SalamandraTA
```

L’écriture, la sauvegarde et les exports n’exigent pas ces modules. EmbeddingGemma, livré avec le paquet, fournit la recherche sémantique ; E5 n’est plus utilisé par l’installateur actif. Les modules facultatifs restent expérimentaux et ne sont pas tous exécutés par la suite de tests standard.

## Données et limites

Les projets contiennent une base SQLite et des miroirs Markdown. Sauvegarder **le dossier du projet entier**, application fermée, avant de tester une nouvelle alpha. L’historique intégré ne remplace pas une sauvegarde indépendante. Les vaults externes connectés sont lus sans modification ; les fiches créées par Ariane sont placées dans le vault propre au projet.

Cette alpha ne propose ni synchronisation distante, ni OCR, ni version Windows/Linux/Intel. Les arrêts forcés à chaque étape d’écriture, le manque d’espace disque et les rendus dans toutes les versions de Word ne sont pas intégralement qualifiés. Aucune promesse de pertinence ou de performance universelle n’est faite.

## Contribuer et licence

Voir [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) et le [journal des changements](CHANGELOG.md).

Copyright © 2026 Axel de Saint-Germain. Le code original d’Ariane est distribué sous **GNU GPL version 3 uniquement**, SPDX `GPL-3.0-only` ; voir [LICENSE](LICENSE) et [COPYRIGHT](COPYRIGHT). Les bibliothèques, polices, styles et modèles conservent leurs licences et conditions propres, détaillées dans [THIRD_PARTY.md](THIRD_PARTY.md).

Les exports PDF, Word et EPUB acceptent les images locales au projet. Les ressources distantes, liens symboliques sortant du projet et fragments HTML/TeX/Typst bruts sont refusés. L’export Markdown conserve le texte.
