# Ressources tierces du paquet local

Poids distribués : [EmbeddingGemma 300M Q8 GGUF, ggml-org](https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF), dérivé de [Google EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m). Les poids relèvent des [conditions Gemma](https://ai.google.dev/gemma/terms), reproduites dans `EmbeddingGemma-300M-TERMS.txt` ; ils ne sont pas sous Apache-2.0. La fiche du modèle, l’origine, la révision, la taille et l’empreinte sont conservées dans ce dossier et `resources.lock.json`. Ariane ne modifie pas les poids téléchargés. La notice `EmbeddingGemma-2-LICENSE.txt` est conservée pour l’ancien modèle, qui n’est plus embarqué dans le paquet actif.

Moteurs : [llama.cpp](https://github.com/ggml-org/llama.cpp), [Pandoc](https://pandoc.org), [Typst](https://github.com/typst/typst), et bibliothèques liées provenant de Homebrew. Les versions, archives, empreintes et sources sont décrites dans `native-dependencies.lock.json`. La préparation copie les notices et formules des archives dans `native/`, puis relocalise et signe les exécutables de façon ad hoc. Voir `THIRD_PARTY.md` avant toute distribution binaire.

Styles bibliographiques : [Citation Style Language](https://github.com/citation-style-language/styles), APA et Chicago, avec leur notice de licence dans les en-têtes des fichiers CSL.

Police : EB Garamond via Fontsource, avec sa licence fournie. Le runtime système PDFKit n’est pas redistribué ; le petit extracteur Swift est compilé depuis `scripts/pdf-text.swift`.

Les licences des dépendances npm et Cargo restent disponibles dans les paquets et registres correspondants, avec les versions exactes dans `package-lock.json` et `Cargo.lock`.

## Lecture de sélection

Pocket TTS est développé par Kyutai (code MIT). ariane embarque le binaire Rust arm64 3.3.0 de la distribution v4.0.1. Les modèles préentraînés français, anglais et espagnol de Kyutai (CC BY 4.0) et les empreintes de voix sont téléchargés à la demande sans modification. Les configurations YAML sont adaptées pour lire des chemins locaux. [Code et distribution](https://github.com/kyutai-labs/pocket-tts/releases/tag/v4.0.1) · [Poids et licence](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

La voix anglaise Alba provient de l’enregistrement « Casual » d’Alba MacKenna (CC BY 4.0). La voix française Estelle utilise « developpeuse-3 » de Kyutai (CC0). La voix espagnole Lola provient de l’extrait Common Voice espagnol 19762977 préparé par Kyutai. Le téléchargement de chaque langue inclut l’empreinte préétablie de sa voix. [Correspondance des voix](https://github.com/kyutai-labs/pocket-tts/blob/v4.0.1/pocket_tts/utils/utils.py) · [Crédits des voix](https://huggingface.co/kyutai/tts-voices)

L’aligneur est compilé avec whisper.cpp v1.9.6 (MIT) et utilise Whisper tiny multilingue d’OpenAI (MIT) en quantification Q5_1 préparée par ggerganov. Les textes des licences accompagnent le paquet. [whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/v1.9.6) · [Whisper](https://github.com/openai/whisper) · [Modèle quantifié](https://huggingface.co/ggerganov/whisper.cpp)
