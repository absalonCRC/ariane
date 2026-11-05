# Consignes de travail — Ariane

## Périmètre et autonomie

- Travailler sans sous-agents. Ne déléguer que si l’utilisateur le demande explicitement dans la conversation en cours. Un skill ne suffit pas à autoriser une délégation.
- Une demande de plan ou d’audit autorise l’analyse et le livrable demandé, pas l’implémentation de la refactorisation. Une demande explicite de mise à jour de ce fichier autorise cette modification documentaire.
- Exécuter complètement le travail autorisé, avec ses vérifications pertinentes. Résoudre les détails réversibles courants sans demander de confirmation ; demander seulement si une information manquante change le périmètre, la correction ou l’autorisation.
- Conserver l’objectif actif lorsque les messages suivants ajoutent une contrainte ou demandent un état d’avancement. Respecter immédiatement une demande d’arrêt.
- Avant toute modification de code, vérifier la branche, le commit, les modifications locales et les consignes applicables. Préserver le travail existant ; ne pas supprimer de branche, de worktree ou de données sans demande explicite.
- Ne pas créer un worktree par défaut. Utiliser un checkout approprié existant ; expliquer le besoin d’isolation si un nouveau worktree est utile.

## Établir la référence correcte

- Vérifier les comportements dans le code et les tests actuels. Les mémoires, anciens rapports et anciens plans ne prouvent pas l’état présent.
- Lire `docs/architecture.md` et `docs/annulations-2026-11-01.md` pour comprendre les contraintes, puis vérifier les chemins et comportements cités. Signaler les passages devenus obsolètes plutôt que les appliquer aveuglément.
- Ne pas réintroduire une fonction annulée à l’occasion d’un déplacement de code, d’une abstraction ou d’un nouvel adaptateur navigateur.
- Exemple de dérive à éviter : sur la référence 0.3.1 inspectée le 4 novembre 2026, la création d’une scène prépare son nom dans la sidebar et ne crée la scène qu’après validation (`tests/new-page.test.tsx`). Une ancienne note décrivant la création directe d’une page vide ne doit pas remplacer ce comportement. Revérifier ce témoin après une évolution explicite du produit.
- Définir le résultat attendu et les invariants avant un travail substantiel. Distinguer observations, propositions et points non vérifiés.

## Refactorisation sans changement de produit

- Séparer les extractions/déplacements, les corrections de bugs, les optimisations, les migrations de données et les évolutions fonctionnelles en changements distincts.
- Extraire selon une responsabilité cohérente ou une réutilisation réelle. Ne pas découper uniquement pour atteindre un nombre de lignes, créer une fonction relais par appel ou introduire un framework de modules.
- Réutiliser les modules métier existants. Éviter une nouvelle dépendance ou une réorganisation globale des dossiers sans bénéfice concret établi.
- Un état mutable possède un propriétaire explicite. Les autres modules reçoivent les données et commandes nécessaires ; ne pas transmettre tout `Workspace` à chaque sous-composant et ne pas le remplacer par un contexte global équivalent.
- Les modules métier ne doivent pas dépendre du composant racine ou des détails privés d’un autre module. Garder les interfaces publiques petites et explicites ; les façades de compatibilité temporaires ont une condition de retrait.
- Importer les types depuis leur contrat métier et employer `export type` pour les réexports de types. Vérifier aussi le chargement dans un vrai navigateur : TypeScript et les tests DOM ne garantissent pas la validité des exports à l’exécution.
- Identifier les commandes par des identifiants stables, jamais par leur libellé traduit. Avant de partager leurs actions, vérifier les différences existantes entre palette, clavier et menu natif (navigation, checkpoint, flush et traitement des erreurs).
- Conserver les contrats IPC, les noms des événements, les formats persistés, les valeurs par défaut, les clés de stockage et les règles métier pendant une extraction mécanique.
- Préserver les messages, traductions, erreurs et fonctions disponibles dans chaque environnement. Le navigateur et l’application native ne possèdent pas les mêmes capacités.

## UI, UX et éditeur

- Préserver la hiérarchie DOM utile, les classes CSS, l’ordre de cascade, les attributs d’accessibilité, les raccourcis, les portails, les animations et leurs points d’ancrage. Éviter les conteneurs DOM ajoutés uniquement pour extraire un composant.
- Vérifier le focus, la sélection, le défilement, les brouillons et la restauration du contexte lors des ouvertures/fermetures et changements de mode.
- Conserver le titre et CodeMirror dans la même `.manuscript-column` et utiliser les abstractions de défilement existantes.
- Préserver les identités React, les clés, l’ordre des hooks et les conditions de montage. Une extraction ne doit pas recréer CodeMirror à chaque rendu ou changement de panneau.
- Le manuscrit reste géré par les transactions CodeMirror, pas par un état React contrôlé à chaque frappe. Préserver `sectionMapping`, les identités de l’outline, les positions UTF-16, l’IME et l’historique annuler/rétablir.
- Préserver les transitions actuelles entre écriture, Versions, recherche, focus immersif, lecteurs et réglages. En Versions, les outils contextuels remplacent les outils d’écriture ; ne pas ajouter un second menu concurrent.
- Les calculs de géométrie doivent être vérifiés après stabilisation des animations. Une capture intermédiaire ne prouve pas une régression de mise en page.

## Sauvegarde, tâches asynchrones et moteurs

