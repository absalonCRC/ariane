# Recette d’ariane 0.8.0

**23 novembre 2026, Mac Apple Silicon, macOS 26.6 (25G5052e).** Le candidat a été construit depuis la branche `ariane/0.8.0`, sur la base `b2efca7` et avec les modifications locales de la version. Les cinq manifestes npm, Cargo et Tauri indiquent 0.8.0. Le bundle essayé s’appelle **ariane** et utilise l’identifiant isolé `fr.ariane.writer.reader080-synthetique`. Les projets et les sources de recette sont synthétiques. [Plan initial](plan-0.8.0.md) · [Guide d’utilisation](usage.md)

## Parcours sur Mac

| Parcours | Résultat observé dans le WKWebView du bundle |
| --- | --- |
| Écrire, puis lire une référence | À partir du projet vide, écrire dans la première scène puis créer et nommer la seconde. Les deux scènes utilisent `[^1]`. Dans la seconde, Entrée déplie sa propre définition sous la ligne. Espace la replie et rend le focus au même appel. Les deux événements ont été envoyés par macOS à la fenêtre de recette. |
| Annoter un PDF | Sélectionner le passage « Manuscrit », juste avant un emoji, puis la seconde occurrence d’une citation sur deux lignes. Elle figure sur les deux pages du PDF et la page 2 est tournée de 90°. Enregistrer la note, fermer le lecteur et suivre son lien depuis la marge. À 125 %, le premier rectangle reste à moins de 3 pixels CSS du texte mesuré. |
| Annoter une zone | Le PDF scanné et le PNG acceptent chacun une zone sans OCR. La recette a créé et redimensionné les cadres au clavier dans le lecteur. Une passe antérieure a aussi exercé le glisser à la souris dans la fenêtre native. |
| Reprendre après fermeture | Quitter le processus, relancer le même bundle et suivre les trois annotations. Chaque lien restitue sa page et ses rectangles. En fenêtre de 760 px, le bord droit du manuscrit est à 379,2 px et le lecteur commence à 387,2 px après stabilisation. En focus immersif, une édition pendant la consultation puis son annulation après fermeture restituent le texte avec la même instance CodeMirror. |
| Retrouver un document déplacé | Remplacer volontairement le PDF à son ancien chemin et en conserver l’original sous un autre nom. L’accès avec l’ancienne empreinte échoue avant réindexation. Après indexation, l’ancienne note garde sa citation et aucun surlignage caduc n’apparaît. Choisir le PDF déplacé, resélectionner un extrait et confirmer met à jour la même annotation. |
| Restaurer et changer de projet | La copie restaurée conserve les trois annotations, exige une nouvelle autorisation pour le vault externe et refuse les octets de la source. Ouvrir ensuite un projet 0.7.5, puis revenir au projet d’origine retrouve le lien réparé. La migration porte la base de la copie 0.7.5 du schéma 6 au schéma 7 et conserve un instantané SQLite de schéma 6 dans `recuperation/`. |

La comparaison SHA-256 des trois fichiers avec les originaux porte sur la lecture, la création des notes et le zoom, avant la substitution volontaire du PDF. Après cette substitution, le PDF déplacé conserve l’empreinte de l’original. Les notes et les droits sont stockés séparément.

Les preuves locales se trouvent dans `artifacts/validation-0.8.0/`. [Création](../artifacts/validation-0.8.0/candidat-creation.json) · [Relance et restauration](../artifacts/validation-0.8.0/candidat-reouverture.json) · [Empreintes](../artifacts/validation-0.8.0/candidat-empreintes.json) · [PDF à 100 %](../artifacts/validation-0.8.0/pdf-100.png) · [PDF à 125 %](../artifacts/validation-0.8.0/pdf-125.png) · [Scan dans la fenêtre native](../artifacts/validation-0.8.0/scan-window.png)

## Corrections issues de la recette

- À 760 px, une règle de mise en page faisait passer le manuscrit sous le document. La vue partagée lui réserve désormais sa propre largeur.
- WebKit renvoyait parfois deux rectangles pour les mêmes caractères, un pour le conteneur et un pour le texte. La sélection mesure les caractères de chaque fragment. Le témoin de deux lignes conserve exactement deux rectangles, même sur la page tournée.
- Lors d’un retour rapide au projet précédent, une tâche en cours pouvait encore détenir son verrou. La fenêtre réutilise son propre verrou pour le même fichier. Un second processus reste exclu.
- Des lectures simultanées à la première ouverture d’un index restauré pouvaient échouer avec `database is locked`. Le test reproduisait le défaut avant correction. Il ouvre maintenant huit index neufs avec huit lecteurs simultanés par index. Le projet restauré repasse également en mode WAL avant d’accueillir les lecteurs. La sauvegarde autonome conserve son journal en mode DELETE. [Test concurrent](../src-tauri/src/vaults/mod.rs) · [État des bases après la recette](../artifacts/validation-0.8.0/bases-apres-recette.json)

