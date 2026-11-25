# Recette du candidat ariane 0.8.1

24 novembre 2026 · Mac Apple M1, 16 Go, macOS 26.6 (25G5052e). Le parcours natif utilise un projet synthétique, une application nommée **ariane** et l’identifiant isolé `fr.ariane.writer.passage081-synthetique`. [Plan détaillé](plan-0.8.1.md) · [Instructions de lecture](usage.md#lire-et-annoter-une-sélection-sur-mac)

## Capsule et modèles à la demande

Sur un profil synthétique distinct, la recherche sémantique fonctionnait dès l’accueil avec EmbeddingGemma comme seul modèle. Le bouton **Modèles locaux** a ouvert le choix dans la capsule supérieure. Dans un projet vide, la demande de dictée est restée visible pendant la saisie, la sauvegarde, l’ouverture des paramètres et le retour au manuscrit. La croix l’a fermée. Les tests d’interface couvrent également un échec de téléchargement, son interruption, le réessai et la coexistence avec une autre notification. [Accueil](../artifacts/validation-0.8.1/capsule-accueil.png) · [Dictée pendant l’écriture](../artifacts/validation-0.8.1/capsule-dictee.png) · [Tests](../tests/model-selection.test.tsx)

À 760 points de largeur, le choix de l’espagnol et le bouton de téléchargement tenaient dans la capsule centrée. Choisir la langue a laissé le profil intact. Le téléchargement explicite a installé Lola et l’aligneur partagé. Un nouveau clic sur le haut-parleur a lu la sélection et souligné « Elena ». Les voix française et anglaise ont ensuite été installées depuis les paramètres. Les trois langues ont produit un WAV avec un alignement. La réouverture a restitué le texte et les trois voix. [Première lecture](../artifacts/validation-0.8.1/capsule-premiere-lecture.png) · [Paramètres](../artifacts/validation-0.8.1/capsule-parametres.png) · [Résultats natifs](../artifacts/validation-0.8.1/capsule-parcours.json) · [Réouverture](../artifacts/validation-0.8.1/capsule-reouverture.json)

Sur le clavier français de ce Mac, **⌘ ⇧ M** a affiché la demande de dictée et **Espace** sur la croix l’a fermée. Le premier essai de lecture après redimensionnement a perdu le focus de la fenêtre de recette. La passe complète a repris avec la fenêtre synthétique au premier plan et une nouvelle sélection du passage. [Contrôle clavier](../artifacts/validation-0.8.1/capsule-clavier.log)

La vérification complète a réussi avec 27 tests Python, 452 tests TypeScript et 222 tests Rust actifs. Deux tests TypeScript et douze tests Rust sont ignorés. Une première exécution concurrente à la construction de l’application de recette a échoué pendant les doctests Rust avec des bibliothèques de compilation manquantes. La suite complète, les doctests et Clippy ont ensuite abouti en séquençant les compilations. [Vérification finale](../artifacts/validation-0.8.1/capsule-verification-finale.log)

Le paquet macOS 0.8.1 occupe 715,6 Mio et contient EmbeddingGemma comme seul modèle. La signature ad hoc et les 25 ressources du paquet ont été vérifiées. Ce candidat local reste à notariser. [Inventaire](../artifacts/validation-0.8.1/capsule-bundle.json) · [Construction](../artifacts/validation-0.8.1/capsule-paquet.log)

## Choix de la voix

| Moteur examiné | Conséquence pour ariane |
| --- | --- |
| Pocket TTS compact | Binaire arm64 autonome, voix préparées pour les trois langues, poids CC BY 4.0. Le premier candidat consacrait environ 732 Mo à la lecture, trois langues et aligneur compris. Chaque synthèse charge un seul modèle de langue. [Poids et licence](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning) · [Distribution](https://github.com/kyutai-labs/pocket-tts/releases/tag/v4.0.1) |
| Pocket TTS français 24 couches | Sur la même phrase et le même M1, le moteur a produit 6,40 s de voix en 6,45 s, avec 2,14 Go de RSS maximale. Le modèle compact a produit 6,64 s en 3,16 s avec 0,87 Go. Ces durées de synthèse excluent l’initialisation et l’alignement. [Mesure 24 couches](../artifacts/validation-0.8.1/pocket-tts-24l.log) · [Mesure compacte](../artifacts/validation-0.8.1/pocket-tts-fr-m1.log) |
| Kokoro 82M | Option compacte pour les trois langues. L’auteur documente une seule voix française, SIWIS, évaluée B− dans son propre catalogue. [Catalogue des voix](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| Phonon | L’anglais existe en 31M sous Apache 2.0. Les poids français et espagnols 40M sont publiés avec une restriction d’usage commercial. [Modèles et licences](https://github.com/gradium-ai/xn-ptts#models-and-voices) |
| Qwen3-TTS | Les trois langues sont prises en charge. Le plus petit modèle officiel comporte 600 millions de paramètres. [Configurations](https://github.com/QwenLM/Qwen3-TTS#overview) |

La décision privilégie l’exécution locale et la disponibilité des trois voix avec un même moteur. Seules les variantes Pocket ont fait l’objet de mesures sur ce Mac. Le naturel de la prosodie reste à apprécier à l’écoute.

## Résultats vocaux

| Langue du document | Voix | Mots successivement soulignés dans WKWebView | Échantillon de la voix |
| --- | --- | --- | --- |
| Français | Estelle | Élise, revient | [Écouter le WAV](../artifacts/validation-0.8.1/lecture-fr.wav) |
| Anglais | Alba | Anna, finds | [Écouter le WAV](../artifacts/validation-0.8.1/lecture-en.wav) |
| Espagnol | Lola | Elena, guarda | [Écouter le WAV](../artifacts/validation-0.8.1/lecture-es.wav) |

Le parcours a activé **Écouter la sélection** depuis le manuscrit. Les lectures anglaise et espagnole sont arrivées à leur terme. Échap a interrompu la lecture française, puis la décoration a disparu. Le texte des trois sélections est resté identique. Pendant la première passe, d’autres compilations et une transcription tournaient sur le Mac. Le délai clic → premier mot souligné s’étendait de 4,77 à 10,24 s. Il inclut la génération du premier segment, l’alignement et la position du premier mot dans l’audio. [Rapport de la première passe](../artifacts/validation-0.8.1/trilingual.json)

Les trois WAV ci-dessus ont été produits avec un cache Hugging Face vide, le mode hors ligne et un proxy injoignable. Le même paquet a aligné une phrase française comportant une plume emoji, des apostrophes typographiques et un accent décomposé. Parakeet, utilisé comme contrôle indépendant, retrouve les phrases anglaise et espagnole. Sur l’extrait français, il transcrit « sur lequel » pour « sur le quai ». Ce contrôle mesure la chaîne synthèse–reconnaissance. L’écoute sur haut-parleur et le jugement humain sur les trois accents restent à qualifier. [Transcriptions](../artifacts/validation-0.8.1/trilingue-parakeet.jsonl) · [Alignement Unicode](../artifacts/validation-0.8.1/unicode.log)

Sur la dernière passe dans le bundle, le premier mot s’est souligné après **2,59 s en français**, **3,89 s en anglais** et **3,01 s en espagnol**. Il s’agit d’un passage par langue, avec des phrases de longueurs différentes. [Parcours natif final](../artifacts/validation-0.8.1/parcours-final.json)

## Manuscrit, annotations et navigateur

Dans le projet synthétique vide, une transcription Parakeet issue d’un WAV a été enregistrée en marge avec deux notes saisies. Le contrôle a ouvert la note du milieu puis l’a repliée. Les trois titres étaient accessibles au pointeur à 760 points de largeur et l’ordre est resté stable. Après fermeture et réouverture, la pile et les deux extrémités de la relation étaient toujours présentes. Les tests de la commande de dictée exercent aussi la destination annotation avec un microphone simulé. La prise humaine et le refus de permission dans une fenêtre système réelle restent à qualifier. [Réouverture](../artifacts/validation-0.8.1/reouverture.json) · [Tests vocaux](../tests/voice-button.test.tsx)

Chrome a ouvert le build de production, créé un projet vide, saisi du texte et ouvert la barre de sélection au clavier. Les actions disponibles correspondaient à l’adaptateur navigateur, sans exception JavaScript relevée. [Résultat navigateur](../artifacts/validation-0.8.1/navigateur.json)

Dans la passe finale, la relation relie « Élise » dans la première scène à « Paul » dans *Le quai*. La destination et le retour à l’origine ont été activés dans la marge, puis de nouveau après réouverture. Les deux fichiers Markdown reproduisent exactement le texte des scènes conservé dans SQLite, sans le contenu des annotations. [Parcours](../artifacts/validation-0.8.1/parcours-final.json) · [Réouverture du projet à deux scènes](../artifacts/validation-0.8.1/reouverture-finale.json) · [Miroirs](../artifacts/validation-0.8.1/miroirs.json) · [Capture de la marge](../artifacts/validation-0.8.1/pile-finale.png)

## Premier candidat avec poids embarqués

Le bundle optimisé porte la version 0.8.1, l’identifiant habituel `fr.ariane.writer` et une signature ad hoc vérifiée avec `codesign --verify --deep --strict`. Le vérificateur a comparé les 38 ressources du paquet aux empreintes attendues. Le paquet occupe 1,36 Gio. Le binaire a été construit localement, sans notarisation ni publication. [Vérification du bundle](../artifacts/validation-0.8.1/bundle-final.log)

## Contrôles du premier candidat

Le contrôle d’architecture couvre 119 noms IPC. La vérification des ressources, les 27 tests Python de packaging, le build de production et les 447 tests TypeScript actifs ont abouti. Deux tests TypeScript sont ignorés. Un premier passage du test de navigation entre pages a dépassé ses cinq secondes lorsque les deux bundles compilaient en parallèle. Le test a réussi avec son délai d’origine lors du passage suivant. [Contrôles et suite TypeScript](../artifacts/validation-0.8.1/verification-complete.log)

Les témoins de migration v3 et v4 attendaient encore le schéma 7 et l’un utilisait 8 comme exemple de version future. Ils vérifient désormais le schéma 8, la copie historique, et le refus d’une version supérieure. Le nouveau témoin v7 vérifie aussi la conservation exacte du JSON d’une annotation PDF dans les bases migrée et sauvegardée. La suite Rust rejouée après correction a réussi avec 220 tests actifs et 12 ignorés. Elle couvre la restauration partielle d’un lien, les réessais de dictée, l’arrêt d’un processus de lecture et le rejet d’une réponse périmée. [Résultats Rust](../artifacts/validation-0.8.1/rust-final.log)

Clippy a abouti sur toutes les cibles avec les avertissements traités comme erreurs. [Journal Clippy](../artifacts/validation-0.8.1/clippy-final.log)

Les scénarios de micro physique et les essais subjectifs de prosodie restent ouverts. Le lecteur PDF et l’export disposent de tests de régression dans les suites du dépôt. Leur recette interactive complète de la 0.8.0 n’a pas été rejouée dans cette passe.
