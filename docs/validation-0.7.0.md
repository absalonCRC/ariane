# Recette d’ariane 0.7.0

**18 novembre 2026.** Branche `codex/0.7.0`, issue du commit `bce60a3`. Mac Apple M1 sous macOS 26.6. Bundle optimisé arm64 signé ad hoc, identifiant isolé `fr.ariane.writer.synthetic07020261118`. Les essais natifs utilisent des copies de projets synthétiques et le profil correspondant. Le bundle testé est conservé dans `artifacts/validation-0.7.0/bundle-synthetique/ariane.app`. L’empreinte SHA-256 de son exécutable est `ce878188505397da282a751d2c3f813855b35f32a953ae2482faf91c5094a217`.

## Prédiction

| Parcours | Résultat |
| --- | --- |
| Manuscrit et apprentissage | Depuis un projet vide, écrire deux passages avec « le vieux phare ». Dans un second projet, écrire « le vieux moulin ». Après relance et changement de projet, le contexte « Dans le vieux » affiche respectivement « moulin » et « phare » dans la ligne. |
| Entrée et annulation | Dans le manuscrit, Entrée insère le mot en italique grisé au curseur. Un second appui crée une nouvelle ligne. Dans la capture, « Pour la première » suggère « fois ». Entrée l’insère et **Édition → Annuler la dernière action** retire cette insertion seule. |
| Mode focus et capture | Entrée accepte « moulin » dans le focus immersif. Dans la compacte ouverte par **Fichier → Capture rapide**, Échap rejette « fois » en laissant la fenêtre ouverte. Une capture terminée reste visible après restauration d’une archive de la réception. |
| Plein écran et second écran | La commande Fichier ouvre la compacte depuis le Space plein écran de la principale. Après « Déplacer vers Artisr15.6Pro », l’écriture et l’acceptation de « de » par Entrée restent fonctionnelles. La position physique finale et le retour entre applications ont besoin d’un contrôle dédié. |
| Lisibilité et clavier | Suggestion observée dans la page sombre et dans la page claire. Les tests CodeMirror exercent la sélection, les réponses périmées, la composition simulée, le code, le remappage du raccourci et la concurrence avec la complétion des notes. |
| Conservation de l’apprentissage | Les tests Rust couvrent la correction et la suppression, la réouverture sans doublon, les projets exclus, le retour négatif, la remise à zéro et le vocabulaire commun. |

### Mesure sur corpus synthétique

Six textes d’apprentissage et six textes littéraires ou documentaires de contrôle, en français, anglais et espagnol. L’évaluation présente le contexte précédant chaque mot éligible à la même base seule puis à la base personnalisée. Le test impose un gain total d’au moins huit points sur ces positions et une hausse dans les trois langues. Six contextes spécifiques vérifient l’absence de reprise du terme propre à l’autre projet et au profil commun.

| Langue | Positions | Couverture base → appris | Premier mot exact base → appris |
| --- | ---: | ---: | ---: |
| Français | 81 | 43 → 64 | 7 → 43 |
| Anglais | 78 | 40 → 64 | 12 → 44 |
| Espagnol | 81 | 42 → 67 | 4 → 46 |
| **Total** | **240** | **125 → 195** | **23 → 133** |

Le taux de mots exacts sur les positions éligibles passe de **9,6 % à 55,4 %**. Les textes de contrôle partagent volontairement certains contextes avec les textes appris. Ce test mesure la capacité à retrouver un vocabulaire récurrent sur des phrases tenues à l’écart. L’efficacité sur de longs manuscrits personnels et le ressenti en séance d’auteur restent à mesurer.

Sur le même Mac, le test Rust chaud mesure **77 µs p50 et 227 µs p95** pour la requête dans le prédicteur, SQLite compris. Le processus de test atteint environ **22 Mio** de mémoire résidente maximale et la base de test occupe **220 Kio**. Cette mesure couvre le moteur sur le corpus de contrôle. Le délai d’attente de 145 ms, le transport IPC et le rendu WebKit relèvent du parcours interactif.

Reproduire avec `RUST_TEST_THREADS=1 cargo test --locked --manifest-path src-tauri/Cargo.toml --lib held_out_literary_and_documentary_prediction_quality -- --nocapture`.

## Données et prérequis

