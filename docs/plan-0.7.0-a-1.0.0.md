# Plan d’implémentation d’ariane · 0.7.0 à 1.0.0

**Référence du 18 novembre 2026.** Sources 0.6.1, branche `main`, commit `bce60a3`, avec la roadmap modifiée localement qui porte le périmètre à F01–F35. Les étapes ci-dessous sont à réaliser. Les chemins cités désignent des points d’entrée présents dans ce checkout. Les choix de stockage ou de moteur proposés restent à éprouver sur les témoins indiqués. [Roadmap et matrice de couverture](roadmap-1.0.0.md) · [Architecture](architecture.md) · [Annulations à respecter](annulations-2026-11-01.md)

| Fenêtre cible 2026 | Ordre de livraison | Résultat à la sortie |
| --- | --- | --- |
| Dès novembre | Préparation des données, prototypes, distribution | Possibilité de restaurer un projet, décisions sur la prédiction et le PDF, moyens de qualification identifiés |
| 2–7 décembre | 0.7.0 → 0.7.1 → 0.7.2 | Prédire, essayer, comparer et scinder en conservant le texte |
| 8–13 décembre | 0.8.0 → 0.8.1 → 0.8.2 | Revenir à une source, annoter, contrôler le contenu réellement exporté |
| 14–17 décembre | 0.9.0 → 0.9.1 → 0.9.2 | Régler la page, parcourir le classeur, retrouver la séance |
| 18–30 décembre | beta.1 → beta.2 si nécessaire → rc.1 → rc.2 si nécessaire → 1.0.0 | Qualifier le candidat, corriger les défauts, préparer la distribution stable |

Le candidat 0.7.0 est disponible sur la branche `codex/0.7.0`. Le bilan détaille les étapes exécutées, les résultats mesurés et les preuves encore ouvertes. [Bilan 0.7.0](validation-0.7.0.md)

Les dates s’appliquent à la série entière. Réestimer les fenêtres dès que les mesures de prédiction, le prototype PDF, la recette audio ou la disponibilité de signature changent la prévision. Le 31 décembre constitue la réserve de distribution.

## Travaux à engager avant les lots fonctionnels

1. **Constituer les témoins.** Conserver des originaux synthétiques 0.2.2 et 0.6.1. Travailler sur leurs copies et sur un projet vide. Préparer deux projets avec homonymes, accents, emoji, branches repliées, variantes, notes et vault externe en lecture seule. Ajouter un PDF à texte, un scan, une image, une citation répétée et une capture en attente. Relever les textes, identités, métadonnées, pièces jointes et résultats d’export attendus.
2. **Fermer le chantier de sauvegarde projet.** Le schéma projet inspecté vaut 5. La sauvegarde de réception couvre sa propre base. Inventorier les données réellement possédées par le projet, prendre une copie SQLite cohérente après vidage de la file, inclure les pièces jointes et fiches du projet, puis proposer destination et restauration depuis les paramètres. Contrôler l’intégrité sur une destination de récupération avant de reprendre le travail. Éprouver manque d’espace, projet verrouillé, conflit Markdown et arrêt après commit. Restaurer séparément une archive de captures. Confirmer sur les témoins qu’un réessai préserve les données plus récentes et que le vault externe reste intact. Points d’entrée : `src-tauri/src/project/schema.rs`, `src/project/useProject.ts`, `src-tauri/src/inbox/backup.rs`, `src/app/Settings.tsx`.
3. **Éprouver les choix qui conditionnent décembre.** Lancer les étapes de prototype de 0.7.0 et 0.8.0 dès novembre. Relever sur Mac le comportement du raccourci physique de capture, d’Annuler dans le menu natif de la compacte, du microphone, du vrai IME et du changement de Space ou d’écran. Consigner matériel, procédure, résultat et blocages. Les anciennes échéances des 7, 10, 12 et 17 novembre appellent une vérification de leurs preuves. [Bilan de recette 0.6.0](validation-0.6.0.md)
4. **Préparer l’installation des modules facultatifs, cible 25 novembre.** Inventorier les dépendances embarquées et celles absentes sur un profil vierge. Brancher les installateurs existants à une action des paramètres avec progression, reprise après interruption et erreur exploitable. Vérifier les ressources avant activation. Essayer un téléchargement interrompu, un disque insuffisant, un module refusé et un redémarrage. L’écriture et l’export restent disponibles pendant ces parcours. Refaire l’essai avec la prédiction avant la fin de la série 0.7. Points d’entrée : `scripts/install_runtime.py`, `scripts/setup-memory.py`, `scripts/setup-voice.py`, `scripts/setup-revision.py`.
5. **Préparer une distribution témoin.** Établir l’accès au certificat Developer ID, à la notarisation et à un autre Mac Apple Silicon sous macOS 26+, ou documenter le profil vierge disponible. Construire et installer un premier paquet témoin afin de découvrir les blocages de signature ou de ressources avant la RC. Tenir à jour l’inventaire des dépendances, notices et sources redistribuables. [Procédure du dépôt](releasing.md)

