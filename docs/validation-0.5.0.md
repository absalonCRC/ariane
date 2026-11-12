# Qualification de la 0.5.0 — 12 novembre 2026

Référence de départ : `ef4f393`, branche `codex/0.5.0`. Implémentation qualifiée localement avant son intégration dans `main`. Le nom visible reste **ariane**. Cette qualification porte sur un jalon de développement ; aucun tag ni release GitHub n’est créé par cette intégration.

## Vérification automatique finale

`RUST_TEST_THREADS=1 npm run verify` : **réussite** sur le code final.

| Contrôle | Résultat |
| --- | --- |
| Architecture et contrats | Frontières vérifiées, 92 noms IPC concordants |
| Ressources | 23 fichiers de modèles et moteurs vérifiés |
| Packaging Python | 27 tests réussis |
| TypeScript et Vite | Build de production réussi |
| Frontend | 405 tests réussis, 2 ignorés ; 101 fichiers réussis, 2 ignorés |
| Rust | 188 tests réussis, 12 ignorés |
| Clippy | Tous les targets, avertissements traités comme erreurs : réussi |
| Diff et publication des sources | `git diff --check` et `check-publication.py` réussis ; ce dernier examine 654 fichiers selon ses règles configurées |

Les deux tests frontend ignorés sont l’évaluation de révision et le benchmark d’outline, conditionnés à leurs fichiers de rapport. Les douze tests Rust ignorés couvrent des campagnes IA, la comparaison de lots d’embeddings, des moteurs de révision installés et des scénarios vocaux réels. Ils ne sont pas présentés comme exécutés. Les avertissements Vite sur la taille de chunks et le mélange d’imports dynamiques/statiques restent visibles.

Nouveaux témoins : grammaire ET/OU et noms cités ; résolution par ID et homonymes ; héritage et brouillons courants ; refus des lots périmés ; mentions résolues après renommage ; conservation des originaux ; persistance des vues ; isolation des variantes ; fusion et inversion après réouverture ; plusieurs inversions successives ; réessai idempotent ; édition ultérieure préservée ; migration avec copie ; refus d’un schéma futur ; fiches externes intactes ; récupération d’index après écriture ; chargement du corps complet avant édition ; collisions et persistance des raccourcis ; priorité de la recherche sur CodeMirror et dédoublonnage de son événement natif. Le témoin JSON IPC des relations est consommé par TypeScript et Rust.

## Recette navigateur de production

Projet créé vide depuis l’accueil : « Synthétique 0.5.0 — navigateur », puis projet secondaire distinct.

- Saisie du titre et du manuscrit, smart-tag du titre et tag de passage, sauvegarde et rechargement.
- Création de trois identités dont deux homonymes ; occurrences ambiguës signalées ; fiche ariane et relation dirigée avec statut et provenance.
- Fusion prévisualisée, puis annulation après rechargement : les deux identités réapparaissent.
- Requête mixte entité/tag : deux passages dans une page, compteur de **12 mots**, sans copie ni modification des originaux. Basculement texte/tableau et clic vers l’original avec focus dans CodeMirror.
- Vue nommée retrouvée après rechargement et changement de projet. Le projet secondaire possède son propre catalogue vide. Un renommage de l’identité actualise l’expression de la vue sans changer son nom ni ses références ; son alias conserve les occurrences.
- Nouveau raccourci effectif après rechargement, ancienne combinaison inactive, collision expliquée, remise à zéro fonctionnelle. Consultation d’une vue depuis le focus et retour à la présentation focus.
- Interface du gestionnaire en anglais et des raccourcis en espagnol, puis retour au français. Tests statiques des traductions également réussis.
- Tailles **1440×1000** et **800×650**. En petite fenêtre, document sans débordement horizontal ; bouton texte/tableau à **x=743, y=607** dans les deux modes. Géométrie lue après stabilisation. Le gestionnaire possède son propre défilement ; les champs et relations restent accessibles.
- Capture finale et état d’analyse placés dans l’en-tête de la vue ; console navigateur finale sans erreur ni avertissement.

