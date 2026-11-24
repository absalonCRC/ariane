# Construire ariane

## Plateforme et outils

- macOS 26 ou ultérieur, processeur Apple Silicon (arm64).
- CMake pour compiler l’aligneur de la lecture à voix haute.
- Xcode Command Line Tools : `xcode-select --install`.
- Node.js 24 ou ultérieur et npm ; `.nvmrc` sélectionne Node 24.
- Rust et Cargo 1.95.0 ; `rust-toolchain.toml` sélectionne cette version avec rustup.
- Python 3.11 ou ultérieur (le Python système plus ancien ne suffit pas).

Internet est nécessaire à l’installation. Prévoir plusieurs Go pour les caches, le modèle et la compilation. Homebrew n’est pas requis : ses archives publiques figées sont téléchargées directement et vérifiées par SHA-256.

## Depuis un clone ou une archive de sources vierge

```sh
npm ci
python3 scripts/setup-resources.py
npm run verify
npm run tauri build -- --bundles app
open src-tauri/target/release/bundle/macos/ariane.app
```

`setup-resources.py` télécharge les archives décrites dans `native-dependencies.lock.json`, vérifie leurs empreintes et copie uniquement les exécutables et bibliothèques nécessaires. Aucun script d’installation Homebrew n’est exécuté. Les dépendances Mach-O sont relocalisées dans le paquet, puis signées ad hoc. `pdf-text` est compilé depuis son source Swift. La préparation vérifie les poids EmbeddingGemma destinés à la recherche sémantique. C’est le seul modèle inclus dans le paquet.

Les entrées externes sont figées ; le résultat n’est pas garanti identique octet pour octet entre versions de Xcode/macOS. `engine/checksums.json` décrit le résultat local et l’empreinte du verrou natif. Il est généré, jamais utilisé pour choisir des téléchargements. Les caches sous `.cache/` et les ressources natives produites restent exclus de Git ; `engine/memory.py` est une source versionnée.

`npm run verify` contrôle les ressources, les scripts de paquetage, TypeScript/Vite, Vitest, les tests Rust et Clippy. Certains tests natifs exécutent les vrais moteurs et le modèle : préparer les ressources avant de lancer la suite. Les intégrations avec les modèles facultatifs sont ignorées par défaut. Les tests de vault et de longs passages utilisent des fixtures synthétiques, sans lire les données personnelles du compte macOS.

## Développement

```sh
npm run tauri dev
```

L’aperçu `npm run dev` ne donne pas accès aux fichiers natifs. Après une modification du moteur Python ou des ressources, relancer `python3 scripts/setup-resources.py` pour régénérer les empreintes avant vérification.

## Installations facultatives

Les commandes de premier usage et **Paramètres → Modèles locaux** installent les outils choisis dans `~/Library/Application Support/fr.ariane.writer/`. Les scripts du README sont également disponibles pour le développement.

- Mémoire : GLiNER multilingue, dépendances Python figées et poids quantifiés préparés localement. EmbeddingGemma est inclus pour la recherche sémantique.
- Dictée : Parakeet MLX et Spokenly Cleanup. La dépendance principale et les révisions des modèles sont figées ; les dépendances transitives Python de la dictée ne sont pas encore verrouillées intégralement.
- Révision : LanguageTool, JRE Temurin et SalamandraTA ; archives vérifiées par empreinte.

Les prérequis et téléchargements de ces fonctions sont distincts du paquet de base. Leur installation n’est pas un prérequis pour écrire ou exporter.

## Ressources de lecture

`npm run setup:resources` prépare aussi le binaire Pocket TTS pour macOS arm64 et compile l’aligneur avec CMake et le SDK macOS. Pour préparer uniquement cette partie, exécuter `python3 scripts/setup-reading.py`. Les révisions et les empreintes figurent dans `resources.lock.json` et `scripts/reading/assets.json`. Le sélecteur télécharge les poids de chaque langue choisie, ainsi que Whisper tiny partagé à la première voix. Chaque configuration YAML pointe vers les fichiers locaux vérifiés.

## Distribution

Les builds locaux sont signés ad hoc. Ne pas les présenter comme notarifiés. Voir [la procédure de release](releasing.md) avant toute diffusion d’un binaire, notamment pour les sources correspondantes des composants tiers.
