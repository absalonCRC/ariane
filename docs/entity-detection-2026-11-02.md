# Détection locale des entités et invocation de notes — 2 novembre 2026

## Diagnostic et décision

Conserver le GLiNER2 multilingue déjà installé, corriger son intégration et accepter ses prédictions fiables de noms simples. Aucun modèle supplémentaire n'est nécessaire pour débloquer « Claude », « Nougaro », « Voltaire » ou plusieurs noms fictifs. Cela ne garantit pas la détection de tous les noms.

Deux défauts étaient indépendants :

- Le worker livré dans le bundle Mac lisait `memory-model.txt`, absent de la liste des ressources embarquées. Il échouait avant toute analyse. Le fichier est maintenant distribué et vérifié, avec un test qui démarre le worker à partir des seuls fichiers du bundle.
- Le post-traitement Rust rejetait toutes les personnes à un seul mot, même prédites à haute confiance. Cette restriction reste appliquée aux règles heuristiques, mais plus aux prédictions du modèle acceptées au seuil existant de 0,80. Le cache d'analyse est versionné à nouveau afin de recalculer les anciens résultats.

Les titres et alias explicites du vault restent prioritaires. Une détection indique un type et une position, pas nécessairement une identité unique : « Claude » ne doit pas devenir automatiquement « Claude Nougaro » sans alias explicite ou choix de l'auteur. La création automatique à chaque prédiction polluerait le vault ; une proposition colorée permet de créer la fiche explicitement.

## Mesure locale reproductible

Script : `scripts/evaluate-entity-names.py`, à lancer avec le Python du runtime mémoire installé. Rapport brut local : `artifacts/entity-detection-2026-11-02/evaluation.json`.

42 phrases synthétiques françaises et anglaises, 41 entités annotées manuellement : noms simples, noms composés, noms inventés, homonymes de noms communs, négatifs, accents, emoji, pays et organisations. Correspondance exacte du texte ET du type ; une erreur de type compte comme faux positif et faux négatif. Ce petit jeu ciblé n'est ni un benchmark indépendant ni une estimation de la précision générale dans des romans.

| Variante | Correctes | Faux positifs | Manquées | Médiane d'inférence |
|---|---:|---:|---:|---:|
| GLiNER actuel, seuil 0,80, noms simples autorisés | 33 | 1 | 8 | 377 ms |
| Même modèle, descriptions longues des catégories | 25 | 0 | 16 | 755 ms |

Appliquer l'ancien filtre sur les mêmes sorties du modèle ne conserve que 10 entités correctes et en manque 31. Ce calcul isole le filtre : ce n'est pas une mesure de l'ancien système complet, qui combine aussi règles et vault.

Chargement initial mesuré : 8,18 s. Pic mémoire du processus sur les deux variantes : environ 1,04 Gio. Exécution CPU quantifiée QNNPACK sur ce Mac arm64 ; une seule passe par variante, sans mesure de batterie ni de latence complète frappe→affichage. Les descriptions enrichies sont donc écartées dans cette modification.

Exemples reconnus : Claude, Nougaro, Voltaire, Molière, Socrate, Élise, Gandalf, Arya, Vaël, Néris, Aelys, Qorûn dans une phrase. Limites constatées : Pierre/Rose dans certains contextes de nom commun, Frodon classé organisation, Merlin insuffisamment sûr, Qorûn isolé, France et Templiers sous le seuil. Le seuil n'a pas été abaissé pour masquer ces échecs.

## Solutions étudiées

| Solution | Intérêt pour Ariane | Décision |
|---|---|---|
| GLiNER2 multilingue déjà installé + titres/alias du vault | Extraction locale de segments et catégories, sans générer du texte | Retenu et corrigé ; poids et runtime existants conservés |
| GLiNER2.5 multilingue | Architecture différente, extraction et relations ; candidat à comparer sur les cas manqués | Pas intégré sans mesure locale et vérification du nouveau chargeur |
| GLiNER2.5 small | 74 M de paramètres annoncés, mais modèle anglais | Pas un remplacement multilingue pour l'éditeur français |
| spaCy français small | Pipeline CPU français, domaine actualités ; complément possible pour personnes/lieux | Nécessiterait un second runtime logique, un arbitrage des désaccords et un test sur la fiction |
| Classifieur local de décision | Peut arbitrer le type d'un candidat | Ne découvre pas à lui seul les limites des noms ; nécessite candidats et exemples annotés |
| Embeddings existants | Rapprochement sémantique entre passages | Ne fournissent pas directement les positions et types des entités |

