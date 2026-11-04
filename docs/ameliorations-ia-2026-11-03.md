# Améliorations IA — 3 novembre 2026

Travail local sur `codex/ai-performance-quality`, depuis `e1278ab`. Les sources, manuscrits et versions de l’auteur ne servent pas de corpus d’essai. Aucun changement de poids de modèle ni service distant n’est introduit.

La [validation élargie du 4 novembre](validation-ia-2026-11-04.md) complète ce rapport avec 85 cas audio, le microphone réel, un grand projet, l’endurance, les quatre autres langues et les correctifs révélés. La génération du corpus vocal utilise les crédits fal autorisés ; les moteurs de l’application restent locaux.

## Changements

- Encodages documentaires avec titres, budget de 512 tokens incluant le prompt, découpage Unicode avec chevauchement borné et lots de deux entrées. Les réponses sont associées aux entrées par leur index, puis normalisées.
- Cache persistant propre à chaque projet, borné à 1 024 encodages. Son unité de publication reste le nœud logique de l’outline ; son adresse de réutilisation contient texte normalisé, titre encodé, rôle, modèle et politique de découpage. Une analyse interrompue conserve ses calculs achevés sans publier une analyse partielle. Les vecteurs de requête sont produits pour le nœud actif.
- Stockage binaire des groupes de vecteurs de mémoire, avec lecture des anciens JSON et validation des dimensions/valeurs. Les espaces des anciens modèles restent séparés ; les lignes à réencoder sont reprises progressivement.
- Classement documentaire corrigé : le score lexical initial n’est plus augmenté à chaque passage correspondant d’un même document. Les seuils du moteur deviennent les références du banc d’essai.
- Mentions non confirmées distinctes par passage et position. Deux noms identiques ne produisent plus automatiquement une identité commune. Les anciennes agrégations ambiguës ne publient plus de chronologie ou de champs fusionnés. Les fiches et alias explicites restent prioritaires.
- Classification secondaire des segments détectés vers les types personnalisés, avec abstention et invalidation des reçus quand le registre change. Les personnes en minuscules peuvent être proposées à forte confiance ; les expressions de lieu communes en minuscules restent filtrées.
- File persistante de classement des nouvelles notes, reprise au repos et à la réouverture, avec contrôle du fichier, du projet et des types actuels. Une indisponibilité des modèles diffère le travail ; les échecs d’exécution ont des réessais bornés.
- Résidence des moteurs ajustée à leur usage récent, libération sous pression mémoire et échéance GLiNER calculée sur le temps actif, sans compter la suspension pendant la saisie. Parakeet commence à se charger à l’ouverture de l’enregistrement.
- Lexique dérivé automatiquement des fiches typées et alias accessibles du projet, relu à la prochaine dictée. Les éditions externes sont prises en compte après leur réindexation. Les noms proches deviennent des suggestions à vérifier ; aucune résolution phonétique ambiguë n’est appliquée silencieusement.
- Cleanup reçoit les extraits avant/après le curseur. Un budget de tokens borne entrée et réponse ; le brut reste le repli. Le filtre protège négations, montants, noms, dates et ordre des mots de contenu. Le brut reste consultable quand une mise au propre différente a été insérée.
- Révision en deux étapes : suggestions LanguageTool affichées avant le complément Salamandra, avec disponibilité indépendante des moteurs. Une application de correction invalide la réponse encore en cours.
- Corrections du modèle extraites et validées localement : une différence indépendante de ponctuation ou un lien altéré dans la réponse ne supprime plus une correction sûre. Les modifications proposées continuent de viser le texte original et la seule sélection ; le contexte voisin est en lecture seule.

## Choix conservés après comparaison

La première comparaison, sur six documents, conservait 768 dimensions et la formule hybride corrigée. La reprise ci-dessous remplace cette conclusion pour la recherche explicite : le corpus élargi justifie RRF pour son classement. Les suggestions automatiques conservent une formule et une échelle de confiance distinctes. Les dimensions restent à 768.

Pour GLiNER, les premières passes de calibration utilisaient les mêmes phrases, poids et extraction du worker. Médianes observées : 266 ms à un thread, 169 ms à deux, 126 ms à quatre. Il s’agit de passes synthétiques distinctes, sans mesure de batterie ni preuve d’un gain équivalent dans l’éditeur. Deux threads constituent le réglage retenu ; les configurations expérimentales sont bornées à 1/2/4 threads. La calibration par catégorie a ensuite été complétée dans la reprise. Le classement des notes conserve 0,55 avec écart de 0,20 ; les types secondaires et les minuscules ont des garde-fous plus stricts.

