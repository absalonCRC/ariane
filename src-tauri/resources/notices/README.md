# Ressources tierces du paquet local

Poids distribués : [EmbeddingGemma 300M Q8 GGUF, ggml-org](https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF), dérivé de [Google EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m). Les poids relèvent des [conditions Gemma](https://ai.google.dev/gemma/terms), reproduites dans `EmbeddingGemma-300M-TERMS.txt` ; ils ne sont pas sous Apache-2.0. La fiche du modèle, l’origine, la révision, la taille et l’empreinte sont conservées dans ce dossier et `resources.lock.json`. Ariane ne modifie pas les poids téléchargés. La notice `EmbeddingGemma-2-LICENSE.txt` est conservée pour l’ancien modèle, qui n’est plus embarqué dans le paquet actif.

Moteurs : [llama.cpp](https://github.com/ggml-org/llama.cpp), [Pandoc](https://pandoc.org), [Typst](https://github.com/typst/typst), et bibliothèques liées provenant de Homebrew. Les versions, archives, empreintes et sources sont décrites dans `native-dependencies.lock.json`. La préparation copie les notices et formules des archives dans `native/`, puis relocalise et signe les exécutables de façon ad hoc. Voir `THIRD_PARTY.md` avant toute distribution binaire.

Styles bibliographiques : [Citation Style Language](https://github.com/citation-style-language/styles), APA et Chicago, avec leur notice de licence dans les en-têtes des fichiers CSL.

Police : EB Garamond via Fontsource, avec sa licence fournie. Le runtime système PDFKit n’est pas redistribué ; le petit extracteur Swift est compilé depuis `scripts/pdf-text.swift`.

Les licences des dépendances npm et Cargo restent disponibles dans les paquets et registres correspondants, avec les versions exactes dans `package-lock.json` et `Cargo.lock`.
