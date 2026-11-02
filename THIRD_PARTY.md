# Composants tiers

La GPL-3.0-only d’Ariane couvre son code original. Elle ne remplace pas les licences des composants tiers ni les conditions des poids de modèles.

| Composant | Version / provenance | Licence ou conditions |
| --- | --- | --- |
| llama.cpp | 0.8.0, commit dans `native-dependencies.lock.json` | MIT |
| ggml | 0.28.0 | MIT |
| Pandoc | 3.13 | GPL-2.0-or-later |
| Typst | 0.15.1 | Apache-2.0 |
| libomp | 23.1.4 | Apache-2.0 avec exception LLVM |
| OpenSSL | 4.1.0 | Apache-2.0 |
| GMP | 6.3.0 | LGPL-3.0-or-later ou GPL-2.0-or-later |
| EmbeddingGemma 300M Q8 GGUF | Révision et SHA-256 dans `resources.lock.json` | Conditions Gemma, pas Apache-2.0 |
| EB Garamond | Version Fontsource dans `package-lock.json` | SIL Open Font License 1.1 |
| Figtree, Source Code Pro | Versions Fontsource dans `package-lock.json` | SIL Open Font License 1.1 |
| Styles APA et Chicago | Fichiers CSL et notices embarqués | CC BY-SA, voir les en-têtes |
| Sons de frappe de machine à écrire | Extraits adaptés de Joseph Sardin : [touche](https://bigsoundbank.com/typewriter-key-s2842.html), [espace](https://bigsoundbank.com/typewriter-space-s2843.html) et [frappe](https://bigsoundbank.com/typewriter-2-s2835.html) | CC0 1.0 |
| Son de retour du chariot | Extrait raccourci et accéléré de [ramsamba](https://freesound.org/people/ramsamba/sounds/318686/) | CC0 1.0 |

Les archives natives sont téléchargées depuis le registre public Homebrew, vérifiées et relocalisées sans modification des sources amont. `native-dependencies.lock.json` conserve versions, licences déclarées, empreintes, URL des archives et sources amont. La préparation copie les notices et formules présentes dans ces archives dans `src-tauri/resources/notices/native/` et les embarque dans l’application.

Les versions exactes des bibliothèques JavaScript et Rust sont dans `package-lock.json` et `src-tauri/Cargo.lock`. Leurs licences restent celles de leurs auteurs. Les notices présentes dans le dossier de ressources ne constituent pas encore un inventaire exhaustif des dépendances transitives npm/Cargo.

## Modèles facultatifs

Les installateurs de mémoire, dictée et révision téléchargent séparément GLiNER, Parakeet, Spokenly Cleanup, LanguageTool, Temurin et SalamandraTA. Les révisions et/ou empreintes sont dans leurs scripts. Ces éléments ne font pas partie du paquet de base. Consulter leurs licences et fiches de modèle avant redistribution de leurs fichiers ; l’installation locale ne transfère aucun droit supplémentaire.

## Avant de distribuer un binaire

La présence des notices et des URL ne suffit pas à clore les obligations de redistribution. Préparer les sources correspondantes complètes des composants GPL/LGPL effectivement distribués, leurs scripts de construction et les notices de toutes les bibliothèques incorporées. Associer ces éléments au binaire exact de la release. Le paquet de travail actuel n’est pas déclaré prêt pour une distribution publique.

La notice et les conditions EmbeddingGemma sont conservées dans les ressources. Les restrictions du modèle s’appliquent aux poids, indépendamment du code d’Ariane. Références : [conditions Gemma](https://ai.google.dev/gemma/terms), [FAQ GNU sur la distribution](https://www.gnu.org/licenses/gpl-faq.html).