## Vérifications complémentaires

- **Marge documentaire sur Mac.** Dans une copie de *The Human Thread*, le survol révèle « Concept · suggestion » et la description de la fiche. Le bouton mesure 32 points de haut au repos et 95 points pour cet aperçu de 190 points de large. Tab affiche les détails de « Northlight Interview », Entrée ouvre sa fiche et Échap la referme. Les captures proviennent du bundle arm64 isolé `fr.ariane.writer.margin080-synthetique`. [Au repos](../artifacts/validation-0.8.0/marge/01-repos.png) · [Au survol](../artifacts/validation-0.8.0/marge/02-survol.png) · [Thème sombre](../artifacts/validation-0.8.0/marge/survol-sombre.png)
- **Chrome.** Deux scènes en lecture continue utilisent le même identifiant de note. Entrée affiche la définition de la seconde scène, Espace replie le texte et remet le focus sur son appel. Les trois passages, en français à 1 440 px, en anglais sombre à 760 px et en espagnol à 1 000 px, se terminent sans erreur JavaScript relevée. [Résultats navigateur](../artifacts/validation-0.8.0/navigateur.json)
- **Données et Versions.** Un test Rust crée une ancre, réessaie avec la même identité, édite la note puis restaure une version de scène. Il vérifie aussi que deux variantes peuvent conserver deux cibles différentes et que scinder puis réunir la scène conserve la cible documentaire. Les tests existants couvrent notamment les positions UTF-16, les citations de même libellé à l’export et les sélections de l’outline. [Annotations et tests](../src-tauri/src/project/annotations.rs) · [Témoin CodeMirror](../tests/document-footnotes.test.ts)
- **Intégration.** `RUST_TEST_THREADS=1 VITEST_MAX_WORKERS=2 npm run verify` a abouti. Le contrôle d’architecture couvre 116 commandes IPC, le contrôle des ressources 23 fichiers. Les 27 tests Python, 438 tests TypeScript et 215 tests Rust ont réussi. Deux tests TypeScript et douze tests Rust ont été ignorés. Le build et Clippy ont abouti. [Journal complet](../artifacts/validation-0.8.0/verification-finale.log)
- **Rendu local.** PDF.js 6.5.438 utilise un worker et des ressources embarqués. Sur le dernier parcours, l’ouverture et le premier rendu ont pris 210 ms pour la page tournée, 127 ms pour le scan et 48 ms pour le PNG. Il s’agit d’une observation par fichier sur ce Mac.
- **Bundle local.** Le build optimisé porte l’identifiant habituel `fr.ariane.writer`. Les deux exécutables sont arm64, avec signature ad hoc vérifiée par `codesign --verify --deep --strict`. Le parcours fonctionnel utilise le bundle de recette isolé. Le build local est non notarié. [Identifiants et empreintes des deux exécutables](../artifacts/validation-0.8.0/bundle-local.json)
- **Conditions de la recette.** Une passe dédiée a livré Entrée et Espace depuis macOS. D’autres tentatives ont été interrompues quand la fenêtre perdait le focus ou que son rendu restait en arrière-plan. Le cycle final utilise une fenêtre visible et des événements clavier automatisés dans le WKWebView. [Passe au clavier système](../artifacts/validation-0.8.0/clavier-macos.json)
- **Limites.** La recette utilise des événements clavier système et des gestes automatisés. La frappe humaine prolongée, l’IME, VoiceOver, les PDF proches de 100 Mo et la consommation mémoire des grands documents demandent des essais distincts. Les tests des moteurs optionnels dépendent de modèles ou de rapports locaux. Les observations sur ce petit corpus ne permettent pas de conclure à un gain de performance.

## Rejouer les parcours natifs

Construire le bundle de recette avec les variables Vite et le profil Tauri suivants depuis la racine du dépôt.

```sh
VITE_PERFORMANCE=1 VITE_READER_REHEARSAL=1 npm run tauri -- build --debug \
  --features performance-harness --config scripts/performance-config.json \
  --config '{"identifier":"fr.ariane.writer.reader080-synthetique"}'
```

Créer un répertoire temporaire vide avec le marqueur `.ariane-performance`. Y copier le [dossier de témoins](../tests/fixtures/document-reader) sous le nom `vault`, puis une copie synthétique de projet 0.7.5 sous `copie-075`. Ajouter le marqueur `.reader-recovery` pour exercer la sauvegarde, la substitution du PDF dans ce dossier et la reconnexion. Lancer le bundle avec `open -n src-tauri/target/debug/bundle/macos/ariane.app --env ARIANE_PERF_DIR="$profil"`, où `profil` est le chemin absolu du répertoire temporaire. Attendre `status: pass` dans `report.json`, conserver le rapport, quitter puis relancer avec le même profil pour la seconde partie. Un nouveau cycle complet utilise un nouveau profil.
