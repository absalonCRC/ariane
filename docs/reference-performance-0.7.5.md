# Référence de performance avant la 0.7.5

21 novembre 2026 · Ariane 0.7.2, commit `464bbac0f79f44af4ba56e58c6871154ed8f9b30`. iMac M1 ARM64 (`iMac21,1`, 8 cœurs, 16 Gio), macOS 26.6 (`25G5052e`). Les mesures utilisent le frontend optimisé de Vite et le profil Rust `dev` de Tauri avec WKWebView, dans un bundle signé ad hoc. Les latences du binaire de distribution optimisé restent à mesurer au même protocole.

## Protocole

- Le petit projet contient 6 scènes et 6 notes. Le grand contient 100 scènes et 500 notes. Une scène commence à 5 620 caractères et 20 nœuds d’outline dans les deux cas. Le mode scène et le réglage d’enrichissement désactivé rendent la comparaison des parcours d’écriture reproductible. Un corpus de stress séparé contient 2 000 scènes et 40 000 nœuds.
- Un lancement **frais** démarre un nouveau processus sans projet enregistré. La première ouverture mesure séparément l’aller-retour IPC et l’arrivée de l’éditeur. Une **réouverture** redémarre le processus sur la session déjà enregistrée et vérifie le texte, la scène et la position du curseur. Le cache système reste en place.
- Une **frappe** est une insertion scriptée avec la commande qui applique la transaction CodeMirror, au rythme de l’affichage. Les durées couvrent la commande synchrone et le délai jusqu’au prochain `requestAnimationFrame`. Le geste clavier et l’IME restent distincts. Les sauvegardes mesurent le vidage de la file avec des modifications en attente, temporisation d’autosauvegarde exclue.
- La recherche active dans le manuscrit sélectionne une expression de plusieurs mots dans la scène affichée. La recherche de sources utilise l’IPC réel avec le moteur d’embeddings embarqué et des vecteurs de corpus synthétiques. Elle mesure le temps de réponse. Aucune évaluation de pertinence n’est associée à ce corpus.
- Versions affiche une différence vérifiée entre la version témoin et le texte courant. La bascule utilise la commande de bibliothèque. Entre demandes, le banc attend 600 ms puis la libération des références au verrou du projet actif, hors chronométrage. Le second projet contient une scène courte distincte.
- L’indexation ajoute 128 notes Markdown neuves à chaque demande pendant une rafale de frappe. Le banc vérifie le nombre de nouvelles notes publiées. Il ne retient que les frappes dont le début chevauche la demande d’indexation. La priorité d’écriture permet de mesurer la publication lexicale lorsque les embeddings de fond sont différés.
- Les temps de parcours sont en millisecondes. Le p95 est le percentile par rang le plus proche, `ceil(0,95 × n)`. Les faibles effectifs sont indiqués et leurs maxima restent visibles. CPU cumulée et RSS sont échantillonnées environ toutes les 0,4 s. Le RSS additionné peut compter des pages partagées. Les processus WebKit enfants de `launchd` sont relevés séparément comme candidats apparus pendant la mesure.

## Résultats sur le M1

Trois lancements frais suivis de trois réouvertures par corpus, soit douze processus mesurés. Le petit projet comporte 33 720 caractères et le grand 562 000. Toutes les sessions ont utilisé une fenêtre de 1 440 × 1 000 px. Chaque cellule donne **médiane / p95 / maximum** en ms, suivis du nombre de mesures. Avec trois essais, le p95 est le maximum observé.

