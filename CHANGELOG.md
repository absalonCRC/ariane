# Journal des changements

## 0.5.0 — 2026-11-12, version de développement

- Gestionnaire d’entités : identités durables, homonymes distincts, confirmations, alias, occurrences et édition protégée des fiches ariane.
- Relations nommées et éventuellement sourcées ; statut proposé/confirmé indépendant de la provenance.
- Fusion manuelle prévisualisée et réversible, réessais idempotents et conservation des fiches originales.
- Recherche combinée `#`/`@`, ET/OU, diagnostics, originaux en consultation et vues enregistrées par projet.
- Commandes à identifiants stables et raccourcis personnalisables, avec conflits, réinitialisation et menus macOS synchronisés.
- Migration projet vers le schéma 4 avec récupération préalable ; identités et relations incluses dans les versions et variantes.

Voir les [notes 0.5.0](docs/release-notes-0.5.0.md) et le [bilan de qualification](docs/validation-0.5.0.md).

## 0.4.0 — 2026-11-05, version de développement

- Smart-tags multiples et propres au projet : identité stable, nom, catégorie et couleur distincte à la création.
- Création/réutilisation automatique par `#nom`, libellés à la fin des passages et points d’outline colorés. Les enfants conservent l’héritage sans répéter les libellés du parent.
- Administration plein écran depuis la sidebar : recherche, catégories, usages, affectations, renommage, fusion et suppression avec version préalable.
- Clic sur un tag : consultation temporaire des passages directs et hérités ; clic sur un passage pour modifier l’original. Ce parcours est avancé depuis la 0.5.0 sur demande de l’utilisateur.
- Maj-clic sur les points : sélection et copie de lignes et branches complètes, même repliées.
- Migration SQLite 3 avec copie préalable ; tags conservés dans les variantes, la corbeille, les restaurations et les scissions/réunions, sans ajout dans les exports.

- Tags de titres hérités par toute la page ; petites puces près du titre, fond et croix de retrait au survol.
- Chevron de pliage distinct ; clic sur le point pour ouvrir le détail et les propriétés typées héritables dans la marge droite.
- Propriétés de texte, date, nombre, case et relation vers une note/ligne ; alimentation configurable depuis les mentions, priorité aux valeurs saisies.
- Vues globales des tags en texte ou tableau de propriétés, chrome et compteurs conservés, tableau adaptatif et profondeur désactivée.
- Capsule de titre/notifications adaptée aux vues ; branche visible seulement avec une variante et hors notification.
- Titre de la capsule conservé à l’ouverture des menus, dialogues et panneaux ; adaptation réservée aux changements de vue principale.

- Survol maintenu du thème : déploiement de la capsule des accès du projet sans ouvrir la sidebar, avec bouton stable et accès au clavier.
- Historique replié par défaut, accessible depuis le bord droit avec infobulle et ouverture/fermeture au clic ; retrait du bouton supérieur « Reprendre le fil ».

Voir les [notes 0.4.0](docs/release-notes-0.4.0.md).

## 0.3.3 — 2026-11-05, version de développement

- Les sauvegardes automatiques restent actives, regroupées par séance, limitées et dédupliquées ; elles actualisent l’historique ouvert et peuvent être nommées pour être conservées.
- Variantes d’écriture indépendantes avec brouillons, historique et sauvegardes automatiques propres, créées depuis le texte courant ou une version complète.
- Relecture du texte principal et de la variante, sélection de passages, résolution explicite des divergences et conservation des modifications indépendantes.
- Copies avant intégration et restauration, vérification des conflits externes et migration SQLite avec sauvegarde préalable du projet.
- Variante active visible dans la capsule supérieure ; changement de piste et accès à la gestion depuis son menu d’arborescence. Les échecs de capture y sont également signalés.

Voir les [notes 0.3.3](docs/release-notes-0.3.3.md) et le [guide des versions](docs/versionnement-ecriture.md).

## 0.3.2 — 2026-11-05, version de développement

- Refactorisation modulaire du frontend, de l’éditeur et du backend Rust, sans changement intentionnel des comportements ou des formats de projet.
- Contrats IPC typés, séparation des responsabilités et vérification automatique des frontières d’architecture.
- Documentation de l’architecture, des règles de travail et des limites de validation mise à jour.
- Reprise accessible dans l’en-tête, historique persistant des événements de notes et notifications dans la capsule supérieure.
- Profondeur : comportement horizontal d’origine sur grand écran, panneau stable au-dessus du bouton sur écran étroit.
- Déplacement de la fenêtre macOS depuis la partie libre de la barre supérieure.

Voir les [notes 0.3.2](docs/release-notes-0.3.2.md) et le [bilan de refactorisation](docs/refactorisation-modulaire.md).

## 0.3.1 — 2026-11-04, version de développement

- Navigation : sélection active par la couleur du texte et de l’icône, flous progressifs plus courts, accès et sortie du focus en haut à droite, sidebar accessible en focus et slider de profondeur stabilisé selon la taille de fenêtre.
- Entités : marques conservées pendant l’écriture et les mises à jour de contexte, création automatique des fiches non ambiguës, résolution des homonymes et édition des alias dans les fiches du vault du projet.
- Recherche : navigation directe entre les occurrences dans le texte ouvert, cartes du vault flottantes et ajout persistant à la marge depuis les résultats, les cartes ouvertes et les fiches complètes.
- Versions automatiques par texte : pauses, changements de texte ou de projet et fermeture normale sur Mac, sans doublons, avec rétention limitée et conservation des versions nommées.
- Présentation : cartes de marge teintées selon le type de note, retrait du doublon de commande focus dans les réglages et confort de lecture déplié par défaut.

Voir les [notes 0.3.1](docs/release-notes-0.3.1.md) pour le détail et les limites.

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