## Règles d’exécution de chaque lot

- Au début du lot, relever la branche, le commit, les modifications en cours et les tests existants. Pour une évolution de données, définir la portée (projet, variante, profil ou session), la migration, la sauvegarde et l’effet d’une restauration. Allouer le prochain schéma au moment de l’intégration.
- Garder SQLite comme source transactionnelle et `src/project/useProject.ts` comme propriétaire de la file de sauvegarde. Le manuscrit se modifie par transactions CodeMirror. Conserver l’historique, le remappage UTF-16, les verrous, les priorités IPC et l’accès en lecture seule aux vaults externes. Rejeter les réponses devenues périmées avant affichage ou mutation.
- Pour chaque nouvelle commande, vérifier le registre, le clavier et le menu natif. Utiliser un identifiant stable, traduire en français, anglais et espagnol, conserver le retour du focus et les notifications dans la capsule supérieure. Vérifier fenêtre étroite, thème sombre et mouvement réduit pour les surfaces modifiées. [Direction d’interface](../DESIGN.md)
- Pendant le développement, lancer les témoins indiqués avec `npm test -- tests/capture-editor.test.tsx` en substituant le chemin réel, ou le test Rust ciblé avec `cargo test --locked --manifest-path src-tauri/Cargo.toml FILTRE`. Ajouter un test observable pour chaque risque nouveau que les témoins existants ne couvrent pas. Après déplacement de modules, lancer `npm run verify:architecture`.
- À la sortie, aligner les cinq fichiers de version npm, Cargo et Tauri, exécuter `RUST_TEST_THREADS=1 npm run verify` sur le candidat, ouvrir l’application dans un navigateur réel pour les parcours pris en charge et effectuer la recette native concernée. Consigner séparément les essais de moteurs, benchmarks, tests ignorés, contrôles matériels et échecs. Documenter les changements effectivement livrés dans le changelog, l’usage et l’architecture. Conserver le nom visible **ariane** et isoler les données synthétiques de recette.

## 0.7.0 · Proposer le prochain mot

**Périmètre** F03, intégration au focus F01 et à la capture F02. **Points d’entrée** `src-tauri/src/voice/lexicon.rs`, `src/editor/runtime/mount.ts`, `src/capture/CaptureEditor.tsx`, `src/app/commands/registry.ts`, `src-tauri/src/api/dispatch.rs`.

