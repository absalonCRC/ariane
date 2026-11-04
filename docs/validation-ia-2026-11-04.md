# Validation élargie des IA — 4 novembre 2026

Campagne locale sur `codex/ai-performance-quality`, après la demande de tester les cas encore manquants et d’utiliser les crédits vocaux. Le point 18, streaming Parakeet, reste exclu. Le [rapport d’implémentation](ameliorations-ia-2026-11-03.md) décrit les autres points retenus.

Le résultat attendu est une campagne reproductible, des défauts reproduits puis revérifiés, et un relevé explicite des limites. Une exécution sans erreur ne signifie pas que toute transcription ou suggestion est correcte.

## Corpus et méthode

Quinze fichiers ont été générés depuis la session fal connectée dans Safari, par computer use : six voix de stock ElevenLabs, quatre langues supplémentaires, deux dictées longues et trois témoins avec [Kokoro français](https://fal.ai/models/fal-ai/kokoro/french). Les textes sont inventés et conservés dans les fixtures JSON. Aucun manuscrit personnel n’a été transmis. Les crédits affichés sont passés de 4,41 à 3,53 USD : environ **0,88 USD**, sous le plafond volontaire de 3 USD. Le calcul par caractères donne 0,868 USD ; le solde affiché est arrondi.

Les fichiers sources téléchargés, empreintes, voix, langues, graines lorsqu’elles existent, URL de résultat et tarifs observés sont dans `artifacts/ai-2026-11-03/validation-elargie/voice-generation-ledger.json`. Les dérivés PCM sont séparés des sources : bruit rose déterministe à 20/10/5 dB de SNR global, vitesses 0,85 et 1,20, canal 8 kHz, silence et bruit seul. Les essais emploient les vrais chemins Rust/Python de Parakeet et Cleanup, avec le lexique construit depuis les fiches typées d’un projet temporaire.

La matrice finale compte **85 cas**, dont les témoins de fichier corrompu, dépassement de taille, modèle absent, processus perdu puis reprise. Ils se terminent avec zéro erreur inattendue et arrêt explicite des workers. Cela valide les chemins de traitement et de récupération, pas une exactitude sémantique de 100 %.

Le WER compare la transcription au script demandé au synthétiseur. Il ne distingue donc pas une mauvaise prononciation du synthétiseur d’une erreur de reconnaissance. Le rapport conserve un score strict (casse, ponctuation, accents et nombres écrits) et un score canonique qui ignore ces différences de forme selon les règles déclarées. Aucune référence ni aucun seuil de modèle n’a été retouché après les sorties.

| Fichiers propres — score canonique du brut | Mots de référence | Erreurs | WER |
| --- | ---: | ---: | ---: |
| Français, six voix de stock anglophones, passages courts | 384 | 225 | 58,6 % |
| Français, témoin Kokoro, deux passages courts | 128 | 9 | 7,0 % |
| Français, témoin Kokoro de 3 min 22 s | 639 | 31 | 4,9 % |
| Anglais | 49 | 1 | 2,0 % |
| Espagnol | 52 | 2 | 3,8 % |
| Allemand | 46 | 1 | 2,2 % |
| Italien | 48 | 1 | 2,1 % |

Les voix de stock anglophones produisent des sorties françaises parfois mélangées à l’anglais. Le témoin français ajouté ensuite conserve les mêmes scripts et sert de contrôle exploratoire ; il n’est pas une validation indépendante choisie avant les premiers résultats. Les noms inventés restent difficiles : seuls quatre noms complets sur huit sont retrouvés, accents ignorés, dans les deux témoins français courts. Les cinq dernières paroles et les noms font l’objet de métriques distinctes. Les variations avec bruit ne justifient pas une affirmation générale de robustesse : certaines perturbations modifient aussi le choix implicite de langue du modèle.

## Défauts corrigés pendant la campagne

1. **Négations de révision.** Le filtre pouvait accepter des remplacements proches comme `not` → `now`, `kein` → `klein`, `non` → `nom`. Les suggestions grammaticales et celles du modèle partagent maintenant les protections multilingues, contractions comprises. Les régressions sont dans `tests/revision-suggestions.test.ts`.
2. **Mémoire des dictées longues.** L’appel Parakeet sur le fichier entier a provoqué une pression mémoire critique avec le témoin de 3 min 49 s ; le watchdog a arrêté la passe. Le traitement après enregistrement utilise désormais des blocs de 30 s avec recouvrement de 5 s et fusion des tokens horodatés de la bibliothèque installée. Le même fichier finit ensuite en environ 14–15 s pour l’ASR ; les passes finales ne rencontrent plus de pression critique. Il ne s’agit pas d’une activation du streaming.
3. **Module de capture refusé par la sécurité.** La construction Vite incorporait le petit AudioWorklet dans une URL `data:`, refusée par la CSP. L’import force désormais l’émission d’un fichier local distinct. La vérification du bundle confirme la présence de `capture.worklet-*.js` et l’absence de cette incorporation.
4. **Crash de LanguageTool en allemand.** JNA 5.12.1 avortait pendant la recherche de la bibliothèque Hunspell. Le chargement direct du binaire ARM fourni fonctionne ; la [correction amont de JNA 5.13.0](https://github.com/java-native-access/jna/blob/5.13.0/CHANGES.md) supprime l’avortement lors des messages d’erreur natifs trop longs. Les deux JAR sont épinglés et vérifiés. Les anciens fichiers de l’installation locale sont sauvegardés avant remplacement.
5. **Dictionnaire allemand trop volumineux.** Après le premier correctif, les suggestions sur un nom inconnu déclenchaient un `OutOfMemoryError` dans le tas Java de 512 Mio. Le plafond explicite est passé à 768 Mio. Le même corpus multilingue passe ensuite les moteurs et le filtre d’affichage.
6. **Première autorisation du microphone.** Dans le build isolé, la demande WebKit restait en attente sans invite visible. Le début de dictée demande maintenant explicitement l’autorisation audio par AVFoundation avant d’ouvrir le flux WebKit. Le refus est respecté et une annulation pendant l’attente empêche toute capture tardive. Ce chemin est couvert par les tests de gestes et par la capture réelle décrite ci-dessous ; aucune autorisation caméra n’est demandée.

Pour une installation existante, la réparation ciblée des bibliothèques se reproduit avec `python3 scripts/setup-revision.py --repair-jna`. L’installateur neuf applique également ces versions. Les tests vérifient les empreintes avant toute substitution, la sauvegarde des fichiers précédents et l’idempotence.

Sur les seize passages de révision anglais/espagnol/allemand/italien, les sorties avec contexte retrouvent quatre des cinq corrections attendues, sans suggestion non annotée ; une correction reste manquée. Sans contexte, quatre propositions non annotées apparaissent. Ce petit jeu ne constitue pas une estimation statistique de la précision. Les 64 appels natifs LanguageTool/Salamandra et le filtre TypeScript sont réellement exécutés.

## Grand projet et endurance

Le projet de recette contient **2 000 scènes, 40 000 nœuds d’outline et 2 500 sources**, soit environ 11,24 millions de caractères et 1,8 million de mots affichés. Les vecteurs de sources sont synthétiques normalisés : ce parcours mesure stockage, recherche et interface, pas leur pertinence sémantique.

Pendant une charge vocale de fond, le parcours natif WKWebView valide sauvegarde/réouverture et annuler/rétablir. Sur 120 insertions scriptées, le p95 de l’appel d’édition est de 13 ms et celui de la prochaine frame de 22 ms. L’ouverture IPC prend 2,47 s puis le montage de l’éditeur 4,03 s. La recherche complète du manuscrit trouve 200 000 occurrences en 1,29 s, avec 68 frames peintes et 200 résultats visibles au maximum. La recherche documentaire à froid prend 13,9 s ; le p95 chaud est de 121 ms. Ce sont des observations de cette passe sous charge, pas une comparaison avant/après ni une mesure de frappe humaine.

Une première préparation sur le Bureau est restée bloquée dans une ouverture de répertoire par SQLite ; le projet a été relancé dans le répertoire temporaire habituel. Les données et diagnostics de la première tentative sont conservés. Le contrôle accessoire des marges ne valide pas leur suivi au défilement : aucun déplacement n’a été obtenu dans ce témoin. Les libellés sont absents aux deux petites largeurs ; cela ne constitue pas une certification générale de disposition.

L’endurance dure **917 s**, avec dix minutes de requêtes puis 310 s d’observation du repos : **116 requêtes de transcription, 39 cycles, aucune erreur**. Elles comprennent 38 témoins silencieux, sans inférence neuronale sur le silence. Le même processus ASR et le même Cleanup sont réutilisés ; chaque type de cas produit toujours le même brut. Le RSS total médian des processus suivis passe d’environ 1 213 Mio en début de charge à 1 173 Mio à la fin ; ce témoin ne montre pas de croissance continue. Le maximum observé est de 2 107 Mio. Le RSS ne mesure pas toute la mémoire Metal.

La méthode de libération de production, appelée toutes les deux secondes par le harnais, libère Cleanup après environ 88 s d’observation et Parakeet après 295 s ; leur dernière utilisation précède légèrement le début de cette observation. Les deux PID sont absents à la fin. Les états système observés sont normal et avertissement ; aucune pression critique n’apparaît dans cette endurance. Une seule séance de dix minutes ne démontre pas l’absence de fuite sur plusieurs heures.

## Capture et vérification finale

Le microphone physique **« Micro iMac »** fournit **40 960 échantillons à 48 kHz** pendant le contrôle d’environ une seconde, par `getUserMedia` puis le véritable AudioWorklet. Le pic mesuré est 0,0105 et le RMS 0,00107 : des trames non nulles arrivent bien du périphérique système. Seuls ces compteurs sont conservés, sans fichier audio du microphone. macOS affiche ensuite l’autorisation du build de recette comme activée. La réception de trames ne constitue pas une mesure de précision sur une voix humaine.

Le second parcours décode le fichier synthétique français de 18,825 s en `MediaStream`, puis emploie la capture, l’encodage, les moteurs locaux et l’insertion ordinaires. La négation et le dernier mot sont conservés, le texte précédent reste intact, la sauvegarde est rouverte et annuler/rétablir restitue exactement les deux états. Les pistes sont arrêtées. La dernière passe, pendant la compilation de vérification, prend 41,9 s depuis le début de la lecture ; une passe précédente plus calme prenait 26,0 s. Ces durées comprennent la lecture en temps réel et ne sont pas une comparaison de performances. Les noms restent imparfaits dans la transcription insérée.

Le résultat est dans `native-speech-authorized/report.json`. L’application de recette est quittée par son menu ; ses trois PID observés sont contrôlés après la fermeture. Les réglages système consultés sont revenus à leur page initiale.

`npm run verify` réussit sur le code final : **299 tests TypeScript, 27 Python, 136 Rust**, build, vérification des ressources et Clippy (`verify-authorized-final.log`). Deux essais TypeScript et douze essais Rust sont exclus par défaut ; les campagnes de moteurs décrites ci-dessus sont exécutées séparément. Les avertissements de taille de chunks du build ne sont pas des erreurs de compilation.

Après passage des manifestes à 0.2.2, la suite complète réussit de nouveau (`verify-0.2.2.log`) et le panneau macOS « À propos » affiche `0.2.2 (0.2.2)`. Le bundle est reconstruit séparément de la suite pour éviter des écritures simultanées dans `dist`. Le scénario avec précontrôle du microphone physique réussit ensuite : 40 960 échantillons à 48 kHz, transcription synthétique, sauvegarde, annulation/rétablissement et arrêt des pistes (`native-0.2.2-probe/`). Un lancement automatisé sans ce précontrôle avait expiré avant l’état d’enregistrement (`native-0.2.2-startup/`) ; la cause exacte de ce blocage du scénario synthétique n’est pas établie. Les PID propres aux deux essais ont disparu après fermeture.

Le suffixe du paquet de test a ensuite été retiré ; le nom retenu pour l’application est `ariane`, tout en minuscules. La suite complète réussit après harmonisation des libellés et des chemins de construction (`verify-0.2.2-lowercase.log`). L’identité des données et les liens de projet restent identiques.

Machine vérifiée : iMac21,1, Apple M1, 16 Go de RAM, alimentation secteur. L’autonomie ne peut pas être mesurée sur cet iMac sans batterie. `powermetrics` exige des privilèges indisponibles dans cette session : aucune mesure de watts ou d’énergie n’est revendiquée. Les CPU/RSS sont des indicateurs de charge. Les voix humaines, les accents régionaux réels, les autres Mac et les séances de plusieurs heures restent hors de la preuve obtenue.

Les preuves locales sont dans `artifacts/ai-2026-11-03/validation-elargie/`, notamment `speech-final/`, `endurance/`, `native-large-success/`, `native-speech-authorized/`, `revision-multilingual-768.json` et `verify-authorized-final.log`. Les scripts et fixtures sont destinés au dépôt ; médias et résultats restent locaux. Cette campagne précède l’intégration des changements dans la [version 0.2.2](release-notes-0.2.2.md). Aucun paquet public ni activation du point 18 ne découle de ces essais.

## Reproduction

Les téléchargements et générations ne sont pas relancés automatiquement : les scripts d’enregistrement ne font que télécharger une URL de résultat déjà observée. Le ledger et les fixtures permettent de réutiliser les mêmes sources. Pour les moteurs installés, utiliser de nouveaux chemins de sortie :

```sh
python3 scripts/benchmark-speech-stress.py --manifest artifacts/ai-2026-11-03/validation-elargie/speech-combined-manifest.json --output /tmp/ariane-speech-validation
python3 scripts/benchmark-speech-stress.py --manifest artifacts/ai-2026-11-03/validation-elargie/speech-endurance-manifest.json --output /tmp/ariane-speech-endurance --timeout-seconds 1200
python3 scripts/benchmark-revision.py --corpus benchmarks/fixtures/ai/revision-multilingual.json --output /tmp/ariane-revision-multilingual.json
VITE_PERFORMANCE=1 npm run tauri build -- --debug --features performance-harness --config scripts/performance-config.json --bundles app
python3 scripts/benchmark-native.py 'src-tauri/target/debug/bundle/macos/ariane.app' /tmp/ariane-large --large
python3 scripts/benchmark-native.py 'src-tauri/target/debug/bundle/macos/ariane.app' /tmp/ariane-speech --speech-audio artifacts/ai-2026-11-03/validation-elargie/audio/fr-control-a-clean.wav --microphone-probe
npm run verify
```

Les WAV et manifestes dérivés sont locaux, ignorés par Git. Pour les recréer depuis les sources conservées, lancer `scripts/prepare-speech-stress.py` avec le Python installé de la dictée ; le témoin français possède sa fixture distincte `speech-french-control.json`. La reproduction de jeux déjà consultés reste une régression connue, pas une nouvelle validation aveugle.
