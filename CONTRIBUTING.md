# Contribuer à Ariane

Ariane est une alpha macOS Apple Silicon. Commencer par [construire l’application](docs/building.md) et lire [l’architecture](docs/architecture.md).

Pour un bug, indiquer la version d’Ariane, macOS, le type de Mac, les étapes et le résultat attendu. Utiliser un projet synthétique minimal ; ne pas joindre de manuscrit, vault, enregistrement ni base personnelle. Pour un changement important, discuter du problème avant de proposer une nouvelle fonction.

Les modifications doivent rester ciblées et suivre le style existant. Préserver le texte, la sauvegarde transactionnelle et la lecture seule des vaults externes. Ajouter un test de comportement lorsqu’une correction le justifie. Exécuter `npm run verify` et expliquer dans la proposition ce qui a été vérifié, ainsi que les limites. Les changements d’interface nécessitent aussi un contrôle dans l’application native.

Les contributions au code original sont proposées sous GPL-3.0-only. Conserver les notices des dépendances tierces. Ne pas ajouter de modèles, exécutables, données privées, clés de signature ou résultats de tests volumineux au dépôt.