Preuves locales : `artifacts/version-0.5.0/recipe/entities-relations-1440.png` et `query-table-800.png`. Les dimensions temporaires du navigateur ont été réinitialisées.

## Recette native macOS

Builds isolés avec identifiant `fr.ariane.writer.synthetic05020261112`, nom visible **ariane**, données distinctes du profil canonique. Projet créé vide via le dialogue natif dans `/tmp/ariane-050-synthetic-projects/`, nommé « Synthétique 0.5.0 — Mac » ; nom vérifié dans la sidebar avant saisie.

- Création, titre, smart-tag, écriture de deux lignes, sauvegarde, fermeture et réouverture : texte retrouvé. Les dernières vérifications SQLite lisent exactement les deux lignes saisies, `integrity_check=ok` et aucune erreur de clés étrangères.
- Création de fiches et indexation immédiate ; édition d’une fiche au-delà de l’aperçu de liste, sauvegarde puis réouverture. Le fichier comporte **741 caractères** et son marqueur de fin complet. La liste abrégée n’est pas utilisée pour remplacer le corps.
- Identités homonymes distinctes, troisième identité, relation sourcée ; fusion manuelle prévisualisée puis annulée depuis le journal après redémarrage. Trois identités et la relation originale conservées.
- Personnalisation du focus en `⌘⇧Y`, conflit détecté pour le classeur, persistance après redémarrage, ancienne combinaison `⌘⇧F` inactive. Le focus s’active puis se désactive une fois par geste sur le build corrigé.
- `⌘F` ouvre la barre d’ariane. L’ancien panneau de recherche/remplacement CodeMirror ne s’ouvre plus par ce chemin. Une requête `@"Pierre Curie" + #dossier` est enregistrée et affiche **1 passage, 5 mots** ; texte et tableau consultés, retour à l’original et focus dans le manuscrit confirmés.
- Preuve locale : `artifacts/version-0.5.0/recipe/native-query-table.png`.

La recette a révélé et fait corriger trois défauts : fiche écrite mais recherchée avant son indexation ; gestionnaire sans défilement pour les formulaires longs ; mise à jour des accélérateurs limitée au premier niveau des menus Tauri. Elle a aussi identifié l’interférence du raccourci de recherche avec CodeMirror, corrigée et revérifiée. Les derniers ajustements purement frontend (placement du statut et contrôle d’une ancre disparue) sont reconstruits, testés et vérifiés dans le navigateur ; les parcours fichiers et menus utilisent le build isolé correspondant à leurs corrections.

Le déplacement réel de la fenêtre par sa barre n’a pas été mesuré ; les outils utilisés n’exposent pas ses coordonnées natives. Ce comportement existant n’est pas qualifié par les captures navigateur. Aucun test natif au microphone ni séance d’endurance n’a été ajouté à cette qualification.

## Paquet livré et limites

Paquet canonique : `src-tauri/target/release/bundle/macos/ariane.app`, identifiant **fr.ariane.writer**, version **0.5.0**, exécutable **arm64**, nom **ariane**. Construction Tauri réussie, `codesign --verify --deep --strict` et ressources embarquées vérifiés sur le bundle livré. Les versions des cinq manifestes/lockfiles concordent. Le manifeste local dans `artifacts/version-0.5.0/qualification.json` conserve les empreintes et les chemins des preuves.

La signature est **ad hoc**, sans notarisation. Le paquet canonique n’a pas été installé sur un autre Mac ou un compte vierge. Les scénarios natifs sont isolés pour préserver le profil canonique et les données utilisateur. Les modèles facultatifs, benchmarks, endurance et validation visuelle finale par l’utilisateur restent des preuves distinctes. Aucun gain de performance, stabilité 1.0, tag Git ou publication publique n’est annoncé.