1. **Choisir le prédicteur avec une mesure.** Séparer apprentissage et évaluation sur des textes littéraires et documentaires FR/EN/ES. Prototyper fréquences et séquences de mots avec noms et alias. Comparer sur le même corpus tenu à l’écart une base commune puis sa version personnalisée. Relever exactitude du premier mot, couverture, latence p50/p95, mémoire et erreurs entre projets. Fixer les seuils de recette avant le lot principal.
2. **Rendre l’apprentissage révisable.** Identifier la provenance de chaque contribution par projet, texte et révision. Remplacer la contribution lors d’une correction, la retirer après suppression et tester l’oubli d’un projet. Dédupliquer les sauvegardes et réouvertures. Les refus ajustent le classement, seuls les mots conservés alimentent le texte appris. Limiter l’apport des sources externes au lexique autorisé.
3. **Raccorder les deux éditeurs.** Demander un seul mot hors du chemin synchrone de frappe. Vérifier contexte, position et révision au retour. Rendre la suggestion en décoration, y compris en focus. En capture sans projet, utiliser le profil commun et limiter l’IPC de la compacte à la capacité requise. Annuler une requête au changement de document ou au démontage.
4. **Donner la main à l’auteur.** Accepter par une transaction annulable, rejeter ou désactiver. Suspendre pendant sélection, IME et code. Accepter avec Entrée lorsque le mot est visible dans la ligne et conserver le retour à la ligne dans les autres cas. Tester aussi l’indentation avec Tab. Ajouter discrétion et réinitialisation aux paramètres, puis vérifier leur persistance.
5. **Sortie.** Taper dans deux projets, revenir au premier, corriger, supprimer et rouvrir. Tester focus, compacte, apostrophes et méthode de saisie réelle. Comparer le profil appris au témoin et relever acceptations/rejets en séance. La qualité personnalisée doit montrer le gain demandé avant validation. Témoins de départ : `tests/capture-editor.test.tsx`, `tests/workspace-commands.test.tsx`.

## 0.7.1 · Laisser un blanc et essayer une formulation

**Périmètre** F18, F19, F21. **Dépendance** l’apprentissage de 0.7.0 doit distinguer le texte adopté de l’essai. **Points d’entrée** `src/editor/runtime/commands.ts`, `src/project/annotations.ts`, `src-tauri/src/project/schema.rs`, `src-tauri/src/history/mod.rs`, `src/editor/textSearch.ts`.

1. **Définir les données privées.** Relier chaque blanc et essai à la variante, à la scène et au passage. Garder l’indice du blanc et la formulation de travail dans les métadonnées. Définir leur comportement à la migration, au déplacement du passage, à la sauvegarde et à la restauration. Une ancre devenue ambiguë doit permettre de récupérer le contenu privé.
2. **Livrer les blancs.** Insérer le marqueur visible `[…]`, saisir un indice facultatif et parcourir les blancs ouverts dans l’ordre du manuscrit. Compléter le blanc en une opération annulable qui réunit remplacement et état du repère. Contrôler le signe visible et l’absence de l’indice dans les exports.
3. **Livrer les deux formulations.** Capturer la sélection et sa révision, éditer le brouillon dans le contexte du paragraphe et basculer entre les deux rendus. Persister l’essai interrompu. Au choix final, vérifier que l’original correspond encore et effectuer une seule transaction. Jusqu’à cette validation, le compteur, l’export et la prédiction lisent l’original.
4. **Révéler les répétitions.** Sur sélection d’un mot, chercher ses occurrences entières dans les trois paragraphes concernés. Rendre des marques temporaires perceptibles en clair et sombre. Échap, frappe et changement de scène les effacent. Réutiliser les règles de recherche applicables et tester accents, limites de mots et paragraphes extrêmes.
5. **Sortie.** Dans deux scènes, retrouver un blanc après relance, le remplir puis annuler. Interrompre et reprendre un essai, comparer les exports avant et après adoption, puis restaurer une version. « pas » ne marque aucune sous-chaîne de « passage ». Partir de `tests/text-search.test.ts` et `tests/writing-activity-editor.test.tsx`.

## 0.7.2 · Aligner deux versions et prévisualiser une scission

**Périmètre** F30, F34. **Points d’entrée** `src/history/comparison.ts`, `src/history/ReadingDiff.tsx`, `src/history/History.tsx`, `src/app/Palette.tsx`, `src/project/ManuscriptDialog.tsx`, `src-tauri/src/project/manuscript.rs`.