## Streaming Parakeet : point 18 non activé

Le message « Continue sauf le point 18 » exclut désormais ce point du périmètre. Les essais historiques suivants sont conservés pour provenance ; ils n’ont pas été relancés pendant la reprise.

Le moteur installé est Apache-2.0 et les poids sont CC BY 4.0. Aucun abonnement ni API payante n’est nécessaire. Toutefois, `parakeet-mlx` 0.5.3 reconstruit normalement une attention non quantifiée avant de tenter de charger les poids 4 bits, ce qui échoue. Le banc expérimental reconstruit l’attention avec la bonne quantification sans modifier la bibliothèque installée.

Cette adaptation s’exécute, mais plusieurs réglages produisent des mots déformés, des phrases manquantes ou des ajouts après remplissage silencieux. Par exemple, le mode par fichier restitue les quatre phrases du témoin ; certains réglages streaming perdent la phrase sur Marie et Toulouse. Le remplissage silencieux est également écarté comme moyen fiable de finalisation. Le mode actuel est donc conservé. Le streaming n’est pas présenté comme une fonction livrée.

L’essai historique utilisait `scripts/benchmark-voice-stream.py`, le Python local de la dictée et un WAV synthétique mono à 16 kHz. Le script reste conservé localement, hors du jeu de sources publié, puisque le point 18 a été exclu. Les résultats de cette seule voix synthétique ne constituent pas une évaluation sur voix humaines.

## Vérification et provenance

`scripts/benchmark-ai.py` exécute les vrais chemins Rust de recherche et de filtrage Cleanup dans un projet temporaire. Le corpus distingue calibration et validation par sujet ; les métadonnées contiennent le commit, les empreintes des fichiers et du corpus. Les anciens scripts E5/Gemma restent explicitement historiques.

Sur les six recherches positives du petit corpus, quatre étaient affichées en première position avant et cinq après l’ajout des titres et la correction. La recherche explicite conserve des correspondances lexicales faibles pour les deux requêtes négatives ; elles sont écartées des suggestions automatiques. Le rapprochement « artisane qui restaure les ouvrages » reste sous le seuil : cette limite est conservée dans le rapport.

Les deux altérations reproduites, suppression de négation et changement de 120 en 900 euros, passaient le filtre précédent et sont maintenant refusées. L’autocorrection explicitement dictée « vendredi non plutôt lundi » reste acceptée. Ce contrôle conservateur ne prouve pas l’équivalence sémantique de toute sortie possible.

Les tests couvrent notamment la réutilisation du cache d’outline après interruption, les homonymes, les minuscules, la reprise de classification, le périmètre du lexique, les réponses de révision périmées et l’affichage de la grammaire avant le modèle. Les tests des moteurs facultatifs s’exécutent séparément de la suite standard.

Les preuves locales sont dans `artifacts/ai-2026-11-03/` : `baseline`, `final-evaluation`, rapports `ner-*`, voix synthétique et essais streaming, journaux de vérification et construction de l’application de recette. `native-success/report.json` conserve le parcours Tauri/WKWebView réussi : texte sauvegardé et rouvert, fiche et source visibles, rappel sémantique, absence de fusion des identités non confirmées, retour au nœud `0-0` au décalage 24. Elles sont volontairement exclues de Git. Les temps de lancement incluent le cache disque du système ; aucune mesure d’énergie n’est revendiquée.

La recette se reconstruit avec `VITE_PERFORMANCE=1 npm run tauri build -- --debug --features performance-harness --config "$PWD/scripts/performance-config.json"`, puis se lance avec `scripts/benchmark-native.py` dans un dossier temporaire neuf, avec `--memory --entities`. Cette configuration ajoute la capacité du seul harnais de test ; elle n’est pas chargée dans la construction ordinaire. La recette lit les ressources du bundle, y compris dans une construction debug.


Vérification de la première passe : `npm run verify` a réussi (287 tests TypeScript, 17 tests Python, ressources, build, tests Rust et Clippy). Après le correctif de renommage, la suite Rust avait réussi avec 129 tests et 5 essais facultatifs exclus. Les deux essais installés de dictée et celui de révision française avaient également réussi. La vérification finale de la reprise est détaillée en fin de document.

