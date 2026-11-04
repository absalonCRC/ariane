# Ariane 0.2.2

Version de développement du 4 novembre 2026 pour macOS 26+ sur Apple Silicon. Les versions npm, Cargo et Tauri sont alignées sur `0.2.2`. Cette version regroupe les améliorations des moteurs locaux et les correctifs révélés par leur validation. Les poids des modèles restent identiques.

## Mémoire et recherche

Les passages sont encodés avec leur titre, dans un budget vérifié par le tokenizer. Un cache persistant propre au projet réutilise les résultats par nœud logique de l’outline. Les petits lots conservent les réponses terminées et reprennent les entrées manquantes. Le stockage binaire vérifie dimensions, valeurs et normalisation ; les anciens espaces de modèles restent distincts.

La recherche explicite fusionne les classements lexical et sémantique par RRF. Les titres et alias exacts non ambigus sont prioritaires. Les suggestions automatiques conservent leurs propres seuils de confiance ; un score de recherche n’est pas présenté comme une certitude.

Les entités disposent d’une politique de seuils par catégorie, de garde-fous sur les minuscules et d’un classement secondaire vers les types personnalisés. Les mentions homonymes non confirmées restent distinctes. Le classement des nouvelles fiches utilise une file persistante, avec reprise au repos et contrôle des modifications intervenues depuis sa création.

## Dictée et révision

Le lexique des noms est relu automatiquement depuis les fiches typées et les alias accessibles du projet. Les rapprochements incertains restent des propositions à vérifier. Cleanup reçoit les extraits avant et après le curseur, avec un budget borné et un repli sur la transcription brute. Le brut reste récupérable lorsqu’une mise au propre différente est proposée.

Les enregistrements longs sont traités après capture par blocs bornés avec recouvrement. Le moteur réutilise sa résidence selon l’usage puis se libère au repos ou sous pression mémoire. Le module AudioWorklet est chargé comme fichier local, et macOS reçoit une demande explicite d’autorisation audio avant la capture. Un refus ou une annulation pendant cette demande empêche l’ouverture tardive du microphone.

La révision affiche les propositions grammaticales avant le complément du modèle. Le contexte voisin reste en lecture seule ; une modification du texte invalide les réponses encore en cours. Les changements de nombres, noms protégés et négations sont filtrés, y compris pour les autres langues proposées. JNA 5.13.0 corrige le chargement natif de Hunspell ; le tas Java est borné à 768 Mio pour permettre les suggestions du dictionnaire allemand.

Le point 18, streaming Parakeet, est exclu de cette version. Le mode de traitement par fichiers est conservé.

## Validation et limites

La suite locale complète réussit avec 299 tests TypeScript, 27 Python, 136 Rust, build et Clippy. Les essais de moteurs facultatifs sont séparés de cette suite : 85 cas audio, seize passages de révision en anglais/espagnol/allemand/italien, 116 requêtes d’endurance et les parcours natifs de capture et de sauvegarde. Le microphone physique de l’iMac et l’AudioWorklet reçoivent des trames à 48 kHz. Un projet synthétique de 2 000 scènes et 2 500 sources est également exercé.

Ces résultats concernent un iMac M1 de 16 Go et des scripts vocaux synthétiques. Les noms inventés et certaines voix accentuées restent difficiles. La capture du microphone ne prouve pas la précision sur des voix humaines ; les autres Mac, l’autonomie, l’énergie et les séances de plusieurs heures ne sont pas qualifiés. Le [rapport détaillé](validation-ia-2026-11-04.md) distingue mesures, échecs reproduits, corrections et limites. Le [rapport des moteurs](ameliorations-ia-2026-11-03.md) conserve les comparaisons de calibration et validation.

Pour une installation de révision existante, `python3 scripts/setup-revision.py --repair-jna` remplace uniquement les deux bibliothèques JNA vérifiées et conserve les précédentes. Les nouvelles installations appliquent directement ces versions.

L’application reste expérimentale, construite localement et signée ad hoc. La publication d’un paquet à télécharger conserve les prérequis de [signature, notarisation et validation d’installation](releasing.md).