1. **Apparier la phrase.** Partir des positions de `comparePassages` et de son diff de mots. Résoudre la phrase dans les deux rendus, y compris après un ajout en amont. Si deux correspondances sont possibles, conserver les deux positions de lecture.
2. **Aligner dans Versions.** Ajouter « Aligner ici » aux outils contextuels. Mesurer les deux ancres après stabilisation du rendu puis ajuster les colonnes. Tester une phrase dans un paragraphe dont la longueur a doublé, deux phrases identiques et une phrase supprimée. Vérifier focus et défilement au retour au manuscrit.
3. **Prévisualiser le découpage.** Capturer scène, texte courant et curseur UTF-16 avant l’ouverture de la palette. Montrer les deux bords de la coupure, respecter les refus en début/fin de scène. Échap conserve le document. À la validation, vérifier que le contexte est toujours valide et réutiliser le chemin de sauvegarde et l’opération native `split`.
4. **Sortie.** Comparer l’aperçu aux deux textes obtenus après une coupure près d’un emoji. Vérifier annotations, outline et smart-tags tels que le code courant les transporte, ainsi que l’absence de nouvelle version de sécurité dédiée. Ce comportement des identités est plus récent que le compte rendu d’annulation du 1er novembre. Témoins : `tests/history-comparison.test.ts`, `tests/versions-workspace.test.tsx` et test Rust `split_and_join_keep_plain_text_without_new_safety_versions`. Mesurer l’alignement dans une vraie fenêtre.

## 0.8.0 · Lire et référencer les sources

**Périmètre** F05, F31. **Points d’entrée** `src/sources/Reader.tsx`, `src-tauri/src/source_files.rs`, `src/contracts/annotations.ts`, `src-tauri/src/project/annotations.rs`, `src/editor/citationInsertion.ts`.

1. **Valider le rendu PDF.** Le lecteur actuel obtient le fichier par la requête autorisée `sourceFile`. Éprouver un rendu local pilotable sur PDF texte, scan et image avec zoom, sélection et changement de page. Comparer les rectangles avant/après zoom et vérifier les ressources embarquées dans le bundle. Arrêter ce choix avant de figer les ancres.
2. **Intégrer la vue partagée.** Garder l’éditeur modifiable à gauche et ouvrir le document à droite. Conserver sélection, défilement et instance CodeMirror. Entrer depuis le focus puis le restaurer à la fermeture. Libérer les ressources du lecteur sur changement rapide de document.
3. **Persister l’aller-retour.** Stocker dans le projet l’identité et l’empreinte du fichier, la page et les rectangles normalisés. Pour une citation, ajouter texte et contexte. Relier ces données à l’ancre du manuscrit. Depuis la note, révéler la bonne zone. En cas de fichier déplacé, changé ou absent, conserver la note et permettre une reconnexion explicite.
4. **Déplier une référence sous sa ligne.** Résoudre l’appel de note dans sa scène, rendre le contenu à la demande et revenir au même appel au clavier. Vérifier le cas de deux scènes ayant le même identifiant de note local. Préserver le texte et les définitions utilisés par l’export.
5. **Sortie.** Ancrer une citation sur deux lignes et une zone de scan. Changer de zoom, fermer, rouvrir et suivre les deux liens. Remplacer le fichier témoin et vérifier le signalement. Essayer les deux thèmes, une fenêtre étroite et la lecture seule du vault sur disque.

## 0.8.1 · Écouter, dicter et empiler les annotations

**Périmètre** F20, F22, F23, F32. **Dépendance** réutiliser les ancres éprouvées en 0.8.0. **Points d’entrée** `src/voice/useVoiceSession.ts`, `src-tauri/src/voice.rs`, `src/project/AnnotationMargin.tsx`, `src/project/annotations.ts`, `src-tauri/src/project/annotations.rs`.

