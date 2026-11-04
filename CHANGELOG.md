# Journal des changements

## 0.3.0 — 2026-11-04, version de développement

- Mode focus immersif : éditeur seul, compteur de mots, recherche et dictée en bas ; accès par `⌘ ⇧ F`, commande de recherche et réglages d’écriture. Les panneaux et couleurs d’entités sont masqués sans désactiver les moteurs.
- Suggestions documentaires conservées par bloc logique ; modifier une ligne ne vide plus les autres résultats. Les marques des blocs inchangés suivent leurs nouveaux offsets, y compris après des éditions Unicode.
- Cache de résultats dans SQLite pour la mémoire, les entités inline et les notes liées. Les changements de sources et d’alias invalident leurs dépendances ; les vues actualisent leurs résultats après indexation.
- Migration du cache mémoire vers le schéma 4, avec copie SQLite cohérente avant migration d’un projet existant. Les identités de l’outline et l’historique du projet sont conservés.
- Indication des liens en cours d’actualisation, protection contre les réponses asynchrones périmées et maintien du travail pendant les calculs en arrière-plan.

Voir les [notes 0.3.0](docs/release-notes-0.3.0.md) pour les vérifications et limites.

## 0.2.2 — 2026-11-04, version de développement

- Le nom affiché, les menus et le paquet utilisent `ariane`, en minuscules, sans suffixe de test.
- Mémoire et recherche : encodages avec titres et budgets tokenisés, cache persistant par ligne logique de l’outline, lots avec reprise et vecteurs binaires validés.
- Classement : fusion RRF pour la recherche explicite, seuils des suggestions séparés, priorité aux titres et alias exacts.
- Entités : seuils par catégorie, types personnalisés, homonymes non fusionnés automatiquement et file durable de classement des notes.
- Dictée : lexique automatiquement actualisé, contexte de mise au propre, brut récupérable, traitement borné des fichiers longs et autorisation audio native de macOS.
- Révision : grammaire affichée avant le complément du modèle, contexte en lecture seule, propositions périmées refusées et négations multilingues protégées.
- Fiabilité : AudioWorklet émis comme fichier local, JNA corrigé pour Hunspell et tas Java borné adapté au dictionnaire allemand.
- Validation : corpus synthétiques figés, essais de langues et de pannes, grand projet natif, endurance et capture du microphone iMac. Le streaming Parakeet reste exclu.

Voir les [notes 0.2.2](docs/release-notes-0.2.2.md) et le [bilan de validation](docs/validation-ia-2026-11-04.md), avec leurs limites de mesure.

## 0.2.1 — 2026-11-03, non publiée

- Sauvegarde : chemins internes vérifiés, fichiers temporaires exclusifs, verrou de projet, accusé SQLite distinct des erreurs de miroir et reprise persistante.
- Accès natif : permissions explicites, chemins accordés par dialogue, capacité réservée aux sauvegardes et sorties de moteurs bornées.
- Recherche : worker pour le manuscrit, cache de normalisation, indexation incrémentale et publication textuelle avant les calculs sémantiques.
- Sources : pagination Markdown et SQL, protocole binaire à jetons pour PDF/images, vecteurs binaires et recherche au-delà du budget de cache sans charger tous les vecteurs.
- Édition et dictée : réutilisation des tableaux inchangés, remappage réduit du plan, AudioWorklet et encodage déporté, réutilisation brève du moteur de mise au propre.
- Distribution : polices WOFF2, zip 9, YAML borné, installations Python vérifiées en staging et audits de dépendances en CI.

Voir [les détails et limites de validation](docs/release-notes-0.2.1.md).

## 0.2.0-alpha.1 — 2026-11-02, version de développement

- Interface disponible en français, anglais et espagnol, avec choix de langue mémorisé.
- Présentation GitHub en anglais, huit captures natives, film de 46 secondes et projet de démonstration fictif réutilisable.
- Traductions complétées pour les compteurs de comparaison et les libellés accessibles des sources et tableaux.
- Espace d’écriture remanié : bibliothèque repliable, accès aux outils, notifications dans le titre et infobulles communes.
- Réglages de largeur et d’interligne, aperçus des modes de concentration et de défilement.
- Tableaux Markdown modifiables, navigation dans les sources et distinction entre citations et mentions.
- Import de manuscrits Markdown, DOCX et TextBundle.
- Organisation des textes dans la bibliothèque, textes de travail hors manuscrit, comparaison et reprise de passages entre versions.

## 0.1.0-alpha.1 — version de développement

Première alpha prévue pour macOS 26+ sur Apple Silicon.

- Écriture Markdown, scènes et passages hiérarchiques, modes de concentration.
- Sauvegarde locale, historique, conflits externes et copies de récupération.
- Sources Obsidian en lecture seule, vault personnel, citations et exports Markdown/PDF/Word/EPUB.
- Recherche locale avec EmbeddingGemma ; entités, dictée et révision facultatives.
- Sources sous GPL-3.0-only, moteurs natifs verrouillés, procédure de construction et CI macOS.

### Limites connues

Paquet local signé ad hoc ; aucune notarisation ni validation sur un second Mac annoncée. Pas de Windows/Linux/Intel, de synchronisation ou d’OCR. Les modules facultatifs et tous les scénarios de panne ne sont pas intégralement couverts par la CI. Les modèles conservent leurs conditions propres.