- Garder un propriétaire unique de la file de sauvegarde et des révisions confirmées. Une erreur ne doit pas effacer les brouillons ; un acquittement ancien ne doit pas effacer une édition plus récente.
- Préserver l’ordre des opérations de texte, métadonnées, versions, session et changement de projet. Ne pas rendre concurrentes des opérations aujourd’hui séquencées sans une évolution distincte et des tests appropriés.
- SQLite est la source transactionnelle ; les Markdown sont des miroirs. Préserver le protocole de reprise après commit, les conflits externes, les copies de récupération et les verrous de projet.
- Capturer le contexte d’une tâche asynchrone et conserver les contrôles existants de projet, section/nœud, révision et empreinte avant publication. Une réponse périmée ne doit pas remplacer un résultat courant.
- Chaque abonnement, timer, observer, worker, flux audio ou processus a un propriétaire et un nettoyage explicites. Vérifier annulation et démontage, y compris lorsque l’acquisition asynchrone termine après le démontage.
- Préserver les files IPC séparées, la priorité des sauvegardes, l’admission avant `spawn_blocking`, les limites et le rejet des demandes remplacées. Ne pas réunir toutes les tâches dans une file globale.
- Conserver la séparation entre affichage documentaire et traitement en arrière-plan. Masquer les résultats en focus immersif ne doit pas perdre les résultats valides ni modifier les règles existantes de priorité des moteurs.
- Les vaults externes restent en lecture seule ; les données dérivées et fiches appartenant à Ariane restent distinctes. Une refactorisation ne change ni les autorisations de chemins ni les protections des ressources.
- Ne pas modifier les modèles, seuils IA, dimensions vectorielles, politiques de classement ou protocoles Rust/Python avec un simple découpage de fichiers. Ne pas fusionner les processus mémoire, voix et embeddings par souci d’uniformité.

## Vérification et livraison

- Pour chaque lot, vérifier les comportements concernés et les erreurs/concurrences pertinentes. Préférer des tests d’interface et de conservation des données à des tests reproduisant le découpage interne.
- Réutiliser les tests existants ; ajouter des témoins seulement pour une lacune réelle ou un risque introduit. Une modification documentaire seule ne nécessite pas une nouvelle suite de tests produit.
- Exécuter `npm run verify:architecture` après déplacement de modules ; garder les contrats indépendants de React/Tauri et les domaines indépendants d’`App`/`Workspace`. Le contrôle des noms IPC ne remplace pas la vérification des champs et valeurs sérialisés.
- `npm run verify` est la vérification complète du projet : ressources, tests Python de packaging, build, tests TypeScript, tests Rust et Clippy. L’exécuter pour valider l’intégration d’une refactorisation ; employer les tests ciblés pendant les extractions.
- Les tests de modèles ignorés, benchmarks et scénarios natifs réels demandent des vérifications distinctes. Ne pas les présenter comme couverts par la suite standard.
- Pour les changements d’interface, compléter les tests par une recette visuelle et clavier, puis native quand les fonctions concernées dépendent de Tauri, des fichiers, du microphone ou des moteurs.
- Le nom visible du produit reste toujours `ariane`, y compris pour une recette. Pour isoler une recette macOS, utiliser un identifiant de bundle distinct et un répertoire de données marqué comme synthétique ; ne pas renommer l’application en « Recette » ou en « QA ». Vérifier le nom du projet dans la fenêtre avant de saisir du texte : plusieurs builds peuvent partager le même nom d’application.
- Un benchmark qui attend une fonction désactivée par sa fixture est non concluant. Consigner cette limite et utiliser un témoin compatible ; ne pas modifier le produit pour faire passer le scénario.
- Commencer la recette de création/écriture depuis un projet vide. Tester aussi un projet existant, les changements rapides de projet et la fermeture/réouverture.
- Mesurer les performances avant/après sur le même scénario si un gain est annoncé. Ne pas confondre fichiers plus courts, build réussi et interface plus fluide.
- Ne pas répéter des vérifications déjà réussies sans nouveau changement, échec ou risque non résolu. Ne pas faire disparaître un test ou assouplir une assertion pour masquer une régression.
- À la livraison, indiquer ce qui a changé, ce qui a été vérifié, les échecs éventuels, les tests ignorés et ce qui reste non prouvé. Un test DOM, une recette navigateur, une recette macOS et une validation de moteur réel sont des preuves différentes.
- Centraliser les notifications globales (notes, sauvegardes, indexation, liens, récupérations et erreurs) dans la capsule supérieure. Ne pas réintroduire un message ou bandeau d’état flottant en bas ; conserver ses actions dans les détails de la capsule.
- Sur petit écran, vérifier les coordonnées du déclencheur avant/après ouverture : adapter le panneau ne doit pas déplacer son bouton. Conserver le comportement grand écran quand la demande vise seulement le responsive.
- Un journal d’activité ne doit pas assimiler un recalcul ou un déplacement d’offset à une nouvelle action. Conserver les actions explicites, rendre les réessais idempotents et ne pas rejouer les notifications des événements relus.
- Pour les barres macOS en mode Overlay, vérifier une vraie zone de glissement et la priorité des contrôles interactifs, sur l’accueil comme dans un projet.
- Mettre la documentation d’architecture à jour avec les changements effectivement réalisés. Ne pas présenter une architecture proposée comme déjà implémentée.
