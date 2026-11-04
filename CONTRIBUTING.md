# Contribuer à Ariane

Ariane est une alpha macOS Apple Silicon. Commencer par [construire l’application](docs/building.md) et lire [l’architecture](docs/architecture.md).

Pour un bug, indiquer la version d’Ariane, macOS, le type de Mac, les étapes et le résultat attendu. Utiliser un projet synthétique minimal ; ne pas joindre de manuscrit, vault, enregistrement ni base personnelle. Pour un changement important, discuter du problème avant de proposer une nouvelle fonction.

Les modifications doivent rester ciblées et suivre le style existant. Préserver le texte, la sauvegarde transactionnelle et la lecture seule des vaults externes. Ajouter un test de comportement lorsqu’une correction le justifie. Exécuter `npm run verify` et expliquer dans la proposition ce qui a été vérifié, ainsi que les limites. Les changements d’interface nécessitent aussi un contrôle dans l’application native.

## Contrôles GitHub

Les PR vers `main` déclenchent les vérifications complètes et les audits de dépendances pour les contributeurs. Les jobs automatiques sont ignorés, sans utiliser de runner, lorsque l’auteur de la PR est `absalonCRC` (identifiant GitHub `135626793`). C’est l’auteur de la PR qui compte : une relance par le propriétaire ne dispense pas une contribution externe de vérification. Les push ne déclenchent pas de deuxième exécution des mêmes contrôles.

Le contrôle `macos` reste obligatoire pour les contributions externes. L’exception accordée au compte `absalonCRC` concerne la règle des contrôles, uniquement lors d’une fusion de PR ; les règles imposant une PR, interdisant les suppressions et les push forcés restent distinctes et actives. Cette exception permet au propriétaire de fusionner sans attendre GitHub Actions, y compris pendant une panne du service. Les vérifications locales restent nécessaires.

Les workflows `Verify` et `Dependency security` restent lançables manuellement depuis l’onglet Actions, y compris par le propriétaire. L’audit hebdomadaire des dépendances reste actif.

Les contributions au code original sont proposées sous GPL-3.0-only. Conserver les notices des dépendances tierces. Ne pas ajouter de modèles, exécutables, données privées, clés de signature ou résultats de tests volumineux au dépôt.
