# Préparer une release

La première cible est `0.1.0-alpha.1`, macOS 26+, arm64. Le dépôt et la CI ne publient rien automatiquement.

## Sources

1. Vérifier la licence, le copyright et les versions dans npm, Cargo et Tauri.
2. Exécuter `python3 scripts/check-publication.py` ; relire la liste des fichiers sélectionnés par Git, ainsi que les notices. Ce contrôle détecte des motifs courants, pas tous les secrets possibles.
3. Construire depuis une copie propre avec les seuls fichiers publiables et exécuter `npm run verify`.
4. Activer le signalement privé de vulnérabilités sur le futur dépôt public.
5. Après validation, créer le premier commit, le tag et l’archive de sources correspondant exactement à la release. Conserver les lockfiles.

## Application à télécharger

Avant publication d’un ZIP ou DMG :

- Construire l’application depuis le tag ; vérifier ses ressources avec `python3 scripts/verify-resources.py CHEMIN_APP/Contents/Resources/resources`.
- Constituer et distribuer les sources correspondantes des composants GPL/LGPL et leurs instructions de construction. Les URL et formules de `native-dependencies.lock.json` sont des éléments de traçabilité, pas à elles seules une distribution complète de sources. Inclure aussi les notices de toutes les dépendances npm/Cargo incorporées. Voir `THIRD_PARTY.md`.
- Signer les exécutables et bibliothèques avec Developer ID, activer les options requises par Apple et notarifier le paquet. Conserver les secrets de signature hors du dépôt. Les signatures ad hoc des moteurs doivent être remplacées. Ne pas confondre l’empreinte du paquet ad hoc avec celle du paquet signé final.
- Tester le paquet réellement téléchargé sur un autre Mac ou compte macOS vierge, sans caches ni modèles déjà installés.
- Vérifier création, saisie, fermeture immédiate, réouverture, historique, conflit avec un Markdown externe, connexion d’un vault en lecture seule et les quatre exports. Vérifier l’absence de modules facultatifs, puis leur installation séparée si annoncée comme prise en charge.
- Publier les limitations, les sources exactes, le paquet et son SHA-256, puis marquer le journal des changements comme publié.

La CI prépare et vérifie les sources puis construit une application ad hoc. Elle ne remplace ni le parcours utilisateur sur un autre Mac, ni la notarisation, ni la vérification des obligations de redistribution.

Références : [signature macOS avec Tauri](https://tauri.app/distribute/sign/macos/), [notarisation Apple](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [FAQ GNU](https://www.gnu.org/licenses/gpl-faq.html).
