# Validation du candidat ariane 0.6.0

Date : **13 novembre 2026**. Référence : branche `codex/0.6.0`, depuis `099a27f0092e64594164304d974f43a91a673bec`. Implémentation et vérifications réalisées sans sous-agents. Le candidat est local ; ni fusion, ni publication, ni remplacement de l’installation courante.

## Environnement isolé

- iMac M1, 16 Go, macOS 26.6 (25G5052e).
- Écran principal Retina 4480×2520 et Artisr15.6Pro 1920×1080, 60 Hz. La présence de deux écrans ne vaut pas validation de leur débranchement.
- Bundle testé conservé dans `artifacts/version-0.6.0/synthetic/ariane.app`, nom visible **ariane**, identifiant de recette `fr.ariane.writer.synthetic06020261113`. La construction standard ultérieure reprend `fr.ariane.writer` ; elle n’est pas lancée sur le profil utilisateur.
- Données de recette sous `~/Library/Application Support/fr.ariane.writer.synthetic06020261113`. Le profil canonique `fr.ariane.writer` n’a pas servi aux essais.
- Projets créés par l’interface dans `artifacts/version-0.6.0/native/` : `SYNTHÉTIQUE 060 — Projet A` et `SYNTHÉTIQUE 060 — Projet B`. La variante de B est `SYNTHÉTIQUE — autre direction`.

## Vérification automatisée

Commande intégrée :

```sh
RUST_TEST_THREADS=1 npm run verify
```

| Contrôle | Résultat |
| --- | --- |
| Architecture et contrats | Réussi, 106 noms IPC concordants, contrats indépendants et dépendances contrôlées. |
| Ressources locales | Réussi, ressources verrouillées contrôlées par le script du projet. |
| Packaging Python | 27 tests réussis. |
| TypeScript et build Vite | Réussis. Avertissement de taille sur le chunk éditeur conservé ; aucune promesse d’optimisation. |
| Vitest | 412 réussis, 2 ignorés ; 105 fichiers réussis, 2 ignorés. |
| Rust | 197 réussis, 12 ignorés, aucun échec. |
| Clippy | Réussi avec `--all-targets -- -D warnings`. |
| Diff | `git diff --check` contrôlé séparément. |
| Bundle standard | `npm run tauri build` réussi, `fr.ariane.writer`, version 0.6.0, arm64, macOS 26+, 691,04 Mio. `package-local.py --check-only`, 23 fichiers moteurs/modèles et signature ad hoc profonde/stricte vérifiés. |

Nouveaux témoins : brouillons révisionnés, coalescence et réponses perdues ; finalisation réessayable ; autorisation native par fenêtre ; fixture JSON TypeScript/Rust avec emoji et sélection UTF-16 ; reçus de rangement après commit et absence de réécriture après édition/restauration ; migration 4→5 ; sauvegarde/restauration et archives invalides ; volume et extinction des sources ; conservation de l’instance CodeMirror et de son annulation ; coordination de fermeture et blocage des frappes tardives ; réception restant ouverte après rangement et navigation explicite.

Les deux tests TypeScript ignorés sont l’évaluation de révision (`ARIANE_REVISION_REPORT`) et le benchmark d’outline (`ARIANE_PERF_REPORT`), activables séparément. Les douze Rust ignorés demandent des moteurs installés, WAV ou évaluations IA : huit évaluations `ai_benchmark`, équivalence native par lots, révision française réelle et deux pipelines voix. Cette exécution ne qualifie pas ces moteurs ni les mesures associées.

## Recette navigateur

Build de production servi sur `127.0.0.1:1426`, vues 1440×1000 et 800×650. Création depuis les projets vides `SYNTHÉTIQUE 060 navigateur A` et `B`, changements A→B→A→B avec textes distincts puis rechargement, écriture avec accents et emoji, recherche CodeMirror, rechargement et reprise du texte intégral, commandes, ouverture/retour de Versions et focus immersif. Réception FR/EN/ES vérifiée : l’indisponibilité de la capture globale dans le navigateur est explicite, aucun adaptateur de persistance native fictif n’a été ajouté. Aucun message console de niveau erreur observé sur le parcours final.

À 800×650, le bouton thème conserve les mêmes coordonnées avant/après ouverture de la réception : `x=25, y=605, largeur=36, hauteur=36`.

Une fixture synthétique du composant `CaptureEditor`, distincte de l’application et sans backend simulé, a permis de vérifier le conflit de cascade avec les styles du manuscrit : conteneur borné, défilement local, marges et police littéraire. Après correction, à 660×350 : éditeur de 296 px de haut, marge horizontale de 32 px, 30 lignes et dernière ligne centrée vers `y=176`, défilement effectif. À 420×240 : aucune largeur de document supérieure au viewport. Cette fixture ne prouve aucun comportement de fenêtre macOS.

