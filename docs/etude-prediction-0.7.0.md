# Étude de la prédiction d’écriture

18 novembre 2026 · Branche `codex/0.7.0` · Apple M1, macOS 26.6

## Proposition pour les réglages

Dans **Paramètres → Écriture**, remplacer l’interrupteur actuel par un réglage **Prédiction**. La migration conserve le choix de l’auteur. L’ancien état désactivé devient « Aucune » et l’état activé devient « Mot suivant ».

| Mode | Comportement proposé |
| --- | --- |
| **Aucune** | Aucune requête de prédiction ni suggestion pendant la frappe. |
| **Mot suivant** | Un mot après le curseur, dans la ligne. Exploiter en priorité le contexte et le vocabulaire du projet actif. |
| **Fin de phrase** | Une seule suite courte après le curseur, avec la ponctuation finale. Viser trois à huit mots. Afficher la suite seulement lorsqu’elle est complète, pertinente et arrivée pendant la pause de frappe. |

**Entrée** insère toute la proposition visible en une action annulable. **Échap** la masque. Sans proposition visible, Entrée crée le retour habituel. Le mode choisi s’applique au manuscrit et à la capture rapide. La capture prédit à partir de son texte et du vocabulaire commun. La saisie IME, le code Markdown et les complétions de notes gardent leur priorité.

## Qualité observée

La 0.7.0 classe les transitions à partir des deux mots précédents ou du mot précédent. Elle stocke des mots et leurs fréquences. La ponctuation coupe ces transitions pendant l’apprentissage. Elle ne fournit donc aucun signal explicite de fin de phrase.

La sonde a exécuté le classement Rust de la 0.7.0 sur 143 positions du corpus de recette en français, anglais et espagnol. Chaque position avait au moins deux mots de contexte et cinq mots à prédire, tous dans la même phrase. Après chaque prédiction, la sonde ajoutait le mot proposé au contexte. L’exactitude compare la totalité des mots proposés au texte de contrôle, après normalisation de la casse et des apostrophes.

| Mots demandés depuis la même position | Propositions de cette longueur | Exactes |
| --- | ---: | ---: |
| 1 | 126 / 143 | 108 / 143, soit 76 % |
| 3 | 106 / 143 | 82 / 143, soit 57 % |
| 5 | 71 / 143 | 41 / 143, soit 29 % |

Une autre sonde a récupéré la fin d’une phrase déjà apprise dans le projet lorsque les quatre derniers mots concordaient et que la suite était unique. Sur 136 positions avec deux à huit mots à compléter, elle a trouvé 64 suites et aucune ne correspondait à toute la fin attendue. Les textes de contrôle prolongent volontairement des phrases semblables aux phrases apprises. Une suite différente pourrait convenir à l’auteur. Cette recette mesure la reprise exacte, avec un corpus court et des contextes souvent proches.

Le modèle livré pour la révision, **SalamandraTA 2B Q8**, a aussi été essayé sur sept débuts de phrase synthétiques. Avec une consigne, les sorties répètent les instructions ou leur contenu. La réponse complète prend **1,52 à 2,20 s** une fois le modèle chargé. En continuation du préfixe seul, six réponses s’arrêtent immédiatement au retour à la ligne. La septième renvoie « 100 kg » après « Inside the old station, Nora lifted ». Ce modèle reste un témoin de qualification pour la révision. La fin de phrase demande de comparer des modèles entraînés à la continuation, avec une évaluation humaine en plus du taux de correspondance.

## Latence observée

La 0.7.0 attend **145 ms** côté éditeur après une frappe éligible avant d’interroger le moteur. Chaque requête rouvre la base. Le moteur agrège les transitions des scènes à la lecture. Le worker d’apprentissage relit également les scènes incluses pour identifier à partir de leurs empreintes celles qui ont changé.

