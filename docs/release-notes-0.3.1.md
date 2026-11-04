# ariane 0.3.1

Version locale de développement du 4 novembre 2026, à la suite de la [0.3.0](release-notes-0.3.0.md).

## Écriture et navigation

La sélection de la bibliothèque utilise la couleur du titre et de son icône, sans graisse supplémentaire. Les flous sous les barres haute et basse sont progressifs et occupent une zone plus courte. Le bouton de focus est placé près du menu en haut à droite ; en focus, il devient le bouton de sortie et prend la place du menu. La sidebar reste accessible et le slider de profondeur conserve son interaction sur les tailles de fenêtre vérifiées.

## Entités et sources

Les marques des entités dont le nom reste intact suivent les modifications du texte et restent visibles pendant les analyses de contexte. Une entité non ambiguë crée automatiquement sa fiche ; une confusion avec une autre fiche propose un choix. Les noms historiques, surnoms et pseudonymes peuvent être saisis comme alias dans les fiches du vault du projet. Les vaults externes restent en lecture seule.

La recherche mène directement à la première occurrence du terme dans le texte ouvert. Les flèches haut et bas parcourent les suivantes et les précédentes. Les fiches trouvées dans le vault flottent au-dessus de la recherche et n’effacent pas les notes de la marge. L’action **Ajouter à la marge** est accessible dans chaque résultat, carte ouverte et fiche complète ; après l’ajout, elle indique **Dans la marge**. Les cartes ouvertes dans la marge reprennent la teinte du type de note, y compris pendant leur animation.

## Versions et réglages

Les versions se créent automatiquement pendant l’écriture, après 90 secondes de pause et lors des changements de texte ou de projet, ainsi qu’à la fermeture normale de l’application Mac. Les doublons sont ignorés ; une réécriture importante conserve l’état précédent. Les nouvelles versions automatiques sont limitées à 40 par texte et 128 Mio de données par projet, avec espacement des versions anciennes. Les versions nommées et les sauvegardes avant restauration sont conservées. Le [guide d’usage](usage.md) décrit les intervalles et limites, dont le plafond réduit de l’aperçu navigateur et la réutilisation de l’espace SQLite.

Le panneau Écriture et lecture ne répète plus le bouton de focus et ouvre Confort de lecture par défaut.

## Version et distribution

Les versions npm, Cargo et Tauri ainsi que leurs fichiers de verrouillage indiquent **0.3.1**. Le paquet macOS local est reconstruit pour Apple Silicon, avec signature ad hoc. Il n’est pas notarié et cette mise à jour ne crée ni tag, ni release GitHub, ni publication automatique.

Les parcours de carte et de recherche ont été vérifiés dans l’aperçu navigateur ; les tests couvrent également la persistance, les réponses périmées, la rétention et la restauration natives. Aucune nouvelle mesure d’endurance, de mémoire en usage réel ou de dictée au microphone n’est revendiquée pour cette mise à jour.
