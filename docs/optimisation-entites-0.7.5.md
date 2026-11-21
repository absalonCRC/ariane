# Synchronisation des passages et gestionnaire d’entités

21 novembre 2026 · Branche `codex/0.7.5`. La référence avant optimisation reprend la 0.7.2 et les deux correctifs de sécurité déjà appliqués, dont SQLite 3.54.1. Les deux binaires de mesure embarquent le même frontend Vite et utilisent Tauri en profil Rust `dev`, WKWebView et les mêmes ressources.

## Changements

- La synchronisation vérifie l’état d’une scène et ouvre une transaction d’écriture seulement si ses passages ont changé. Elle relit la révision après acquisition du verrou SQLite. Un nouveau passage entre directement dans FTS5. Le remplacement ou le retrait d’un passage supprime les entrées antérieures. Le schéma et les formats de projet sont conservés.
- La requête du gestionnaire réutilise une connexion SQLite, la vue des sources autorisées et un seul catalogue de reconnaissance pour le projet. Les résultats dérivés sont écrits par groupes de 32 au maximum, avec contrôle du catalogue de sources avant et après commit. Une bascule de projet interrompt la collecte entre deux scènes.
- La détection de la scène affichée synchronise cette scène. Les tâches de mémoire gardent leurs propres lots et leur priorité. Les identités de passages, offsets UTF-16, règles d’entités, vecteurs existants, champs IPC et contrôles d’autorisation gardent leur rôle.

## Protocole et résultats sur 6 et 100 scènes

Sur le même iMac M1, 16 Gio, macOS 26.6 (`25G5052e`), le lanceur exécute trois sessions fraîches et trois réouvertures par corpus et par binaire. Les corpus contiennent respectivement 6 et 500 notes de départ. Le délai de stabilisation commence quand l’éditeur est visible. Il comprend 600 ms d’attente de déclenchement, puis le temps jusqu’à ce que le verrou du projet ne soit plus référencé par des commandes en cours. C’est une mesure du parcours natif complet, qui englobe le travail du gestionnaire et les autres requêtes du projet. Les démarrages relancent le processus sur un profil synthétique et le cache système reste en place. [Protocole complet](reference-performance-0.7.5.md)

| Mesure | 6 scènes avant | 6 scènes après | 100 scènes avant | 100 scènes après |
| --- | ---: | ---: | ---: | ---: |
| Éditeur visible après demande d’ouverture, médiane | 142 ms | 140 ms | 209 ms | 208 ms |
| Stabilisation, médiane | 602 ms | 603 ms | 12,945 s | **1,662 s** |
| Stabilisation, maximum sur trois sessions | 602 ms | 604 ms | 13,255 s | **1,730 s** |
| Réouverture, médiane | 773 ms | 713 ms | 807 ms | 812 ms |
| Frappe jusqu’au prochain rappel d’affichage, p95 | 18 ms | 19 ms | 18 ms | 19 ms |
| Frappe pendant l’indexation lexicale, p95 | 20 ms | 20 ms | 21 ms | 22 ms |
| Sauvegarde après édition, médiane / p95 | 19 / 24 ms | 20 / 26 ms | 19 / 31 ms | 19 / 25 ms |
| Recherche dans la scène, p95 | 19 ms | 18 ms | 18 ms | 19 ms |
| Recherche de sources à chaud, p95 | 10 ms | 8 ms | 28 ms | 25 ms |
| Comparaison à chaud, p95 | 87 ms | 84 ms | 116 ms | 114 ms |
| Retour au projet mesuré, médiane / p95 | 86 / 108 ms | 86 / 101 ms | 166 / 167 ms | 163 / 180 ms |
| Publication de 128 notes sous frappe, médiane | 783 ms | 773 ms | 1 011 ms | 1 093 ms |
| Temps CPU médian du processus Ariane, cycle complet | 6,23 s | 5,74 s | 31,08 s | 15,77 s |
| RSS du processus Ariane, pic échantillonné | 138 Mio | 140 Mio | 167 Mio | 172 Mio |

Sur 100 scènes, le temps de stabilisation est divisé par **7,8**, avec un temps CPU du processus Ariane inférieur de **49 %** sur le cycle complet. La frappe au p95 varie d’une milliseconde. L’indexation lexicale des sources sur le grand corpus a pris 82 ms de plus en médiane lors de cette campagne. Ces observations décrivent un profil de développement sur un Mac et un nombre limité de répétitions.

## Scénario de stress à 2 000 scènes

Un lancement par binaire. Les deux dossiers synthétiques contiennent 11,24 millions de caractères, 40 000 passages et 2 500 notes de départ. Le banc fixe une limite de 60 s pour la stabilisation après ouverture.

| Mesure | Avant | Après |
| --- | ---: | ---: |
| Éditeur visible après demande d’ouverture | 1,613 s | 1,531 s |
| Stabilisation après ouverture | > 60 s, essai arrêté | **39,365 s** |
| Passages SQLite et FTS5 présents à la fin de l’essai | 11 520 sur 40 000 | **40 000 sur 40 000** |
| RSS du processus Ariane, pic dans les 30 premières secondes du lancement | 254 Mio | 249 Mio |

Sur ce corpus, le gain de stabilisation est d’au moins **20,6 s**, soit **34 %** par rapport à la borne de 60 s. Le temps exact du binaire de référence au-delà de cette limite reste inconnu. Les 11 520 passages du relevé avant proviennent de la base après arrêt de l’application, qui comprend son délai de fermeture. Le binaire optimisé a ensuite terminé l’écriture, la sauvegarde, la recherche, la comparaison de versions, six bascules de projet, trois lots d’indexation et la réouverture. Le p95 de frappe était de 24 ms hors indexation et de 22 ms pendant l’indexation, avec 90 échantillons par condition. La réouverture a retrouvé le texte et le curseur en 2,162 s. Le RSS maximal du processus Ariane a atteint 688 Mio sur le cycle complet optimisé, qui comprend les phases ultérieures de chargement et de comparaison.

## Vérification et preuves

Les six couples d’essais complets sur 6 et 100 scènes conservent exactement les mentions et leurs offsets pour les passages hors scène éditée. La comparaison rapproche les identifiants dérivés des deux dossiers par le chemin relatif des fichiers sources. Après édition, les bases correspondent aux miroirs Markdown. La réouverture vérifie le texte et la position du curseur. Les tests ciblent aussi l’équivalence des réponses d’une scène et du projet, le changement de texte, le retrait d’une scène, le cache FTS5 et l’interruption entre deux scènes.

`RUST_TEST_THREADS=1 VITEST_MAX_WORKERS=2 npm run verify` a réussi avec 676 tests passés, dont 212 Rust, ainsi que le build et Clippy. Les deux tests TypeScript et douze Rust ignorés par défaut gardent leur statut.

Les rapports natifs, les séries d’échantillons de processus, les agrégats et les empreintes de sources sont dans `artifacts/0.7.5-entites/avant/` et `artifacts/0.7.5-entites/apres/`. Le frontend et les ressources sont communs. Les comparaisons portent sur la frappe scriptée dans CodeMirror. La qualification d’un build de distribution, de l’IME et des modules sémantiques facultatifs reste distincte. [Lanceur et options](../scripts/benchmark-reference.py)

```sh
python3 scripts/benchmark-reference.py "$bundle_de_mesure" "$nouveau_dossier/campagne" --repeat 3
python3 scripts/benchmark-reference.py "$bundle_de_mesure" "$nouveau_dossier/stress" --repeat 1 --size stress
```