## Recette native observée

| Scénario | Preuve et résultat |
| --- | --- |
| Démarrage sans projet | Accueil à deux actions, ouverture de Capture rapide par Fichier, saisie dans l’éditeur autonome. |
| Trois captures successives | Masquer/rouvrir conserve la première ; `Mod+Enter` et Terminer préparent les suivantes. Trois originaux distincts retrouvés après relancement. Accents et emoji collés intégralement conservés. |
| Rangement | Deux captures dans A, une dans B créé depuis la réception ; destination et reprise de la capture sélectionnée vérifiées. Textes hors manuscrit, originaux globaux conservés. |
| Après confirmation | La réception reste ouverte, montre « Capture rangée. » dans sa capsule et propose Rejoindre le texte. Le clic ouvre le texte complet. |
| Variante | Variante de B créée par Versions ; destination affichée avec son nom ; rangement du brouillon récupéré puis accès au texte dans cette variante. |
| Erreur de stockage | Dans le seul profil synthétique, `inbox.sqlite` temporairement remplacé par un dossier, original renommé et conservé. Erreur dans la capsule, tampon intact ; Échap et Quitter ne perdent pas le texte et ne quittent pas le processus. Base remise en place, Réessayer obtient « Enregistré ». |
| Arrêt forcé | Après acquittement et contrôle SQLite du texte exact, arrêt du seul PID du bundle de recette ; relancement et réouverture du même texte intégral, avec sa sélection durable. Aucune promesse sur une frappe non acquittée. |
| Fermer et réafficher | Fermer la principale la masque, processus toujours présent. Réactivation par l’ouverture du bundle réaffiche le projet et sa variante. Quitter par le menu arrête le processus après coordination, avec une compacte masquée. |
| Plein écran et second écran | Principale mise en plein écran puis compacte accessible par Fichier. Déplacement de la compacte vers Artisr15.6Pro par Fenêtre ; rendu 660×350 à échelle 1 contre 1320×700 sur Retina, saisie et masquage fonctionnels. Cela ne prouve pas le raccourci depuis le plein écran d’une autre app. |
| Sauvegarde active | Archive `captures-060-avant-fusion.sqlite` créée par le dialogue natif ; manifeste `ariane-captures`, format 1, version 0.6.0, intégrité SQLite `ok`. |
| Fusion ancienne/récente | Brouillon complété après sauvegarde puis archive restaurée. Le texte récent reste actif, l’ancien est une capture distincte à ranger ; copie avant restauration présente. Nouvelle restauration : « 0 captures restaurées. », aucun doublon. |
| Profil vierge | Deux démarrages sur profils synthétiques vides, sans projet. Restauration par le dialogue natif : quatre captures non vides retrouvées, brouillon ouvert avec son texte ; raccourci personnalisé, volume 0,5 et préférences compactes restaurés, aucun projet ouvert implicitement. Le profil complet précédent et les profils vierges sont conservés séparément. |
| Archive portable finale | `captures-060-export-portable.sqlite` exportée depuis l’app : journal DELETE, intégrité `ok`, manifeste 0.6.0, aucun fichier WAL/SHM nécessaire. Restauration du fichier unique sur le dernier profil vierge puis second essai : « 0 captures restaurées. ». |
| Édition libre | Sélection, collage Unicode, 30 lignes avec défilement local et annulation/rétablissement clavier observés dans la compacte. Deux marqueurs ajoutés puis retirés par annulation ; le texte initial reste intact. |

Le contrôle des bases après rangement retrouve **quatre reçus pour quatre textes complets**, deux dans A et deux dans B dont un dans la variante. Les empreintes correspondent exactement aux originaux, les quatre textes sont hors manuscrit, les projets sont au schéma 5 avec intégrité `ok` et aucune entrée `mirror_pending`. La réception globale est au schéma 1, intégrité `ok`, avec quatre captures rangées, une à ranger et un brouillon. Les résultats sont conservés dans `artifacts/version-0.6.0/data-audit.json`.

Le premier texte avait perdu une capitale accentuée et un emoji lors de la saisie synthétique par l’outil de recette ; il a été comparé au texte effectivement entré. Les captures suivantes utilisent le collage Unicode, vérifié dans l’interface et SQLite. Cette limite de saisie n’est pas présentée comme une perte du stockage.