1. **Écouter une sélection.** Éprouver une voix locale macOS qui signale le mot lu. Mapper sa plage à la sélection UTF-16. Exposer lecture et arrêt au clavier. Arrêter la voix quand le texte change, que le lecteur se ferme ou que le micro démarre. Ignorer les rappels tardifs d’une ancienne lecture.
2. **Dicter vers une note.** À l’action explicite, figer la destination (projet, variante, ancre, révision) puis utiliser l’acquisition et la transcription locales existantes. Acheminer le résultat vers la note une seule fois. Après navigation, conserver la destination d’origine. Si elle est introuvable, conserver la transcription à rattacher. Un refus du micro laisse la note éditable au clavier.
3. **Nouer deux passages.** Créer la relation avec deux extrémités et une légende facultative. Rendre les deux sens consultables. Annuler un lien en cours avant de choisir sa destination, déplacer une extrémité, supprimer puis restaurer un passage. Réutiliser la résolution d’ancre et signaler chaque ambiguïté.
4. **Composer la pile.** Regrouper en marge les notes qui visent la même phrase. Donner à chaque carte repliée une première ligne lisible. Ouvrir la carte choisie au premier plan, conserver l’ordre initial au repli et permettre de rejoindre les autres au clavier. Tester trois notes, dont une dictée, en fenêtre étroite.
5. **Sortie.** Sur Mac, écouter puis dicter, changer rapidement de scène pendant la transcription et fermer pendant l’acquisition. Vérifier le son entendu, l’arrêt du micro, la destination unique, le manuscrit intact et le retour du focus. Compléter `tests/audio-pipeline.test.ts` et `tests/voice-button.test.tsx` avec les cas de destination et de cycle de vie.

## 0.8.2 · Masquer à l’écran et contrôler l’export

**Périmètre** F10, F33. **Dépendances** blancs et essais de 0.7.1, citations et ancres de 0.8.0. **Points d’entrée** `src/export/Export.tsx`, `src/export/useExport.ts`, `src-tauri/src/export/mod.rs`, `src-tauri/src/export/footnotes.rs`.

1. **Matérialiser les plages.** Stocker les limites du floutage et les remapper lors des transactions, y compris édition en bordure, annulation et restauration. Ajouter les deux actions contextuelles. Conserver le comportement de copie ordinaire et le texte original dans le projet.
2. **Transformer avant conversion.** Étendre le contrat d’export avec un choix original/masqué et une valeur compatible pour les anciens appels. Appliquer le remplacement avant génération du Markdown et conversion PDF, Word ou EPUB. Traiter aussi les références et métadonnées générées qui pourraient réintroduire le contenu masqué. Conserver l’annulation et les contrôles de conflit et de chemins de l’export existant.
3. **Relier l’aperçu à la sortie.** Choisir dans la portée exportée un passage réellement concerné (flou, citation ou blanc) et utiliser la même transformation que le fichier. Si aucun passage ne correspond, le dire dans le dialogue. Au changement de format ou d’option, ignorer toute réponse d’aperçu périmée. Préserver la distinction entre rendu de l’extrait et pagination finale.
4. **Sortie.** Placer un texte témoin unique près d’une citation, d’un tableau et d’un blanc privé. Produire les quatre formats dans les deux modes. Vérifier visuellement l’aperçu, extraire le texte du PDF et inspecter contenu, notes et métadonnées du DOCX et de l’EPUB. L’original est présent en sortie normale et absent des données extractibles des plages masquées. Rejouer les tests Rust d’export avec les vrais convertisseurs, puis rouvrir l’original dans ariane.

## 0.9.0 · Régler la page et suivre un objectif

**Périmètre** F04, F16, F26, F35. **Points d’entrée** `src/app/Settings.tsx`, `src/app/Preferences.tsx`, `src/components/WritingCounter.tsx`, `src/editor/writingDelta.ts`, `src/profile/model.ts`, `src/editor/scrolling.ts`.