| Parcours | 6 scènes · 6 notes | 100 scènes · 500 notes |
| --- | ---: | ---: |
| Nouveau processus jusqu’à l’accueil | 626 / 1 386 / 1 386 (3) | 669 / 798 / 798 (3) |
| Première ouverture, IPC | 13 / 14 / 14 (3) | 74 / 75 / 75 (3) |
| Première ouverture, jusqu’à l’éditeur visible | 134 / 146 / 146 (3) | 196 / 200 / 200 (3) |
| Après ouverture, attente de stabilisation | 602 / 603 / 603 (3) | 12 023 / 12 401 / 12 401 (3) |
| Nouveau processus jusqu’à la session restaurée | 809 / 834 / 834 (3) | 845 / 883 / 883 (3) |
| Frappe hors indexation, durée de la transaction | 2 / 3 / 4 (270) | 2 / 3 / 7 (270) |
| Frappe hors indexation, jusqu’à l’image suivante | 17 / 18 / 19 (270) | 17 / 18 / 29 (270) |
| Sauvegarde après édition | 18 / 25 / 25 (9) | 21 / 41 / 41 (9) |
| Recherche dans la scène active | 14,5 / 19 / 19 (24) | 15 / 19 / 19 (24) |
| Recherche de sources, premier appel | 455 / 474 / 474 (3) | 498 / 509 / 509 (3) |
| Recherche de sources, appels suivants | 6 / 7 / 8 (21) | 22 / 23 / 24 (21) |
| Comparaison dans Versions, premier affichage | 106 / 109 / 109 (3) | 137 / 137 / 137 (3) |
| Comparaison dans Versions, affichages suivants | 70,5 / 88 / 88 (12) | 98 / 118 / 118 (12) |
| Bascule vers le projet secondaire, après stabilisation | 78 / 115 / 115 (9) | 77 / 97 / 97 (9) |
| Retour vers le projet mesuré, après stabilisation | 84 / 104 / 104 (9) | 154 / 165 / 165 (9) |
| Indexation lexicale de 128 notes pendant la frappe | 804 / 829 / 829 (9) | 1 032 / 1 189 / 1 189 (9) |
| Frappe pendant l’indexation, durée de la transaction | 2 / 3 / 4 (270) | 2 / 3 / 7 (270) |
| Frappe pendant l’indexation, jusqu’à l’image suivante | 17 / 20 / 22 (270) | 17 / 21 / 30 (270) |

L’attente de stabilisation comprend les 600 ms de délai initial du banc. Elle éclaire l’écart entre un éditeur visible et les opérations qui attendent la libération du verrou. Chaque session fraîche a publié 384 notes, avec calcul sémantique différé pendant les trois lots. L’annulation, le rétablissement et les changements de projet ont conservé le texte attendu. Après réouverture, les six curseurs étaient à la position enregistrée et les six scènes correspondaient à leur miroir Markdown. Aucune erreur n’a été remontée au banc sur ces douze processus.

### CPU et mémoire

Temps CPU cumulé médian capturé et RSS maximal échantillonné, par processus ou groupe. Les durées des scénarios complets sont d’environ 11 s et 30 s, pauses comprises. La pression mémoire macOS est restée au niveau 1 pendant la campagne finale.

| Périmètre | 6 scènes · CPU / RSS | 100 scènes · CPU / RSS |
| --- | ---: | ---: |
| Processus Ariane, scénario complet | 6,34 s / 145 Mio | 31,24 s / 173 Mio |
| Moteur embarqué, scénario complet | 0,41 s / 453 Mio | 0,41 s / 454 Mio |
| Processus WebContent candidats, scénario complet | 6,85 s / 476 Mio | 8,05 s / 630 Mio |
| Processus Ariane, réouverture | 0,74 s / 136 Mio | 0,80 s / 143 Mio |
| Processus WebContent candidats, réouverture | 0,74 s / 175 Mio | 0,73 s / 182 Mio |

Les JSON individuels, les échantillons de processus et les journaux sont dans `artifacts/0.7.5-reference/performance/measurements-final/`. `summary.json` et `fingerprints.txt` à côté du dossier contiennent l’agrégation et les empreintes du banc, du binaire et des verrous. Les instruments ont été ajoutés au harnais de vérification existant.