## Reprise après « Continue sauf le point 18 »

### Calibration figée, puis validation séparée

Les nouveaux jeux versionnés contiennent 94 scènes annotées (80 mentions), 62 fiches à classer, 26 documents et 58 requêtes de recherche. Ils comprennent des paragraphes narratifs, des passages longs, des noms fictifs, des homonymes, des minuscules, des emoji, cinq catégories de base et des types personnalisés. Les variantes d’un même sujet restent dans la même partition. Il s’agit d’exemples rédigés pour le banc, pas d’un échantillon statistique des usages ou des manuscrits de l’auteur.

Les budgets, grilles de paramètres et annotations sont conservés dans les fichiers JSON. Une correction d’annotation a été documentée avant la validation : « Claude » et « Camille » peuvent être du type Personne sans désigner une identité déterminée. Les premières prédictions restent archivées. Les paramètres ont été choisis sur calibration uniquement ; les prédictions de validation n’ont pas servi à les retoucher.

La politique commune au worker et au publieur est livrée dans `src-tauri/resources/engine/ai-policy.json`. Elle fait partie des ressources vérifiées et versionne les reçus NER (`entities-v4`). Les seuils retenus sont 0,80 pour personne/lieu/organisation, 0,65 pour œuvre/événement, 0,85 pour un type secondaire et 0,95 pour une personne tout en minuscules. Il n’y a pas d’abaissement global du seuil.

| Validation NER — 40 mentions attendues | Avant | Après |
| --- | ---: | ---: |
| Mentions correctes | 26 | 30 |
| Mentions erronées | 1 | 1 |
| Précision | 96,3 % | 96,8 % |
| Rappel | 65,0 % | 75,0 % |
| Scènes négatives avec faux affichage | 0 / 9 | 0 / 9 |

Le rapport brut distingue sortie du modèle, segments acceptés et mentions réellement publiées, règles comprises. Le rappel reste limité pour les lieux, les dynasties et les vaisseaux ; un type personnalisé ne crée pas de nouvelles compétences de détection. Pour le classement des fiches, la validation compte 16 classements corrects, aucun incorrect et 15 abstentions, dont huit fiches typables manquées. La calibration contient une confusion région/pays. La grille de seuil/marge ne justifie pas de remplacer 0,55/0,20 ; les catégories rares sont explicitement signalées.

### Recherche et suggestions : politiques distinctes

Sur la validation des suggestions de profondeur 3, le seuil sémantique retenu est 0,44 et le score minimal 2,4. La profondeur maximale conserve ses réglages précédents, seuil sémantique de 0,48 et score de 1,9 ; le rappel de manuscrit conserve son seuil distinct de 0,45. Une marge entre candidats a été testée et écartée, car sa perte de rappel dépassait le budget.

| Suggestions automatiques — 29 requêtes de validation | Avant | Après |
| --- | ---: | ---: |
| Sources pertinentes proposées | 18 | 19 |
| Sources hors sujet proposées | 39 | 31 |
| Rappel | 78,3 % | 82,6 % |
| Requêtes négatives avec faux affichage | 2 / 6 | 2 / 6 |

Le taux de propositions hors sujet reste élevé sur ce jeu comportant plusieurs documents proches. Une amélioration mesurée ne signifie donc pas que toutes les propositions sont pertinentes. Les refus mémorisés, les périmètres de vaults et l’exclusion sémantique des personnes/lieux restent contrôlés séparément.

Pour la recherche explicite, RRF fusionne les vingt meilleurs candidats lexicaux et les vingt meilleurs sémantiques. Le meilleur passage de chaque source suffit ; les doublons ne donnent aucun bonus. Les titres et alias exacts non ambigus sont prioritaires. Le score RRF n’est jamais employé comme une confiance absolue pour les suggestions automatiques.

Le classement RRF atteint 19 premières positions sur 23 recherches positives de calibration, contre 14 pour la formule pondérée de référence. Un jeu supplémentaire, créé avant sa propre inférence et portant sur de nouveaux sujets (36 sources, 20 requêtes dont quatre sans réponse), vérifie ensuite le chemin réellement intégré : 15 premières positions sur 16 recherches positives pour les deux variantes, MRR 0,953, quatre titres/alias exacts corrects, p95 local 3,65 ms contre 4,02 ms. Ces temps concernent les appels chauds du banc natif avec encodages en cache, pas le délai complet d’une interface utilisateur.