Les caractéristiques annoncées viennent des [sources GLiNER2](https://github.com/fastino-ai/GLiNER2), de la [fiche GLiNER2.5 small et de sa comparaison de famille](https://huggingface.co/fastino/gliner2.5-small-v1) et de la [documentation des modèles français spaCy](https://spacy.io/models/fr). Les variantes non installées n'ont pas été benchmarkées ici. GLiNER2.5 nécessite `AutoExtractor` : un simple changement du nom des poids dans l'ancien chargeur ne suffit pas.

## Application à l'écriture

Les entités existantes et proposées sont décorées dans CodeMirror sans modifier le manuscrit. Les suggestions de sources et d’entités ont un fond teinté à 8 % selon leur type (14 % au survol), y compris les types personnalisés. Le réglage « Colorer les entités reconnues », partagé entre Paramètres → Écriture, Sources et références, et le menu Écriture et lecture, neutralise les couleurs du manuscrit tout en conservant les liens cliquables et les teintes de la marge. Les couleurs sont personnalisables par type ; aucun soulignement n’est appliqué aux entités ou aux liens de notes. L'analyse est différée après sauvegarde, limitée aux scènes visibles et ses résultats sont rejetés si le texte/projet a changé. Les portions de code ne sont pas colorées. Les catégories inconnues du modèle, comme un ordre fictif, bénéficient des fiches et alias du vault ; une catégorie personnalisée n'est pas automatiquement une compétence apprise par GLiNER.

`@titre` recherche les notes connectées et accessibles, par titre ou alias, avec correspondance compacte et tolérance limitée aux fautes. Les homonymes affichent leur chemin. `+ titre` (ou `+titre`) crée une note dans le vault du projet ; une correspondance exacte existante est réutilisée, une ambiguïté demande de choisir avec @. Une approximation comme « clownogaro » n'est pas une résolution phonétique garantie de « Claude Nougaro ».

Entrée consomme la commande sans saut de ligne et insère un lien Markdown vers l'identifiant de la source. Le live Markdown affiche immédiatement son titre cliquable, sans @ ni +. L'Entrée suivante retrouve son comportement normal. Échap laisse le texte brut. Une création en cours n'est pas doublée par une seconde pression ; une réponse asynchrone ne remplace pas un texte modifié entre-temps. Les vaults externes restent en lecture seule.

Pour améliorer davantage la fiction : étendre le jeu d'évaluation avec des exemples validés, tester séparément les homonymes et catégories personnalisées, comparer GLiNER2.5 multilingue avec le modèle actuel sur précision/rappel, latence à froid/à chaud, mémoire et batterie. Un petit arbitre supervisé n'est pertinent qu'après constitution d'exemples positifs et négatifs ; les corrections utilisateur ne constituent pas encore un entraînement automatique.

## Classification des nouvelles notes et types personnalisés

Ajout après les essais de l'éditeur : la tête de classification du GLiNER2 installé est réutilisée, sans télécharger d'autre modèle. La note est créée et son lien est inséré immédiatement. Après une pause, une tâche locale détermine son type et actualise sa couleur. Les exemples exacts fournis dans les paramètres priment ; sinon le modèle reçoit le titre, un extrait du contexte et les noms, descriptions et exemples des types actifs. Les types déjà présents dans les vaults sont également proposés dans les paramètres. Un type désactivé n'est pas sélectionné.

L'interface permet d'ajouter un type, de définir sa description et ses exemples, de choisir sa couleur et d'activer/désactiver la classification automatique. « Note » reste le repli en cas d'incertitude : le premier score doit atteindre 0,55 et dépasser le second d'au moins 0,20. Ce seuil est provisoire, vérifié sur les exemples ciblés ci-dessous, pas calibré sur un corpus représentatif. Deux types contenant le même exemple ne donnent pas une priorité arbitraire.

Essai du worker réel avec les dix types initiaux et le type personnalisé Dynastie : Claude Nougaro → Personne (0,643), France → Pays (0,728), Christianisme → Religion (0,774), Ordre du Phénix → Ordre (0,664), Capétiens → Dynastie (0,610), Qorûn avec un contexte disant qu'il s'agit d'un pays → Pays (0,834). Toulouse est moins sûr dans cette configuration (0,388) et est résolu par son exemple exact dans les paramètres. Ce jeu de sept cas positifs n'est pas une mesure globale de précision. Rapport brut : `artifacts/entity-detection-2026-11-02/classification.jsonl`. Première requête, chargement compris : 11,3 s ; les suivantes : environ 1,34–1,68 s sur ce Mac durant cette passe.

La note reste accessible pendant le classement. Les réponses sont contrôlées contre le projet actif, les définitions actuelles et l'empreinte du fichier. Le type est modifié seulement dans une note du vault appartenant au projet, sans déplacer son fichier ni changer son identifiant. Aucune note d'un vault externe n'est réécrite. Une fermeture avant le traitement peut laisser une note générique ; il n'y a pas encore de reprise persistante des tâches de classification après redémarrage. Les couleurs des liens sont résolues depuis les fiches enregistrées et les préférences ; leur coloration respecte aussi le réglage de coloration du manuscrit.

Validation native finale : dans un projet temporaire séparé, `+Ordre du Phénix` a créé une note puis enregistré `type: Ordre` par inférence locale ; `+Capétiens` a enregistré `type: Dynastie` selon l'exemple personnalisé et affiché la couleur `#118833`. Le contexte de classification est limité à la ligne de la commande, sans les URL des liens Markdown. Les liens sont sans soulignement et les références répétées réutilisent le même fichier.

Les titres saisis entièrement en minuscules sont capitalisés uniquement pour l'entrée du classifieur, sans changer le titre ni le fichier. Vérification complémentaire avec le schéma personnalisé exact : « claude nougaro » donne Personne (0,582, écart 0,389), tandis que « rose », « idées pour demain » et « qorûn » isolé restent sous le seuil. Le seuil de classification retenu est 0,55 avec un écart minimal de 0,20 ; le seuil NER de détection des segments reste à 0,80. Cette vérification ciblée ne permet pas de promettre une fiabilité générale.


## Revérification des noms simples et du type personnalisé Langue

Lors de la revérification native, les notes isolées Claude, Socrate et Voltaire restaient génériques. Le traitement fonctionnait, mais le préfixe `Entité à classer :` donnait des scores insuffisants au classifieur local. Comparaison sur le même modèle installé, avec le même registre et sans changer les seuils :

| Titre isolé | Ancien score Personne | Entrée `Nom : …` |
|---|---:|---:|
| Claude | 0,457 | 0,842 |
| Socrate | 0,322 | 0,670 |
| Voltaire | 0,347 | 0,662 |

Le préfixe est corrigé en `Nom :`. Les seuils 0,55 et écart minimal 0,20 sont conservés. Claude saisi en minuscules obtient le même résultat, avec un titre de fiche inchangé. Les cas rose, idées pour demain, Qorûn et Espéranto isolés restent génériques dans cet essai. Cela montre aussi la limite : le classement d’un nom sans contexte n’est pas garanti.

Le type **Langue** a été ajouté depuis les paramètres de l’application native, avec la définition « Langue parlée ou écrite, réelle ou inventée. » et les exemples « Français, Anglais ». Français est classé par son exemple exact. Klingon, absent des exemples, est classé Langue par inférence à partir de la phrase « Cette langue est parlée par les habitants de cette planète : Klingon » (0,672 avec l’entrée corrigée). Ordre du Phénix reste classé Ordre (0,834) ; France reste classée Pays (0,722). Capétiens est résolu par l’exemple explicite Dynastie, prioritaire sur des prédictions devenues trop proches.

Rapports locaux : `artifacts/entity-detection-2026-11-02/classification-check.jsonl` (avant), `classification-prompts.jsonl` (comparaison), `classification-nom.jsonl` (après). Ces essais ciblés ne constituent pas une mesure de précision générale.

Validation après reconstruction du bundle : création de cinq nouvelles notes avec `+` puis Entrée dans un projet temporaire vierge, sans réutiliser les fichiers de l’essai précédent. Lecture des fichiers Markdown : Claude, Socrate et Voltaire ont `type: Personne` ; Français et Klingon ont `type: Langue`. Le registre personnalisé issu des paramètres a été conservé. Rapport : `artifacts/entity-detection-2026-11-02/native-classification.json`.