- **Migration.** Le témoin 0.2.2 reprend le schéma du commit `3a882dd`. Son original et la copie avant migration sont au schéma 1 et passent l’intégrité SQLite. L’ouverture native migre la copie au schéma 5 et affiche le texte, l’emoji, les accents et la référence. Un témoin de schéma 5 provenant des sources 0.6.1 s’ouvre aussi dans le bundle.
- **Sauvegarde.** Le dialogue macOS produit un dossier de sauvegarde. La restauration dans un autre dossier retrouve les 164 caractères d’origine. Le projet courant conserve sa version plus récente. Les trois bases passent `PRAGMA integrity_check`. Le test Rust couvre aussi historique, variantes, pièce jointe, vault possédé, vault externe en lecture seule, copie répétée, inventaire endommagé et conflit Markdown.
- **Manque d’espace.** La sauvegarde d’un projet contenant une pièce de 32 Mio échoue sur un volume témoin de 16 Mio. La capsule indique `No space left on device`. La base du projet passe l’intégrité, la pièce garde sa taille et aucune sauvegarde incomplète ne reste sur le volume. Les contrôles de verrou interprocessus et de reprise après commit SQLite avec miroir en échec passent dans la suite Rust.
- **Captures.** La restauration native de l’archive 0.6.0 annonce quatre captures restaurées. La capture créée dans la recette 0.7.0 reste visible. Captures et projet ont des sauvegardes distinctes.
- **Prototype PDF.** Sur un PDF texte de deux pages, le prototype PDFKit obtient les mêmes rectangles normalisés pour deux lignes aux zooms 1 et 1,75. Le scan raster n’a pas de couche texte. Une image 720 × 500 sert de témoin pour une zone normalisée. Le rendu dans la vue partagée WebKit et le choix du moteur intégré restent à éprouver en 0.8.0.
- **Modules.** Sur le profil isolé, le premier lancement de l’installateur a révélé un conflit entre une option uv et sa variable d’environnement. Après correction, progression, interruption, retour de l’action Installer et réessai sont observés dans l’application. Les paramètres confirment l’installation des trois modules. Deux tests Rust supplémentaires de dictée passent sur un WAV de synthèse avec les modèles installés, y compris la mise au propre et la réutilisation du worker. Le test supplémentaire de révision passe avec LanguageTool et le modèle local.
- **Distribution témoin.** La signature profonde et stricte du bundle passe et les 23 fichiers de moteurs et poids passent le contrôle d’empreintes. Le bundle démarre sous son identifiant de recette. Le trousseau de signature consulté ne présente aucun certificat Developer ID. Les journaux de construction signalent l’absence de configuration de notarisation. L’installation sur un second Mac reste ouverte.

## Vérifications automatisées et navigateur

`RUST_TEST_THREADS=1 VITEST_MAX_WORKERS=4 npm run verify` réussit sur les sources du bundle final. Un premier passage a expiré sur la transition vers Versions dans un test DOM sous charge. Le test ciblé et la relance complète passent avec ses assertions d’origine.

| Contrôle | Résultat |
| --- | --- |
| Architecture, ressources et paquetage Python | 116 noms IPC, 23 ressources et 27 tests Python vérifiés |
| Vite et TypeScript | Build réussi |
| Vitest | 430 réussis, 2 ignorés par défaut |
| Rust et Clippy | 206 réussis, 12 ignorés par défaut, Clippy réussi |
| Moteurs facultatifs | 3 tests ignorés par défaut rejoués avec succès, dont 2 de dictée et 1 de révision |
| Navigateur | Création d’un projet vierge, saisie et réouverture de l’aperçu vérifiées sur une origine locale distincte |

### Retouches d’interface après le bundle témoin

Les suggestions et fiches de la marge utilisent des coins squircle. Le tracé et les zones cliquables ont été vérifiés en clair et en sombre dans une WebView macOS avec les composants de la marge et des données synthétiques. L’aperçu navigateur vérifie le focus par Tabulation et l’ouverture par Entrée.

Dans un projet vierge créé dans l’aperçu, le titre reste visible à la frappe et après la sauvegarde. Le texte saisi est retrouvé à la réouverture. Le test de la capsule couvre également la requête en cours et le cas d’erreur. La compilation, les frontières et les 116 noms IPC passent, ainsi que les 430 tests TypeScript. Deux tests sont ignorés par défaut. Le paquet macOS décrit ci-dessus précède ces retouches.

Les autres tests ignorés portent sur les benchmarks et modules facultatifs. L’endurance en conditions d’écriture, le raccourci global sur clavier physique, un IME réel, le passage entre applications et Spaces et le microphone physique restent sans preuve de réussite pour 0.7.0. L’acceptation et le rejet constatés en recette restent des gestes d’essai sur texte synthétique.