1. **Attribuer les préférences à leur propriétaire.** Recenser apparence, lecture, focus, sons, prédiction, objectifs, sources, vocal, raccourcis, sauvegardes et reprise. Étiqueter la portée application/projet. Réutiliser les préférences existantes et leurs valeurs par défaut pour les projets anciens. Conserver dans Aa l’accès aux réglages d’écriture courants.
2. **Calculer les objectifs.** Pour le projet, compter le texte inclus. Pour la séance, définir le début, la reprise et la clôture, puis compter les mots ajoutés nets des corrections et annulations. Partir des transactions d’écriture et inclure dictée et mot accepté. Tester le rangement d’une capture, un import, une restauration et un changement de filtre. Séparer les mesures de séance des agrégats quotidiens existants. Afficher la progression dans le compteur et permettre sa désactivation.
3. **Prévisualiser une composition.** À l’ouverture d’Aa, retenir les valeurs initiales et la position visuelle de la ligne du curseur. Appliquer temporairement police ou interligne, puis compenser le défilement après recomposition. Entrée valide une seule écriture de préférence. Échap restaure l’état initial et la sélection.
4. **Retrouver le réglage consulté.** En quittant les paramètres pour le texte, retenir pendant la séance le groupe, le contrôle et le défilement. Réappliquer après montage et mise en page. Si un contrôle est devenu indisponible, revenir au groupe. Vérifier la navigation clavier et les intitulés dans les trois langues.
5. **Sortie.** Modifier puis annuler la typographie au milieu d’une longue scène, recommencer et valider, puis contrôler la hauteur de la ligne après stabilisation. Retrouver un raccourci consulté après un détour dans le manuscrit. Contrôler les objectifs sur un jeu de deltas connus. Témoins : `tests/writing-counter.test.tsx`, `tests/typewriter-settings.test.tsx`, `tests/writing-activity-editor.test.tsx`.

## 0.9.1 · Chercher et feuilleter dans le classeur

**Périmètre** F25, F27, F28, F29. **Points d’entrée** `src/app/projectSearch.ts`, `src/app/Palette.tsx`, `src/project/binder/useBinder.ts`, `src/project/binder/BinderRow.tsx`.

1. **Désambiguïser les résultats du projet.** Grouper les titres identiques et fournir le plus court chemin de parents qui les distingue, jusqu’à la racine si nécessaire. Garder l’ID pour la navigation. Tester deux chapitres homonymes et un titre unique. Préserver la recherche du texte courant et les cartes des sources.
2. **Rendre le dépôt lisible.** Utiliser la destination que calculent déjà `allowedDrop` et `dropPlacement`. Afficher un trait avant/après ou un contour du parent pour un dépôt dedans. Les zones invalides restent refusées. Vérifier le résultat réel pour plusieurs niveaux et une sélection multiple.
3. **Construire un aperçu unique.** Au survol maintenu du titre, charger les premières et dernières lignes, en tenant compte du brouillon courant. Monter le cadre indépendamment de la ligne virtualisée. Un survol bref reste silencieux. Après ouverture, passer aux lignes voisines actualise le même cadre sans répéter le délai initial. Calibrer ce délai au pointeur sur le prototype.
4. **Gérer les sorties.** Annuler délai et lectures obsolètes au défilement, au début d’un glisser, à la sortie ou au démontage. Échap referme l’aperçu et le menu contextuel offre l’accès clavier. Vérifier le passage entre titre et aperçu, la dernière ligne du classeur et la fenêtre minimale.
5. **Sortie.** Feuilleter cinq pages depuis A, tenter un dépôt interdit puis déplacer réellement une page. Vérifier le parent obtenu et que le simple survol a conservé le texte actif, le curseur, le focus et le défilement. Témoins : `tests/library-binder.test.tsx`, `tests/binder-performance.test.tsx`, `tests/project-search.test.ts`. Le survol se valide avec une souris ou un trackpad dans une vraie fenêtre.

## 0.9.2 · Reprendre la séance et qualifier les parcours croisés

**Périmètre** F15, F17, F24. **Dépendance** les états des lots 0.7 à 0.9.1 doivent être disponibles. **Points d’entrée** `src/app/useWorkspace.ts`, `src-tauri/src/api/session.rs`, `src/editor/runtime/mount.ts`, `src/capture/draft.ts`, `src-tauri/src/app_lifecycle.rs`.

