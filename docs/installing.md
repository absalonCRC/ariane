# Installer un paquet local d’ariane

Ce paquet expérimental est destiné à un **Mac Apple Silicon (arm64) sous macOS 26 ou ultérieur**. Il porte une signature ad hoc, sans identité Developer ID et sans notarisation Apple. macOS peut donc refuser son ouverture ; le contrôle de signature du script confirme l’intégrité du bundle, pas son origine auprès d’Apple.

1. Recevoir le fichier `.dmg` et son fichier `.dmg.sha256` depuis une provenance que vous connaissez. Dans Terminal, placer les deux fichiers dans le même dossier puis exécuter `shasum -a 256 -c ariane-*.dmg.sha256`. Continuer seulement si le résultat indique `OK` et si l’empreinte publiée par l’expéditeur correspond.
2. Ouvrir le DMG dans le Finder et glisser **ariane.app** sur le raccourci **Applications**. Éjecter ensuite le volume « ariane ».
3. Ouvrir ariane depuis Applications. Si macOS la bloque parce que son développeur n’est pas identifié, vérifier de nouveau l’origine et l’empreinte. Si vous décidez de l’ouvrir, suivre le parcours Apple **Réglages Système → Confidentialité et sécurité → Ouvrir quand même** après la tentative d’ouverture, puis confirmer. Ce bouton peut n’être visible que pendant une heure. Cette exception concerne l’application choisie ; elle ne désactive pas Gatekeeper globalement.

Ne pas supprimer l’attribut de quarantaine, modifier la signature ou désactiver Gatekeeper. Si le système indique que l’application est endommagée ou refuse toujours de l’ouvrir, conserver le message exact et utiliser la [construction depuis les sources](building.md) en attendant un paquet signé Developer ID et notarié.

Références Apple : [installer une app depuis un disque](https://support.apple.com/fr-fr/guide/mac-help/mh35835/27/mac/27), [ouvrir une app d’un développeur inconnu](https://support.apple.com/fr-fr/guide/mac-help/-mh40616/mac), [distribution hors App Store](https://developer.apple.com/documentation/technologyoverviews/distribution).