Les dimensions 768/512/256 donnent le même premier résultat sémantique sur ce corpus ; 768 est conservé, sans faire passer une économie théorique de stockage pour un gain de qualité ou de mémoire globale mesuré. Les comparaisons titres/sans titres, budgets de 256/512 tokens et chevauchement sont enregistrées ; les titres et le budget de 512 tokens restent retenus.

### Révision, lots et compatibilité

Le banc de révision exécute LanguageTool et Salamandra sur douze passages, avec et sans contexte voisin, puis passe leurs sorties dans le filtre TypeScript réellement affiché. Le contexte retrouve les neuf corrections attendues, contre sept sans contexte. Une proposition grammaticale incorrecte subsiste ; aucun des cinq passages corrects ne reçoit de faux affichage avec contexte. Les temps du premier appel incluent le démarrage de LanguageTool : ils ne constituent pas une comparaison impartiale de latence entre prompts.

Ces essais ont révélé et permis de corriger trois problèmes : les suggestions orthographiques de LanguageTool sur des noms fictifs capitalisés sont filtrées, les changements de nombres/négations ou d’un déterminant pluriel explicite sont refusés, et deux plages produisant exactement la même correction ne sont affichées qu’une fois. Les accords, alternatives et intentions littéraires restent soumis au choix de l’auteur.

Les réponses partielles de lots conservent les vecteurs correctement identifiés et réessaient seulement les manquants. Un refus des tableaux revient au chemin unitaire. Le cache persistant reçoit les résultats terminés même si la suite échoue ; sa limite s’applique aussi aux chemins interrompus. Les tests de protocole vérifient erreurs, entrées répétées et attribution des index.

Le témoin natif d’outline compte deux requêtes HTTP initiales, une seule supplémentaire après modification d’une ligne et zéro après réouverture/retour au texte initial ; la ligne intacte conserve ses vecteurs. Ces compteurs mesurent les requêtes d’encodage, pas les forwards internes de llama.cpp. Sur vingt paires après préchauffage séparé, lots et entrées unitaires produisent les mêmes vecteurs dans la tolérance fixée ; le p95 observé est 33,39 ms contre 34,79 ms. Ce petit témoin ne permet pas d’annoncer un gain général de vitesse.

Le décodeur refuse également les vecteurs non normalisés. L’outil `scripts/migrate-memory-vectors.py` permet de reprendre la conversion des groupes 768D vers AM01 ou de revenir au JSON, par transactions bornées, sans changer texte ni identifiants de modèles. Les espaces historiques 384D restent en JSON. Les tests couvrent une interruption entre lots et l’annulation complète d’un lot invalide. Il n’a pas été exécuté sur les projets personnels.

La révision et Cleanup adaptent désormais aussi leur résidence à l’usage récent, avec limites, puis libération sous pression mémoire. Une tâche de classement identique conserve sa limite de réessai ; une entrée réellement modifiée peut démarrer une nouvelle tentative.

Un test de régression a également reproduit une erreur du filtre de nombres composés : « mille deux cents » pouvait être assimilé à 100200 et « quatre vingt » à 24. Le correctif normalise seulement des formes simples reconnues, dont « cent vingt »/120 ; les autres suites sont comparées littéralement et conservent le brut si la mise au propre les transforme. Les deux changements de montant sont maintenant refusés. Le contrôle des transcriptions par fichier enregistré donne zéro erreur sur les 26 mots du seul témoin synthétique, avec Marie et Toulouse reconnus ; ce résultat ne décrit pas les voix humaines.

Les segments détectés de plus de 120 caractères restent disponibles avec leur type de base : ils ne font pas échouer toute l’extraction en entrant dans un classifieur de titres plus courts. Le budget de découpage vérifie aussi la frontière de phrase finalement choisie, sans supposer que tous les préfixes plus courts ont moins de tokens.

### Couverture du périmètre