1. **Répartir les responsabilités de reprise.** Inventorier les états déjà persistés. Enregistrer, par référence à leurs propriétaires, projet, variante, document, nœud/curseur, défilement, replis, focus, machine à écrire, PDF/image et position, recherche ou vue, objectif/séance et brouillon compact. Prévoir la lecture des anciennes sessions à champs absents. La compacte conserve sa propre file.
2. **Restaurer dans l’ordre.** Attendre les sauvegardes et la résolution du projet, de la variante et des sources. Restaurer les panneaux, la géométrie stabilisée, puis le curseur et le focus. Si le PDF manque, retrouver la scène disponible. Un changement rapide de projet invalide la restauration précédente. Reprendre un brouillon conserve le micro arrêté et les commandes inactives.
3. **Laisser un mot pour demain.** Saisir l’intention au curseur et la conserver dans le projet avec une ancre vérifiable. La présenter près du passage à la prochaine ouverture et permettre son effacement. Tester la sauvegarde et l’export littéraire avant et après effacement.
4. **Revenir à la dernière frappe.** Mémoriser le point d’édition réelle du manuscrit par projet. Les lectures, mouvements de curseur, survols et ouvertures de fiches conservent ce repère. La commande rejoint la bonne scène, déplie le passage et rend le curseur. Prévoir le repli si le passage a été supprimé.
5. **Sortie et gel.** Écrire dans A, laisser une intention, feuilleter B, consulter depuis C une source, puis revenir à la frappe dans A. Refaire après fermeture immédiate, alternance de projets et restauration d’une session ancienne. Parcourir focus/prédiction/objectif, compacte/rangement/reprise, recherche/entité/PDF/annotation/Versions. Vérifier contrastes, trois langues, animations réduites et défilement. Constituer la liste des preuves F01–F35 pour la bêta.

## 1.0.0-beta.1 · Geler les fonctions et éprouver la migration

**Cible** 18 décembre. **Entrée** neuf sous-versions utilisables, F01–F35 rattachées aux recettes, sauvegardes et installation vierge déjà éprouvées. **Support** [matrice et conditions de bêta](roadmap-1.0.0.md).

1. Identifier le commit candidat, aligner les versions, construire et archiver le résultat de la vérification complète. Pour chaque exigence, consigner version, scénario, environnement et résultat. Inclure les acquis de 0.3–0.6 dans la campagne.
2. Migrer des copies de 0.2.2, 0.6.1 et des schémas intermédiaires réellement livrés. Comparer texte, outline, versions, variantes, liens, pièces jointes, blancs et notes selon leur date d’introduction. Ouvrir deux fois pour éprouver l’idempotence, tester la récupération après arrêt et le refus d’un schéma trop récent.
3. Exécuter les trois parcours complets sur le candidat : **romancier**, du projet vide à l’export avec focus, dictée, tags, variantes et sélection de branches ; **auteur documenté**, du PDF annoté à l’export masqué avec source modifiée ; **quotidien**, de la capture hors application jusqu’à la reprise après interruption. Tester le raccourci physique, le plein écran, le menu Annuler, un micro réel et la fermeture des deux fenêtres.
4. Sur le même matériel et les mêmes corpus, relever p50/p95 de frappe, recherche, ouverture compacte et prédiction lors de séances prolongées. Suivre mémoire et activité des moteurs. Établir le registre des défauts avec reproduction, conséquence, données touchées et preuve nécessaire après correction.
5. **Sortie.** Tout blocage d’ouverture, d’écriture, de sauvegarde, de récupération ou de confidentialité d’export est identifié et suivi jusqu’à correction. Un critère d’entrée manquant décale la bêta et appelle une réestimation.

## 1.0.0-beta.2 · Corriger les défauts de la première campagne

**Cible conditionnelle** 21 décembre, si la beta.1 impose un changement du build.

1. Regrouper les défauts par cause et par parcours affecté. Pour chacun, reproduire sur copie synthétique et garder le témoin qui échouait avant correction.
2. Corriger dans le module propriétaire et vérifier les effets sur les formats déjà enregistrés. Pour une correction d’ancre ou de sauvegarde, reprendre aussi une copie créée avec la beta.1.
3. Construire le nouveau candidat, relancer la vérification complète et les parcours dont les preuves ont été invalidées. Mettre à jour les limites documentées.
4. **Sortie.** Chaque correction a un résultat avant/après et un build identifié. Si la beta.1 ne change pas, conserver ses preuves et passer directement à la préparation RC.

## 1.0.0-rc.1 · Qualifier le paquet distribuable

**Cible** 23 décembre. **Dépendances** gel fonctionnel, corrections bloquantes traitées, accès Developer ID et notarisation disponibles. [Procédure de release](releasing.md)