Le clavier système est `com.apple.keylayout.French`. L’injection native de l’outil utilise les positions QWERTY : son `super+z` produit ici la commande Fermer et son `super+q` correspond à Tout sélectionner. Après compensation (`super+w` pour le geste logique ⌘Z, avec Maj pour rétablir), l’annulation CodeMirror fonctionne. Les retours à la principale provoqués par le premier essai ne prouvent donc pas une panne d’annulation du produit. Le menu natif Édition → Annuler, cliqué séparément, reste sans effet sur le document de la compacte : cette limite est distincte du raccourci clavier vérifié.

Les essais ont révélé puis corrigé : son du retour consommé avant le gestionnaire CodeMirror, arrêt audio répété à volume nul, notification de récupération inutile après un rangement normal, navigation automatique après classement, et styles génériques du manuscrit débordant sur la compacte. Les témoins ciblés et la recette affectée ont été rejoués après correction.

La restauration garde une transaction de lecture cohérente sur l’archive et parcourt les lignes sans charger toute la réception en mémoire. Les valeurs sérialisées sont bornées à 16 Mio, le texte d’une capture à 2 Mio. Une entrée d’archive de 17 Mio est refusée par le témoin Rust sans altérer le brouillon courant ; aucune limite cumulée arbitraire de 256 Mio n’est imposée à la réception. Ce contrôle n’est pas une mesure d’endurance.

## Preuves locales conservées

Sous `artifacts/version-0.6.0/` :

- `verify.log`, `build-synthetic.log`, `build-canonical.log`, `bundle-check.log` et `bundle-resources.log` : sorties des commandes finales réussies.
- `bundle-audit.json` : identifiants, versions, architecture, empreinte SHA-256 des exécutables exacts et vérification des deux signatures.
- `data-audit.json` : intégrité, reçus, fidélité du texte et exclusion du manuscrit après rangement.
- `fresh-restore-audit.json` : profil vierge final, quatre captures non vides, brouillon identique à l’archive, deux marqueurs d’annulation absents, réglages retrouvés.
- `capture-native.png`, `restauration-native.png` et `browser-projects.png` : captures de recette, sans données utilisateur.
- `native/` : deux projets synthétiques et archives ; `synthetic/ariane.app` : bundle exact ayant servi à la recette.

Le contrôle de packaging refuse volontairement l’identifiant synthétique ; il a réussi sur le bundle standard, sans assouplissement du script. Ce bundle reste dans `src-tauri/target/release/bundle/macos/ariane.app` et n’a pas été lancé. Les serveurs de recette et l’application synthétique sont arrêtés. Le profil synthétique principal est rétabli ; les deux profils de restauration vierge restent conservés à côté. Aucun DMG, tag, commit, PR ou publication n’a été créé.

## Limites de qualification

- **Raccourci global physique** : combinaison personnalisée enregistrée et conservée après redémarrage, état actif exposé par Rust. Les combinaisons synthétiques de l’outil n’ont pas ouvert la capture depuis une autre app ; ce résultat ne permet pas d’identifier un échec produit ou une limite d’injection. L’utilisateur a indiqué ne pas pouvoir faire le geste physique maintenant. Le cas reste non concluant, jamais déclaré réussi.
- **Écrans et focus externes** : débranchement à chaud, sélection automatique de l’écran sous le pointeur depuis une autre app, restitution du focus à cette app et ensemble des Spaces non qualifiés. Un glissement de barre a été essayé, sans mesure de position exploitable ; il ne vaut pas preuve de déplacement natif.
- **Audio et IME** : volume/silence/IME et nettoyage sont couverts par les tests de composants ; ni écoute physique comparative, ni véritable méthode de saisie asiatique, ni microphone réel ne sont qualifiés ici. Aucun changement de permissions système effectué pour simuler ces preuves.
- **Menu Annuler** : le raccourci de l’éditeur fonctionne ; le clic sur l’action native prédéfinie Annuler n’a pas modifié le texte de la compacte pendant la recette. Ce chemin reste à corriger ou qualifier séparément et n’est pas déclaré réussi.
- **Pannes extrêmes** : erreurs de base indisponible, archive corrompue/future, réponses perdues et reprise après commit testées. Saturation réelle du disque, coupure d’alimentation pendant la restauration, concurrence prolongée avec moteurs réels et endurance restent non mesurées.
- **Distribution** : signature ad hoc, sans notarisation ni installation sur un second Mac. Aucune latence native chiffrée ni amélioration de performance revendiquée.

Les fonctions du jalon sont présentes et les preuves ci-dessus sont acquises. Les cas natifs non conclusifs empêchent de déclarer la **qualification 0.6.0 entièrement terminée** selon la définition du plan.