Le test de charge répète délibérément les mêmes transitions sur 2 400 scènes réparties entre 12 projets. Il compare 700 requêtes par scénario et vérifie que les sept contextes testés renvoient les mêmes mots avec et sans agrégat. L’ouverture et la lecture SQLite sont mesurées dans le même processus. Le transport entre l’éditeur et Rust, le rendu et les sauvegardes concurrentes ont besoin de leur propre recette.

| Lecture de prédiction | Lignes d’index | Médiane | p95 |
| --- | ---: | ---: | ---: |
| Réouverture de SQLite à chaque requête | 252 000 | 6,97 ms | 9,53 ms |
| Réutilisation de la connexion SQLite | 252 000 | 6,10 ms | 8,47 ms |
| Connexion réutilisée et comptes agrégés par projet | 1 260 | 0,08 ms | 0,13 ms |

L’agrégat réduit fortement le travail de lecture sur ce scénario chargé et répétitif. Le gain perçu doit être mesuré sur un même parcours d’écriture avant et après. Sur le petit corpus de la recette 0.7.0, le p95 du moteur seul est déjà de 0,227 ms. [Recette 0.7.0](validation-0.7.0.md#mesure-sur-corpus-synthétique)

## Ordre d’implémentation recommandé

1. **Mesurer le délai jusqu’à l’écran.** Rejouer les mêmes suites de frappes et relever séparément l’attente dans CodeMirror, l’IPC, la recherche et l’apparition du texte. Tester à froid et à chaud, avec sauvegarde simultanée, sur des projets courts et longs. Fixer des objectifs initiaux de p95 à 120 ms en mode Mot suivant et 350 ms pour une fin de phrase affichée. Mesurer aussi le taux de propositions abandonnées pour dépassement du délai.
2. **Accélérer Mot suivant.** Réutiliser la connexion de lecture et ses requêtes préparées. Calculer les agrégats à l’écriture, en conservant les contributions par scène pour les corrections, suppressions et demandes d’oubli. Apprendre sur les révisions confirmées qui ont changé et réconcilier à l’ouverture, après restauration ou import. Raccourcir la temporisation à l’aide de la mesure et écarter les travaux remplacés avant qu’ils n’occupent le moteur.
3. **Améliorer son classement.** Tester un contexte de trois ou quatre mots avec repli progressif vers les contextes courts. Donner du poids aux occurrences du projet et aux usages récents, puis calibrer le seuil d’affichage sur plusieurs styles. Vérifier la pertinence, le taux d’acceptation et les frappes réellement économisées. Conserver le profil commun pour les transitions attestées dans plusieurs projets et l’oubli du projet pour les contributions privées.
4. **Qualifier Fin de phrase.** Essayer un modèle local de continuation court et chaud, avec un budget de sortie et un arrêt à la ponctuation finale. Pour une requête remplacée ou tardive, annuler l’inférence et libérer la place pour la suivante. Évaluer les fins générées en FR, EN et ES auprès de lecteurs, sur des scènes littéraires et documentaires, avec et sans vocabulaire du projet. Tester la répétition du préfixe, les sauts de ligne, les suites mal formées et l’interférence avec la frappe. Comparer la qualité et la latence avant d’intégrer le moteur. [Contrôles de génération du serveur llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
5. **Relier les trois modes.** Migrer le booléen de préférence, partager le choix avec la compacte et invalider le résultat lors d’un changement de mode, de projet, de révision ou de curseur. Conserver l’insertion en une transaction CodeMirror. Vérifier Entrée, Échap, annulation, clavier international, réouverture et priorité de la sauvegarde. Les mesures collectées portent sur les temps et les décisions d’acceptation. Les textes restent locaux.

Les nouveaux modes et les optimisations sont des propositions. Les sondes locales et leurs résultats se trouvent dans `artifacts/etude-prediction-0.7.0/`. La sonde SQL utilise le classement et l’apprentissage Rust actuels. La sonde de génération utilise le module de révision installé dans le profil synthétique de la recette.