## Incidents observés pendant la mise au point

- Le scénario de stress à 2 000 scènes et 2 500 notes a atteint la limite de 150 s. À l’arrêt, SQLite contenait 544 scènes synchronisées et 10 880 passages dérivés. Un échantillon de pile d’une seconde place l’essentiel du temps du thread actif dans `EntityMentions → inline_entities → sync_idle → upsert_passage`, avec du travail SQLite dans la table plein texte. Le gestionnaire d’entités déclenche cette lecture de toutes les scènes dès l’ouverture, même avec le réglage d’enrichissement désactivé. C’est le premier coût à isoler avant de modifier la logique d’écriture. [Gestionnaire d’entités](../src/entities/useEntityManager.ts) · [Requête native](../src-tauri/src/api/project_commands.rs) · [Index des passages](../src-tauri/src/memory/storage.rs)
- Sur un essai intermédiaire de 160 scènes et 2 500 notes, l’éditeur est devenu visible en 243 ms après la demande d’ouverture. Les opérations de fond se sont libérées après 49,2 s supplémentaires. L’essai partiel a été arrêté pendant les bascules. Il documente la différence entre éditeur visible et projet prêt pour des opérations qui exigent le verrou.
- Verrou SQLite lors d’une création de version immédiatement après ouverture dans un essai. Le banc prépare désormais la version témoin avant l’activation. La cause exacte de ce verrou lors de la création reste à confirmer.
- La sélection d’un mot lors d’une recherche a déclenché `Invalid line number 22 in 21-line document` lorsque la scène se terminait par une ligne vide. La boucle de surlignage des répétitions peut faire progresser l’indice au-delà de la borne après avoir sauté la dernière ligne vide. Les mesures de recherche ci-dessus portent sur des expressions de plusieurs mots. [Surlignage des répétitions](../src/editor/nearbyRepetitions.ts)
- Une série de bascules sans pause a renvoyé « Ce projet est déjà ouvert en écriture dans une autre instance » après trois transitions réussies avec un seul processus du banc. Les opérations asynchrones conservent volontairement un verrou de projet à leur démarrage. L’opération précise qui retenait le verrou reste à isoler. [Durée de vie du verrou IPC](../src-tauri/src/api/mod.rs)

## Rejouer la référence

Les deux variables Vite activent la mesure dédiée. Le profil Rust exige `performance-harness`, un identifiant de bundle spécifique et un dossier synthétique. Le nom visible reste `ariane`. Les moteurs facultatifs et les données personnelles sont absents des dossiers d’essai.

```sh
npm run verify:resources
benchmark_overrides=$(python3 -c '
import json
from pathlib import Path
config = json.loads(Path("scripts/performance-config.json").read_text())
config["identifier"] = "fr.ariane.writer.performance-reference"
config["app"]["security"]["capabilities"].insert(1, "capture")
print(json.dumps(config))
')
VITE_PERFORMANCE=1 VITE_PERFORMANCE_REFERENCE=1 npm run tauri -- build \
  --debug --features performance-harness --config "$benchmark_overrides" --bundles app
python3 scripts/benchmark-reference.py \
  src-tauri/target/debug/bundle/macos/ariane.app \
  artifacts/reference-ariane-nouvelle --repeat 3
```

Le lanceur écrit un rapport par processus et une série d’échantillons CPU et mémoire. Les chemins de sortie sont neufs à chaque campagne. Pour comparer un candidat, conserver le même profil, la même machine, les ressources et les réglages. Qualifier séparément les changements de profils, la vue continue, les moteurs facultatifs, une session longue et les parcours clavier réels. [Lanceur](../scripts/benchmark-reference.py) · [Parcours mesurés](../src/performance/reference.ts) · [Fixtures](../src-tauri/src/performance.rs)

La variante `--size stress --repeat 1` conserve le témoin de 2 000 scènes pour le profilage. Elle demande son propre dossier de résultats.