| Points | Résultat et preuve principale |
| --- | --- |
| 1, 12, 16 | Corpus versionnés, métriques par catégorie, calibration/validation distinctes, worker réel et profils CPU documentés |
| 3 | Résidence bornée selon usage, pression mémoire, préchauffage de la dictée ; mesures énergétiques non réalisées |
| 4, 5, 10 | Classement sans bonus de doublons, RRF explicite, seuils des suggestions séparés, contrôle des alias et validation indépendante |
| 6, 7, 8, 9 | Titres, budgets tokenisés, lots avec repli et cache par nœud ; équivalence native et compteur de requêtes réelles |
| 11 | Groupes binaires validés, anciens JSON lisibles, reprise et retour de format testés ; dimensions réduites écartées par choix conservateur |
| 13, 14, 15, 17 | Types personnalisés, mentions non résolues distinctes, file durable et garde-fous des minuscules ; cas faibles/rares affichés dans les métriques |
| 20, 21, 22 | Lexique automatiquement actualisé et borné au projet, noms à vérifier, brut récupérable, contexte et fidélité de Cleanup |
| 23, 24, 25 | Révision progressive, résultats périmés refusés, corrections locales, contexte en lecture seule et filtre réel mesuré |
| 18 | Exclu par l’utilisateur ; aucun nouveau travail ni activation du streaming |

Les nouvelles preuves sont sous `artifacts/ai-2026-11-03/reprise/` : `ner-calibration-corrected.json`, `ner-validation.json`, `retrieval-calibration`, `retrieval-validation`, `fusion-validation`, `revision-context-filtered.json`, `outline-cache.json`, `batch-equivalence-warm.json` et journaux de tests. Les corpus et scripts sont destinés à Git ; les résultats locaux restent ignorés.

Les limites restantes sont celles de la preuve : corpus rédigés, petites classes rares, voix synthétique plutôt que voix humaines, absence de mesure de batterie et de certification générale sur grands manuscrits. Aucun entraînement, changement de poids ou manuscrit de l’auteur n’a été utilisé.

### Vérification finale de la reprise

`npm run verify` a réussi sur l’état final : 290 tests TypeScript (deux essais exclus, dont le banc natif opt-in), 21 tests Python, 136 tests Rust (onze essais de moteurs/bancs exclus), build et Clippy. Les tests installés de dictée ont été réexécutés après le correctif des montants ; le témoin de révision française/anglaise a également réussi. Les sorties figées NER ont été repassées dans le publieur final, sans nouvelle inférence de validation.

L’application native de recette a validé sauvegarde/réouverture, fiche du passage exact, source citée, rappel, homonymes distincts, pause du worker pendant la saisie et retour au nœud `0-0`, offset 24. La sélection du témoin de fiche utilise sa provenance, pas l’ordre arbitraire de deux homonymes. Le rapport et les échantillons de processus sont conservés dans `reprise/native-success/`. L’application de test a été quittée ; ses workers sont arrêtés.

Le paquet local final a été reconstruit ; ses 23 ressources ont été vérifiées et le worker Python embarqué démarre avec une politique identique aux sources. Il n’est pas notarisé ni distribué. Cette campagne précède l’intégration des changements dans la [version 0.2.2](release-notes-0.2.2.md).

### Reproduction

Choisir des chemins de sortie neufs. Le contrôle NER de référence à 0,80 est conservé dans `benchmarks/fixtures/ai/policy-baseline.json` ; le banc ne remplace pas les paramètres de l’application pour l’évaluer.

```sh
"$HOME/Library/Application Support/fr.ariane.writer/memory/runtime/bin/python" scripts/benchmark-entities.py --split calibration --output /tmp/ariane-ner-calibration.json
"$HOME/Library/Application Support/fr.ariane.writer/memory/runtime/bin/python" scripts/benchmark-entities.py --split validation --repeat 1 --calibration /tmp/ariane-ner-calibration.json --output /tmp/ariane-ner-validation.json
python3 scripts/benchmark-retrieval.py --split calibration --output /tmp/ariane-retrieval-calibration
python3 scripts/benchmark-retrieval.py --split validation --calibration /tmp/ariane-retrieval-calibration/native.json --output /tmp/ariane-retrieval-validation
python3 scripts/benchmark-retrieval.py --split validation --fusion --output /tmp/ariane-fusion-validation
python3 scripts/benchmark-revision.py --output /tmp/ariane-revision.json
npm run verify
```

Les moteurs facultatifs doivent être déjà installés localement. Une reproduction de ces jeux publics n’est plus une nouvelle validation aveugle ; un prochain changement de paramètres nécessitera de nouveaux sujets tenus à l’écart.