1. Construire depuis une copie propre du commit candidat avec les lockfiles. Vérifier version, identifiant de distribution `fr.ariane.writer`, architecture arm64, ressources incluses, licences, inventaire et sources correspondantes.
2. Signer les composants embarqués et le bundle, notariser le paquet, vérifier son ticket et son empreinte après empaquetage. Conserver l’origine du build, ses contrôles et l’empreinte du fichier réellement proposé à l’installation.
3. Télécharger ce même paquet sur un autre Mac ou un environnement vierge explicitement décrit. Tester le premier lancement, écriture/export sans modules, puis leur installation depuis l’app, interruption, reprise et erreur d’espace disque. Essayer un projet migré, les permissions des sources et la dictée réelle.
4. **Sortie.** La RC porte une preuve de signature, notarisation, installation, migration et récupération. Les défauts bloquants observés orientent la décision de rc.2. Garder les preuves de la recette isolée distinctes de celles du paquet de distribution.

## 1.0.0-rc.2 · Requalifier un candidat corrigé

**Cible conditionnelle** 28 décembre, si le paquet ou son contenu doit changer après la rc.1.

1. Consigner le défaut précis, son effet sur les utilisateurs et les preuves devenues caduques. Reproduire le problème avec le paquet rc.1.
2. Appliquer la correction ciblée et refaire les contrôles du commit. Reconstruire, signer, notariser et recalculer l’empreinte du nouvel artefact.
3. Réinstaller le paquet corrigé sur environnement vierge et rejouer le scénario défaillant ainsi que les parcours qui traversent le même composant. Comparer au résultat rc.1.
4. **Sortie.** Associer les preuves au nouvel artefact. En l’absence de modification, le candidat qualifié reste rc.1. Le 28 décembre constitue une cible, indépendante de l’acceptation du résultat.

## 1.0.0 · Préparer la livraison stable

**Cible** 30 décembre. **Entrée** candidat RC qualifié, aucun blocage des fonctions obligatoires, données restaurables, ressources de distribution disponibles.

1. Identifier les sources finales et la version stable dans les cinq fichiers. Si la promotion change le binaire, produire son propre paquet, vérifier les ressources, signer, notariser et calculer le SHA-256 final. Relier chaque preuve au commit et à l’artefact auxquels elle s’applique.
2. Vérifier sur ce candidat les trois parcours complets, l’installation du téléchargement et l’ouverture d’un ancien projet. Contrôler prioritairement conservation du manuscrit, récupération et absence de texte extractible dans les plages exportées masquées.
3. Réunir paquet, empreinte, sources correspondantes, notices, guide d’installation des modules, compatibilité, guide de récupération, notes de version et procédure de signalement. Indiquer matériel, mesures, tests ignorés et limites réellement observées.
4. **Décider de la sortie.** Vérifier chaque condition de la roadmap sur le candidat final, y compris l’endurance et l’acceptation visuelle. Consigner prêt à distribuer si elles passent. Si une condition bloquante reste ouverte, préciser correction, preuve restante et prévision révisée. La mise à disposition publique relève de la décision de publication.

## Couverture des engagements antérieurs à reconfirmer

| Engagement déjà rattaché à un jalon précédent | Où le remettre à l’épreuve |
| --- | --- |
| F01 focus, F02 capture, F06 machine à écrire | 0.7.0 dans les deux éditeurs, 0.9.2 à la reprise, beta.1 sur Mac |
| F07 héritage des tags, F08 entités et relations, F09 administration des tags | 0.7.2 après scission, beta.1 sur projet migré et parcours documenté |
| F11 persistance documentaire, F12 sélection de branches | 0.8.0 après modification d’une source, beta.1 en édition et restauration |
| F13 recherche et vues, F14 commandes et raccourcis | 0.7.2 dans la palette, 0.9.1 dans le classeur, 0.9.2 à la reprise, beta.1 au clavier physique |

Les autres engagements figurent dans le périmètre des sous-versions ci-dessus. Les résultats d’exécution seront à consigner par candidat lors de l’implémentation.
