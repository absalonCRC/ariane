# Préparer une release

La version `0.3.0` cible macOS 26+, arm64. Les [notes de développement](release-notes-0.3.0.md) décrivent les nouveautés. Les deux anciennes releases GitHub ont été retirées le 2 novembre 2026 à la demande du mainteneur. Ne pas recréer de release avant signature, notarisation et validation du paquet. Le dépôt et la CI ne publient rien automatiquement.

## Paquet local sans compte Apple payant

À partir d’un `ariane.app` déjà construit et signé ad hoc, préparer un DMG local :

```sh
python3 scripts/package-local.py --check-only src-tauri/target/release/bundle/macos/ariane.app
python3 scripts/package-local.py src-tauri/target/release/bundle/macos/ariane.app dist-local
cd dist-local && shasum -a 256 -c ariane-*.dmg.sha256
```

Le script refuse un nom de sortie déjà présent. Il vérifie la structure, l’architecture arm64 et la signature du bundle source, copie l’application sans la modifier, ajoute un raccourci Applications, puis vérifie l’image créée et son contenu après montage. Le manifeste SHA-256 est généré pour le DMG exact. Conserver ensemble le DMG, son manifeste et les [instructions d’installation](installing.md). Ces contrôles ne prouvent ni le démarrage sur un autre Mac, ni la confiance de Gatekeeper. Le paquet local ne constitue pas la release publique décrite ci-dessous.

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
