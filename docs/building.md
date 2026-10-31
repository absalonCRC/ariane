# Construire Ariane

## Plateforme et outils

- macOS 26 ou ultérieur, processeur Apple Silicon (arm64).
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
open src-tauri/target/release/bundle/macos/Ariane.app
```

`setup-resources.py` télécharge les archives décrites dans `native-dependencies.lock.json`, vérifie leurs empreintes et copie uniquement les exécutables et bibliothèques nécessaires. Aucun script d’installation Homebrew n’est exécuté. Les dépendances Mach-O sont relocalisées dans le paquet, puis signées ad hoc. `pdf-text` est compilé depuis son source Swift. Le modèle est téléchargé depuis la révision de `resources.lock.json` et vérifié avant installation.

Les entrées externes sont figées ; le résultat n’est pas garanti identique octet pour octet entre versions de Xcode/macOS. `engine/checksums.json` décrit le résultat local et l’empreinte du verrou natif. Il est généré, jamais utilisé pour choisir des téléchargements. Les caches sous `.cache/` et les ressources natives produites restent exclus de Git ; `engine/memory.py` est une source versionnée.

`npm run verify` contrôle les ressources, les scripts de paquetage, TypeScript/Vite, Vitest, les tests Rust et Clippy. Certains tests natifs exécutent les vrais moteurs et le modèle : préparer les ressources avant de lancer la suite. Les intégrations avec les modèles facultatifs sont ignorées par défaut. Les tests de vault et de longs passages utilisent des fixtures synthétiques, sans lire les données personnelles du compte macOS.

## Développement

```sh
npm run tauri dev
```

L’aperçu `npm run dev` ne donne pas accès aux fichiers natifs. Après une modification du moteur Python ou des ressources, relancer `python3 scripts/setup-resources.py` pour régénérer les empreintes avant vérification.

## Installations facultatives

Installer `uv`, puis lancer les commandes du README. Elles écrivent dans `~/Library/Application Support/fr.ariane.writer/`, pas dans le projet.

- Mémoire : GLiNER multilingue, dépendances Python figées et poids quantifiés préparés localement. La recherche sémantique utilise EmbeddingGemma embarqué.
- Dictée : Parakeet MLX et Spokenly Cleanup. La dépendance principale et les révisions des modèles sont figées ; les dépendances transitives Python de la dictée ne sont pas encore verrouillées intégralement.
- Révision : LanguageTool, JRE Temurin et SalamandraTA ; archives vérifiées par empreinte.

Les prérequis et téléchargements de ces fonctions sont distincts du paquet de base. Leur installation n’est pas un prérequis pour écrire ou exporter.

## Distribution

Les builds locaux sont signés ad hoc. Ne pas les présenter comme notarifiés. Voir [la procédure de release](releasing.md) avant toute diffusion d’un binaire, notamment pour les sources correspondantes des composants tiers.
