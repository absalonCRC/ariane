# Plan de passage à ariane 0.6.0

Date : **13 novembre 2026**. Statut : **implémentation locale 0.6.0 ; qualification détaillée dans [validation-0.6.0.md](validation-0.6.0.md)**.

**Objectif.** Réaliser le jalon « Capturer une idée depuis une autre application » de la [roadmap](roadmap-1.0.0.md#060--capturer-une-idée-depuis-une-autre-application) : fenêtre compacte globale, brouillon durable, boîte de réception et rangement fiable dans un projet, avec une machine à écrire cohérente entre les deux éditeurs.

**Cadre d’exécution adopté.** Travailler sans sous-agents, dans le checkout approprié existant. Revérifier branche, commit, modifications locales et consignes avant toute implémentation. Suivre les dépendances ci-dessous ; conserver séparés les extractions mécaniques, migrations et changements de comportement. Les cases cochées des lots 1–8 indiquent la mise en œuvre ; leurs critères de recette restent soumis aux preuves et limites du rapport de validation. Les lots 0 et 8 gardent la matrice native ouverte tant que ses essais physiques ne sont pas qualifiés.

**Architecture mise en œuvre.** Conserver Tauri 2/Rust, React/TypeScript, CodeMirror 6, SQLite et les miroirs Markdown. Ajouter un domaine global de capture, une petite surface CodeMirror et un coordinateur natif des fenêtres. La fenêtre compacte ne monte pas le Workspace et ne détient aucun projet actif.

## 1. Référence initiale inspectée avant implémentation

Référence locale : `main`, commit `099a27f0092e64594164304d974f43a91a673bec`, arbre propre avant cette rédaction. `git ls-remote` confirme le même commit pour `origin/main` et `v0.5.0`. Les manifestes npm, Cargo et Tauri indiquent **0.5.0**. La [release publique 0.5.0](https://github.com/absalonCRC/ariane/releases/tag/v0.5.0), publiée le 12 novembre, décrit un paquet expérimental signé ad hoc et non notarié.

| Domaine | Observation dans le code 0.5.0 | Conséquence pour 0.6.0 |
| --- | --- | --- |
| Fenêtres | Une seule fenêtre `main` dans `src-tauri/tauri.conf.json` ; `src/main.tsx` monte toujours `App`. | Créer une entrée compacte distincte, sans second Workspace ni bootstrap de projet. |
| Fermeture | `app/useNativeClose.ts` termine par `request('quit')` après sauvegarde ; `lib.rs` diffuse `app-close-requested`. | Séparer fermer/masquer et quitter ; attendre toutes les sauvegardes avant la sortie du processus. |
| Projet courant | `api/state.rs` possède un seul `current` et un seul `project_guard`. `api/session.rs::activate` change aussi `session.json`. | Les commandes compactes ne doivent appeler ni `open`, ni `create`, ni `bootstrap`, ni les écritures du projet. |
| Accès IPC | `api/dispatch.rs` valide/admet les requêtes mais ne distingue pas leur fenêtre d’origine. Les capacités actuelles ciblent seulement `main`. | Autoriser explicitement les commandes compactes et vérifier l’origine native avant routage ; ajouter une capacité dédiée. |
| Raccourcis | Registre à IDs stables, portée `app`/`editor`, préférences `ariane.shortcuts.v1`, menus synchronisés. Aucun plugin global-shortcut installé. | Ajouter une portée globale et une configuration lisible au démarrage Rust ; préserver les raccourcis actuels. |
| Capture | Pas de boîte de réception globale. La commande IPC existante `capture` crée une **version d’écriture**. | Nouveau contrat `inbox…`, sans réutiliser ni renommer la commande historique. |
| Machine à écrire | `editor/typewriter.ts` centre le curseur et respecte déjà les animations réduites. `typewriterSound.ts` possède cinq sons locaux, avec gains fixes. `smoothCaret.ts` existe. | Réutiliser ces comportements ; ajouter le volume et qualifier les mouvements, pas reconstruire l’éditeur. |
| Préférences de frappe | `typewriter` et `typewriterSound` appartiennent aux réglages du projet ; sons désactivés par défaut. | Prévoir des préférences compactes indépendantes et un volume partagé sans modifier implicitement les projets. |
| Persistance | Sauvegardes révisionnées, `mirror_pending`, verrous OS et verrou d’opérations par projet. Schéma projet **4**. | Réutiliser les protocoles ; prévoir un reçu transactionnel de rangement et la reprise entre deux bases. |
| Bibliothèque | Catalogue global `library.sqlite`, ouverture depuis l’accueil, textes exclus du manuscrit, variantes existantes. | Réutiliser ces destinations et parcours ; préciser aussi la piste d’écriture destinataire. |
| Sauvegarde de données | Copies avant migration et versions existent. La page « Projet et données » propose versions/export, sans parcours complet de sauvegarde/restauration globale. | Cette dépendance de la roadmap reste à réaliser ; les captures doivent être sauvegardables hors de l’historique du manuscrit. |

**Vérifications réalisées pour ce plan :** `npm run verify:architecture` réussi, avec 92 noms IPC concordants ; **17 tests réussis dans 9 fichiers** : `typewriter-audio`, `typewriter-editor`, `typewriter-settings`, `configurable-shortcuts`, `workspace-commands`, `new-page`, `outline-save-queue`, `deferred-draft`, `smart-tag-save`. Le témoin de création confirme encore la préparation du nom dans la sidebar avant création. Aucun test ajouté pour cette modification documentaire.

Commande ciblée reproductible pour cette référence :

```sh
npm test -- tests/typewriter-audio.test.ts tests/typewriter-editor.test.tsx tests/typewriter-settings.test.tsx tests/configurable-shortcuts.test.ts tests/workspace-commands.test.tsx tests/new-page.test.tsx tests/outline-save-queue.test.tsx tests/deferred-draft.test.ts tests/smart-tag-save.test.tsx
```

La suite complète `npm run verify`, les tests Rust, le build et la recette native n’ont pas été relancés pour ce plan. Les résultats complets consignés dans [la qualification 0.5.0](validation-0.5.0.md) restent des preuves historiques. Aucun prototype compact, essai Spaces/multiécran ou sauvegarde globale n’a été trouvé dans les sources et documents inspectés.

**Écarts documentaires à garder visibles.** La section 3 de la roadmap décrit explicitement la référence historique 0.2.2, pas l’état courant. Dans `architecture.md`, le paragraphe Smart-tags disant que le parseur combiné reste à réaliser est dépassé par la section 0.5.0 du même document. Les anciennes affirmations d’absence de publication sont dépassées par la release publique ; elles ne prouvent toutefois ni notarisation, ni installation sur un second Mac. Les échéances de prototypes au 12 novembre sont échues et leur qualification n’est pas établie ici.

## 2. Périmètre, choix proposés et invariants

Les sept engagements du jalon 0.6.0 sont conservés : raccourci/fenêtre, sauvegarde progressive, réception/rangement, reprise idempotente, isolation du projet actif, confort de frappe et édition libre. Les conventions ci-dessous ont guidé l’implémentation autorisée ; les ajustements effectivement réalisés figurent au §8.

| Sujet | Convention proposée |
| --- | --- |
| Activation | Commande stable `capture-open`, combinaison initiale proposée `Mod+Shift+Space`, configurable ou désactivable. Le raccourci existe tant qu’ariane est lancée ; aucun service de relancement après Quitter. |
| Brouillon | Un seul brouillon compact actif ; texte Markdown autonome. `#` et `@` restent du texte dans cette capture sans projet, sans création de tags ni d’entités dans un projet voisin. |
| Masquer | Échap, fermeture de la compacte et second appel du raccourci masquent après mise en sûreté du brouillon. Une perte de focus déclenche la sauvegarde, pas la finalisation. Une composition IME utilise d’abord Échap pour sa propre annulation. |
| Terminer | Action explicite « Terminer », également `Mod+Enter` si aucune composition n’est en cours : finaliser après acquittement, puis préparer un nouveau brouillon. Un brouillon vide ne crée pas une note vide dans la réception. |
| Fenêtre principale | Fermer la fenêtre principale sauvegarde et la masque ; l’application reste active. Le Dock ou une commande explicite la réaffiche. Quitter coordonne les deux fenêtres et arrête effectivement l’application. |
| Position | Apparition discrète depuis le bas de l’écran utilisé. Le prototype doit fixer la règle fiable de sélection de l’écran et de restitution du focus, y compris plein écran, Spaces et changement de moniteur. |
| Réception | Surface temporaire accessible depuis la bibliothèque et la recherche existante (`inbox-open`) ; accès sans projet depuis la bibliothèque après « Ouvrir un projet » et un menu natif. Pas de panneau permanent ni de troisième action principale sur l’accueil. |
| Destination | Un nouveau texte de travail **exclu du manuscrit** par défaut, dans le projet et la piste explicitement affichés au moment du rangement. Le rangement ne remplace jamais une scène existante. L’auteur peut ensuite inclure ou déplacer ce texte avec les outils actuels. |
| Changement de projet | Le rangement se fait dans la fenêtre principale. Choisir une autre destination utilise l’ouverture et le checkpoint habituels ; créer un projet repasse par l’accueil et son parcours existant, en conservant la capture sélectionnée. |
| Réglages | Conserver les booléens par projet. Compacte : machine à écrire activée, son désactivé par défaut. Ajouter un volume global normalisé `0…1`, initialement `1` comme multiplicateur des gains existants ; `0` garantit le silence. |
| Conservation | Garder le texte original et le reçu des captures rangées ; les retirer de la liste « À ranger », sans purge automatique. Une suppression définitive ou une synchronisation intermachines ne fait pas partie de ce lot. |

Invariants transversaux :

- Apple Silicon, macOS 26+, nom visible **ariane**, interface FR/EN/ES. Aucune modification de modèle IA ou de seuil documentaire.
- SQLite est la source transactionnelle ; un miroir en retard ne transforme pas une sauvegarde réussie en texte perdu. Ne pas remplacer les files actuelles par une file globale.
- Une seule file d’écriture par brouillon, une seule autorité de persistance Rust ; événements interfenêtres après commit, avec identifiant et révision. Un ancien acquittement ne doit pas effacer une édition récente.
- Conserver sélection, offsets UTF-16, IME, annuler/rétablir, saisie au milieu du texte et déplacement libre. La compacte ne crée ni source externe ni fiche Ariane automatiquement.
- Les notifications passent par la capsule supérieure de la fenêtre concernée, avec erreur et réessai accessibles. Aucun bandeau flottant en bas.
- Pas de prédiction 0.7.0, de lecteur PDF 0.8.0, d’objectifs 0.9.0, ni de reprise complète anticipés dans cette version. La capture conserve seulement son brouillon et son contexte utile à sa réouverture.

## 3. Frontières et contrats à établir

### Propriétaires et fichiers

Les chemins marqués « nouveau » sont proposés ; les autres ont été inspectés. Aucun découpage global d’`App`, de `Workspace` ou de l’éditeur n’est requis.

| Responsabilité | Fichiers proposés ou existants |
| --- | --- |
| Contrats purs de capture | Nouveaux `src/contracts/inbox.ts`, `src-tauri/src/inbox/model.rs` ; étendre `contracts/requests.ts`, `api/request.rs`. |
| Stockage global et journal | Nouveaux `src-tauri/src/inbox/{mod,storage,transfer,backup}.rs` ; étendre `api/state.rs`, `api/mod.rs`, `ipc.rs`. Base `inbox.sqlite` sous le répertoire applicatif, schéma indépendant de celui des projets. |
| Fenêtres et sortie | Nouveaux `src-tauri/src/capture_window.rs`, `src-tauri/src/app_lifecycle.rs` ; étendre `lib.rs`, `platform.rs`, `app/useNativeClose.ts`, `main.tsx`, `tauri.conf.json`, `Cargo.toml`. |
| Autorité des accès | `api/dispatch.rs`, `path_grants.rs`, `capabilities/default.json` ; nouveau `capabilities/capture.json`. Les commandes fines restent dans le transport existant avec filtrage effectif par fenêtre. |
| Réglages globaux durables | Préférences dans `src-tauri/src/inbox/storage.rs` et `src/capture/preferences.ts`, contrat correspondant ; intégrer `commands/{registry,shortcuts,ShortcutSettings}.ts*`, `Preferences.tsx`, `Settings.tsx`. |
| Compacte et réception | Nouveaux `src/capture/{CaptureApp,CaptureEditor,Inbox}.tsx`, `src/capture/useCaptureDraft.ts` ; intégrer `App.tsx`, `useWorkspace.ts`, `workspace/types.ts`, `Welcome.tsx`, `Palette.tsx`, `commands/useWorkspaceCommands.ts`, `project/{ProjectCatalog,BinderActions}.tsx`. |
| Rangement dans un projet | Nouveau `src-tauri/src/project/capture_import.rs` ; étendre `project/{schema,mod,storage}.rs`, `api/project_commands.rs`, `project/operations.ts`. Vérifier `history/{mod,branches}.rs` pour la portée de restauration. |
| Confort partagé | `editor/{typewriter,typewriterSound,smoothCaret,scrolling}.ts`, `Editor.tsx` ; extraire seulement le comportement de frappe effectivement partagé, par exemple `editor/typewriterInput.ts`. Styles ciblés et `i18n/messages.json`. |

### Contrats proposés

- `Capture` : `id`, `revision`, `text`, `createdAt`, `updatedAt`, `status: draft | ready | filed`, sélection `{anchor, head}` en UTF-16. Le backend vérifie les bornes ; les dates/IDs ne dépendent pas du projet ouvert.
- `inboxSave` : `id`, `expectedRevision`, `operationId`, texte et sélection ; retourne la révision durable. Un réessai identique retourne le même résultat ; le même `operationId` avec un autre contenu est refusé.
- `inboxFinish` : capture, révision attendue et `operationId` ; transaction qui finalise et affecte le brouillon suivant. Retenter après une réponse perdue ne doit pas finaliser le nouveau brouillon.
- `inboxTransfer` : `operationId`, `captureId`, `captureRevision`, `projectPath`, identité durable de base destinataire, `branchId`, titre et parent éventuel ; retourne `sectionId`, piste, reçu et état du miroir. Les identifiants et empreintes sont revérifiés avant commit.
- Une identité de base de projet, absente du modèle inspecté, est ajoutée avec la migration du reçu pour détecter un dossier remplacé. Conserver chemin canonique **et** identité ; une copie de projet ou un déplacement demande une résolution explicite, sans rechercher et écrire dans un autre dossier à l’aveugle.
- `inbox-changed` : ID/révision après commit, sans transporter tout le manuscrit ; une fenêtre recharge seulement ce dont elle a besoin et ignore les événements anciens. L’événement ne déclenche aucune écriture en retour.
- Le coordinateur de sortie attribue un identifiant de demande et attend l’acquittement des fenêtres participantes et des écritures durables. Une erreur ou un délai expiré garde l’application ouverte et propose une reprise ; il ne vaut jamais approbation implicite de quitter.

La compacte dispose d’une liste fermée de commandes globales nécessaires. Elle n’accède pas aux commandes du projet, aux dialogues d’autorisation de chemins ni à l’édition des raccourcis de la fenêtre principale. Le label natif de la fenêtre est vérifié côté Rust ; un paramètre frontend `window` ne constitue pas une preuve d’origine. Les [capacités Tauri](https://v2.tauri.app/security/capabilities/) ciblent fenêtres/webviews : une capacité compacte distincte ne suffit pas à filtrer les variantes d’un `dispatch` monolithique sans ce contrôle serveur.

## 4. Lots d’implémentation et acceptation

### Lot 0 — Lever le risque natif avant de figer l’interface

**Fichiers concernés :** `lib.rs`, `platform.rs`, `tauri.conf.json`, `Cargo.toml` et futurs modules de fenêtre/cycle de vie. **Livrable :** prototype isolé sur données synthétiques et matrice de résultats dans `docs/validation-0.6.0.md`.

- [ ] Éprouver raccourci global, fenêtre au premier plan, arrivée depuis le bas, focus de saisie, masquage et retour à l’application précédente. Un geste ne déclenche qu’une action, sans répétition à la libération de touche.
- [ ] Tester fenêtre principale visible/masquée, absence de projet, Dock, plein écran, Spaces, plusieurs écrans, échelles différentes, écran déconnecté et animations réduites. Vérifier aussi la zone de glissement et la priorité des contrôles.
- [ ] Essayer d’abord les API Tauri disponibles ; limiter une éventuelle adaptation AppKit à la gestion native de fenêtre. Ne pas décider qu’`always_on_top` prouve à lui seul le comportement en plein écran.
- [ ] Enregistrer matériel, version macOS, scénario et latence observée d’ouverture ; fixer ensuite le budget de recette, sans annoncer de gain non mesuré.

Le [plugin global-shortcut](https://v2.tauri.app/plugin/global-shortcut/) fournit enregistrement et événements Pressed/Released. Le [builder de fenêtre Tauri 2.12.5](https://docs.rs/tauri/2.12.5/tauri/webview/struct.WebviewWindowBuilder.html), version verrouillée du projet, expose notamment les options de premier plan et de présence sur les espaces. Ces API documentées ne remplacent pas les essais macOS.

**Acceptation :** matrice renseignée avec preuves et limites ; aucune affirmation de compatibilité Spaces/multiécran sans essai. Un cas requis non fonctionnel bloque la qualification de capture globale et impose de revoir l’approche avant les lots d’interface.

### Lot 1 — Boîte de réception durable et indépendante

**Fichiers :** contrats, `inbox/{model,storage,mod}.rs`, routage/admission IPC, `api/state.rs` et filtrage `dispatch`. **Dépendance :** conventions du §2 ; indépendant de l’apparence finale de la fenêtre.

- [x] Créer/migrer `inbox.sqlite` avec version de schéma, sauvegarde cohérente préalable aux migrations futures, refus d’un schéma inconnu et verrou d’instance globale. Distinguer base absente, base corrompue et erreur d’accès ; ne pas remplacer une base illisible par une réception vide.
- [x] Implémenter brouillon actif, sauvegarde révisionnée, finalisation idempotente, lecture et pagination des notes prêtes/rangées. Borne de taille explicite avec erreur récupérable, jamais de troncature silencieuse.
- [x] Sérialiser les écritures de capture et réserver une admission bornée compatible avec la priorité des sauvegardes existantes. Une indexation ou un export saturé ne doit pas empêcher leur progression.
- [x] Publier seulement les commits confirmés, conserver les opérations réessayables et traiter les écritures concurrentes sans écrasement. Ajouter un témoin JSON TypeScript/Rust avec accents, emoji, révision et sélection.

**Acceptation :** écrire sans projet, finaliser deux fois avec la même opération, perdre une réponse, redémarrer, injecter erreur disque et révision périmée ; retrouver le texte complet une seule fois. Les requêtes compactes ne modifient ni `AppState.current`, ni `project_guard`, ni `session.json`. Tester leur refus explicite d’une commande projet.

### Lot 2 — Fenêtres, raccourci global et sortie coordonnée

**Fichiers :** modules de fenêtre/cycle de vie, `lib.rs`, `platform.rs`, `useNativeClose.ts`, `main.tsx`, capacités, préférences et registre de commandes. **Dépendances :** lots 0 et 1.

- [x] Monter `CaptureApp` dans une fenêtre identifiée `capture`, sans `App`, `useWorkspace`, bootstrap ni moteurs. Conserver une instance réutilisable et éviter les doubles ouvertures lors de frappes rapides du raccourci.
- [x] Distinguer fermer/masquer, réafficher et quitter. Masquer la principale conserve son contexte ; la réafficher restaure focus/sélection/défilement. Arrêter le microphone lors de la fermeture de la fenêtre concernée et ne jamais le relancer à la reprise.
- [x] Remplacer le premier acquittement de sortie par une coordination des deux fenêtres, y compris une fenêtre cachée ou encore en chargement. Rendre le protocole répétable ; protéger le texte contre un second Quitter et une dernière frappe arrivée tardivement.
- [x] Cibler les menus/événements vers leur propriétaire. Une commande de la compacte ne doit pas s’exécuter simultanément dans le Workspace masqué ; une action projet demandée depuis le menu réaffiche explicitement la principale.
- [x] Persister le raccourci global côté Rust avec écriture atomique, le charger avant l’affichage des fenêtres et afficher son état effectif. Conserver `ariane.shortcuts.v1` et les préférences de commandes existantes ; synchroniser la nouvelle entrée sans seconde autorité concurrente.
- [x] Valider collisions internes/système, gérer l’échec d’enregistrement et restaurer l’ancienne configuration si le remplacement échoue. Pendant l’enregistrement d’une combinaison, suspendre aussi le déclenchement global puis le rétablir ; ne pas enregistrer le même accélérateur dans deux circuits.

La [référence Tauri du raccourci global](https://v2.tauri.app/reference/javascript/global-shortcut/#isregistered) précise qu’`isRegistered` ne détecte que les enregistrements de l’application. Ne pas promettre une détection exhaustive des raccourcis d’autres applications : vérifier un déclenchement réel et permettre une autre combinaison.

**Acceptation :** raccourci personnalisé après redémarrage, ancienne combinaison inactive, un seul déclenchement par geste, erreur explicite et retour possible à la configuration précédente. Fermer la principale puis capturer fonctionne ; Quitter attend les deux sauvegardes, reste ouvert si l’une échoue, puis libère raccourci et ressources après succès.

### Lot 3 — Écriture compacte et sauvegarde progressive

**Fichiers :** `capture/{CaptureApp,CaptureEditor}.tsx`, `useCaptureDraft.ts`, extensions CodeMirror partagées, styles et traductions. **Dépendances :** lots 1 et 2.

- [x] Construire un éditeur CodeMirror autonome avec Markdown, sélection, historique et confort existants. Réutiliser `typewriterScrolling`, `documentScroller` et les comportements communs sans créer de fausse section de projet ni importer tous les outils d’entités/tags.
- [x] Posséder le brouillon et sa file dans `useCaptureDraft` ; conserver le texte dans CodeMirror. Coalescer les sauvegardes en attente, déclencher pendant la frappe avec un délai maximal borné, puis forcer le flush avant masquer, terminer et quitter. Fixer et mesurer ce délai au lot 0/3.
- [x] Afficher « enregistré » seulement après commit de la bonne révision. Si une sauvegarde échoue, conserver le tampon et rendre le réessai accessible dans la capsule ; le masquage explicite ne doit pas faire disparaître une erreur bloquante.
- [x] Restaurer le brouillon et la sélection après réouverture ; préserver l’historique dans la fenêtre réutilisée. Après redémarrage, garantir texte et sélection, sans promettre la restauration de toute la pile d’annulation.
- [x] Finaliser avec un ID d’opération stable, attendre l’acquittement puis remplacer l’éditeur par le nouveau brouillon. Empêcher les frappes tardives de se rattacher à la capture déjà finalisée.

**Acceptation :** trois captures consécutives ; masquer/rouvrir, raccourcis répétés, collage long, accents/emoji, touches mortes, IME, sélection, annulation, édition au milieu et disque indisponible. Un kill forcé doit conserver toutes les révisions acquittées ; mesurer séparément la fenêtre des frappes encore non acquittées, sans promettre une persistance avant leur écriture. Aucun appel projet ou moteur depuis la compacte.

### Lot 4 — Rangement transactionnel et reprise sans doublon

**Fichiers :** `inbox/transfer.rs`, `project/capture_import.rs`, `project/{schema,storage,mod}.rs`, routage projet et tests d’historique/variantes. **Dépendance :** lot 1 ; contrat prêt avant l’interface de rangement.

- [x] Ajouter le schéma projet **5 si la référence reste au schéma 4** : identité durable de base et table `capture_receipts`. Copie cohérente avant migration, refus du schéma futur ; ne pas faire migrer les caches mémoire par confusion de numéros.
- [x] Persister l’intention globale avec capture/révision/empreinte, destination/piste et `sectionId` réservé. Dans le projet, vérifier les préconditions sous les verrous existants, puis committer **texte, section, reçu et intention de miroir ensemble**. Ne pas enchaîner simplement « ajouter scène » puis « sauvegarder texte ».
- [x] Confirmer l’opération globale après le commit projet. Si cette confirmation échoue, le reçu permet de conclure la reprise sans réécrire le texte et sans créer une deuxième section. Un miroir en erreur reste en reprise, avec état distinct du commit SQLite.
- [x] Garder le reçu hors des restaurations de texte et des snapshots de variantes ; conserver la piste destinataire. Si le texte a ensuite été édité, déplacé, mis en corbeille ou retiré par restauration, un réessai ne le recrée ni ne l’écrase. Afficher la situation et conserver la capture originale consultable.
- [x] Refuser une destination remplacée, inaccessible, verrouillée par un autre processus ou une piste modifiée depuis la sélection. Réessayer après résolution explicite ; ne pas activer une autre piste ou un autre projet en arrière-plan.
- [x] À la reprise, distinguer une opération déjà committée, dont le reçu peut être rapproché sans réimport, d'une intention encore sans reçu. Cette dernière attend l'ouverture explicite de sa destination et de sa piste avant toute nouvelle écriture. Une intention en attente ne bloque pas les nouvelles captures.

**Acceptation :** injecter un arrêt avant/après l’intention, avant/après le commit projet, avant/après le miroir et avant/après la confirmation globale. Après reprise : une section complète au maximum et l’original global intact. Tester double clic, réponse perdue, changement de projet/piste, sauvegarde simultanée du manuscrit, restauration de version, édition ultérieure et dossier remplacé. Le reçu doit être comparé, pas simplement son existence.

### Lot 5 — Réception et parcours de classement

**Fichiers :** `capture/Inbox.tsx`, bibliothèque, surfaces/recherche/commandes, `project/operations.ts`, traductions. **Dépendances :** lots 3 et 4.

- [x] Afficher liste paginée, extrait, date, état et contenu complet de la capture sélectionnée. Distinguer brouillon et notes terminées ; le brouillon se poursuit dans son éditeur unique, pas dans deux éditeurs concurrents.
- [x] Ajouter l’accès dans la bibliothèque et la commande de la recherche existante ; permettre de retrouver les captures par leur texte dans la réception. Sans projet, conserver l’accueil simple et accéder à la réception depuis la bibliothèque/menu.
- [x] Choisir le projet existant et la piste ; préserver les brouillons via les checkpoints actuels. Pour un nouveau projet, repasser par le parcours normal et reprendre le rangement après création, sans perdre la capture ni forcer une création en cas d’annulation.
- [x] Présenter le titre et la destination, ranger une seule fois, puis proposer de rejoindre le texte original. Charger les changements de projet sans écraser les brouillons récents et sans remonter inutilement CodeMirror.
- [x] Restaurer la vue précédente en quittant la réception, y compris focus immersif, requête, Versions et sélection. Les compteurs du manuscrit ne doivent pas inclure la réception globale ou doubler les mots lors du classement.

**Acceptation :** capturer/ranger trois notes dans deux projets, dont un nouveau ; refaire sans projet ouvert, depuis une variante, puis après redémarrage. Annuler le choix, perdre la destination et réessayer. Vérifier petit écran, navigation clavier, annonces d’état et bouton d’ouverture stable avant/après déploiement.

### Lot 6 — Machine à écrire commune et volume

**Fichiers :** `editor/{typewriter,typewriterSound,smoothCaret,scrolling}.ts`, `Editor.tsx`, comportement d’entrée partagé, préférences, compacte, styles et tests existants. **Dépendance :** lot 3 ; conserver une extraction mécanique distincte du réglage sensoriel.

- [x] Partager les règles touche/espace/effacement/retour et le nettoyage audio entre éditeurs ; préserver le silence pour lecture seule, raccourcis, composition IME, collage et transactions programmatiques. Conserver le traitement particulier des tableaux du manuscrit.
- [x] Ajouter le volume durable et sa synchronisation entre fenêtres sans reconstruire CodeMirror ; multiplier les gains existants pour préserver le niveau antérieur à la valeur initiale. La désactivation stoppe immédiatement les sources actives.
- [x] Affiner le mouvement du texte et le retour de chariot de façon discrète, après examen du comportement existant. Ne pas déplacer la sélection et ne pas gêner sélection glissée, menus contextuels ou navigation libre.
- [x] Respecter `prefers-reduced-motion`, le silence et l’absence de périphérique audio ; libérer AudioContext, nœuds, observers et timers, y compris après un chargement audio tardif ou une fenêtre masquée.

**Acceptation :** tests `typewriter-*` complétés pour volume, extinction immédiate et deux éditeurs ; recette comparative des mêmes séquences dans principale/compacte, son écouté réellement et animations stabilisées. Le ressenti sonore reste une validation d’usage ; un test DOM ne le qualifie pas.

### Lot 7 — Sauvegarder et restaurer les données de capture

**Fichiers :** `inbox/backup.rs`, préférences globales, autorisations de chemins et interface de données accessible sans projet. **Dépendances :** lots 1, 4 et 5.

- [x] Ajouter un parcours explicite de sauvegarde/restauration des captures et réglages globaux nécessaires : brouillon, notes, états de rangement, journaux, combinaison globale et confort compact. S’intégrer au chantier de sauvegarde complète s’il a été livré entre-temps ; ne pas le supposer existant.
- [x] Produire une copie SQLite cohérente et un manifeste versionné, dans une destination choisie par l’utilisateur. Exclure les caches reconstructibles, moteurs et vaults externes ; préciser que cette sauvegarde globale ne sauvegarde pas les projets destinataires eux-mêmes.
- [x] Avant restauration, suspendre les mutations des deux fenêtres, vider leurs files et créer une copie de retour. Valider schéma/intégrité et préserver les données récentes : fusion par ID/révision, divergences conservées pour résolution explicite, pas d’écrasement silencieux par une sauvegarde ancienne.
- [x] Réconcilier le journal global avec les reçus des projets après restauration. Si la destination manque, garder l’état à vérifier et le texte consultable ; ne pas recréer automatiquement une capture déjà rangée. Réenregistrer le raccourci restauré avec traitement des conflits.

**Acceptation :** sauvegarder pendant une session active, restaurer dans un profil synthétique vide puis sur un profil comportant une capture plus récente ; conserver les deux travaux en cas de divergence. Répéter avec projet absent, ancien journal, archive corrompue, manque d’espace et restauration interrompue. L’UI et le guide expliquent les périmètres distincts global/projet.

### Lot 8 — Intégration, qualification et passage de version

**Dépendances :** lots 0 à 7 acceptés. **Fichiers :** cinq manifestes/lockfiles, documentation, ressources et scripts de livraison concernés.

- [x] Exécuter les tests ciblés pendant chaque lot ; `npm run verify:architecture` après ajout/déplacement de modules et témoins JSON des nouveaux contrats. Conserver les assertions existantes ; ajouter des tests de comportement et de panne réellement nécessaires.
- [x] Exécuter **`RUST_TEST_THREADS=1 npm run verify`** sur le candidat intégré : ressources, packaging Python, build, TypeScript, Rust et Clippy. Rapporter séparément échecs, tests ignorés et mesures natives ; vérifier aussi `git diff --check`.
- [x] Recette navigateur sur build de production pour les composants partagés : projet vide, projet existant, changements rapides, fermeture/réouverture, 1440×1000 et 800×650, FR/EN/ES. Utiliser des fixtures ciblées pour la nouvelle réception ; ne pas simuler les garanties natives ni réintroduire les fonctions annulées dans l’adaptateur navigateur.
- [ ] Construire l’application native et tester avec identifiant de bundle et données synthétiques distincts, nom visible **ariane**. Exécuter la matrice du §5 ; vérifier le nom du projet avant toute saisie. Les captures ne doivent jamais atterrir dans le profil canonique pendant la recette. **Build et parcours synthétiques réalisés ; matrice physique partiellement qualifiée, voir le rapport.**
- [x] Aligner `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` sur **0.6.0** lorsque les fonctions sont présentes. La nouvelle dépendance de raccourci est justifiée ; aucune mise à jour générale de dépendances.
- [x] Vérifier le bundle réellement produit, ressources, version, architecture et signature. Documenter la compatibilité/migration et le chemin de récupération ; une signature ad hoc reste distincte d’une notarisation.
- [x] Rédiger `docs/{release-notes-0.6.0,validation-0.6.0}.md`, mettre à jour `CHANGELOG.md`, `architecture.md`, `usage.md`, `roadmap-1.0.0.md` et `releasing.md` selon le travail effectivement réalisé. Commit/PR, si demandés, avec description détaillée ; aucune publication, fusion ou création de release n’est réalisée par ce plan.

## 5. Matrice minimale de sortie

| Preuve | Scénario | Résultat requis |
| --- | --- | --- |
| Native | Depuis une autre application : ouvrir, écrire, masquer, rouvrir, terminer trois fois | Brouillon retrouvé, captures distinctes, retour de focus correct. |
| Native | Principale masquée, aucun projet, redémarrage, Dock, Quitter pendant une frappe | Capture disponible tant que l’app tourne ; toutes les écritures acquittées conservées ; sortie explicite complète. |
| Native | Écrans/Spaces/plein écran, retrait d’un écran, animations réduites | Fenêtre accessible sur l’écran attendu, saisie utilisable, pas de saut de focus imprévu. |
| Rust + native | Capture et manuscrit sauvegardés pendant indexation et changement de projet | Aucun croisement de texte, aucune modification implicite du projet actif, révisions protégées. |
| Rust | Arrêts à chaque frontière du rangement, réponse perdue, réessai | Au plus une section complète, capture originale conservée, reçu durable et miroir récupérable. |
| Rust + UI | Restauration de version, variante, déplacement/corbeille/édition après rangement | Pas de résurrection ou d’écrasement automatique ; lien et état explicités. |
| UI + native | Volume, silence, sons, IME, annulation, navigation libre | Frappe identique dans les deux éditeurs ; aucun blocage des corrections, ressources nettoyées. |
| Rust + native | Sauvegarde globale, restauration vierge et fusion avec des données plus récentes | Brouillons/notes/reçus retrouvés, divergences préservées, aucun doublon dans les projets. |
| Navigateur + native | Accueil, écriture, focus, Versions, tags, entités, requêtes et raccourcis existants | Parcours 0.5.0 préservés ; pas de nouvel effet de bord de la fenêtre compacte. |

**Définition de terminé.** Les sept engagements fonctionnels de la roadmap et la récupération des captures sont utilisables ; vérification complète, démonstrations et recettes pertinentes passent ; aucune perte connue, aucun doublon de rangement, aucune écriture externe ni changement implicite de projet. Versions et documentation correspondent au bundle. Un parcours natif requis non testé reste non qualifié et empêche de déclarer la 0.6.0 entièrement terminée.

Les modèles réels, la dictée au microphone, l’endurance globale, la notarisation et l’installation sur un autre Mac ne deviennent pas qualifiés par ces tests. Le changement de cycle de vie impose néanmoins de vérifier l’arrêt/nettoyage des sessions audio concernées. Aucun gain de fluidité ou de latence n’est annoncé sans comparaison sur le même matériel et le même scénario.

## 6. Ordre et calendrier proposé

Ordre d’exécution : **0 → 1 → 2 → 3 → démonstration capture → 4 → 5 → démonstration rangement → 6 → 7 → 8**. Le protocole du lot 4 peut être préparé après le lot 1, sans attendre la finition visuelle. Cet ordre ne suppose pas de travail délégué ni de ressources supplémentaires.

La roadmap réserve historiquement **26 novembre–1er décembre** à la 0.6.0. La 0.5.0 étant déjà intégrée le 12 novembre, il est raisonnable de préparer la 0.6.0 plus tôt **si son implémentation est autorisée** :

| Repère proposé | Résultat attendu |
| --- | --- |
| Avant le 17 novembre | Prototype natif et contrats de stockage/transfert décidés ; réestimation de la charge à partir des preuves. |
| Avant le 23 novembre | Démonstration capture : écrire depuis une autre application, masquer et retrouver après redémarrage. |
| Avant le 27 novembre | Démonstration rangement : reprise d’une interruption, projet/variante explicites, aucune duplication. |
| 27–29 novembre | Confort de frappe et sauvegarde/restauration globale finalisés ; correction des cas d’erreur. |
| 30 novembre–1er décembre | Candidat 0.6.0, vérification complète et recettes de sortie. |

Ces dates sont des cibles de préparation, pas une durée de production mesurée ni un engagement automatique. La fenêtre de six jours de la roadmap n’est crédible que si le risque natif et les fondations sont levés auparavant. Après les lots 0 puis 4, actualiser la prévision ; tout retard doit être exposé sans supprimer silencieusement sauvegarde, multiécran ou récupération.

Les prototypes de prédiction et de PDF ainsi que la signature/notarisation restent des chantiers transversaux à vérifier séparément : leur échéance du 12 novembre est passée. Les signaler dans le suivi global sans les transformer en prérequis fonctionnels artificiels de la capture ni les annoncer réalisés. La sauvegarde complète des projets prévue le 17 novembre demeure distincte du périmètre global couvert au lot 7.

## 7. Correspondance avec la roadmap

| Exigence 0.6.0 | Lots et preuve de sortie |
| --- | --- |
| Raccourci global, fenêtre, écran et focus | 0, 2, 3 ; recette native complète. |
| Sauvegarde progressive, masquer conserve, terminer prépare la suite | 1, 3 ; révisions, réessais et reprise après redémarrage. |
| Réception bibliothèque/recherche, projet existant ou nouveau | 5 ; parcours avec et sans projet. |
| Rangement récupérable et idempotent | 4 ; injection de pannes et conservation du texte original. |
| Projet actif isolé, sauvegardes simultanées | 1, 2, 4 ; filtrage IPC, contexte capturé, tests de concurrence. |
| Sons, volume, mouvements, animations réduites et silence | 6 ; tests et écoute/recette comparée. |
| Correction, sélection, annulation et déplacement libres | 3, 6 ; clavier/IME/CodeMirror. |
| Dépendance sauvegarde/récupération et paramètres de données | 7 ; copie cohérente et restauration éprouvée. |

## 8. Exécution autorisée le 13 novembre

L’utilisateur a demandé l’implémentation complète, sans sous-agents, avec tests et recette native. Le travail est dans le checkout existant, branche `codex/0.6.0`, à partir de `099a27f`. Les cinq manifestes indiquent 0.6.0 ; aucune publication n’est effectuée.

Les lots 1–7 sont implémentés : stockage global révisionné, compacte CodeMirror isolée, coordination des fenêtres, rangement transactionnel avec journal/reçus, réception avec choix explicite de projet et variante, volume commun et sauvegarde/restauration fusionnée. Les préférences globales appartiennent à la base de réception ; aucun module global supplémentaire n’était nécessaire. Le rangement propose de rejoindre le texte après confirmation, sans navigation imposée. Le miroir est repris avant de confirmer le rangement lorsque possible, avec état distinct si sa reprise échoue.

La migration projet 4→5 conserve une copie cohérente et ajoute identité de base/reçus. Le schéma global initial est 1 ; les schémas futurs sont refusés, pas réinitialisés. Une future migration de ce format devra ajouter sa copie préalable. Les réessais de sauvegarde utilisent une empreinte d’entrée et un reçu compact pour éviter de dupliquer le texte intégral à chaque frappe.

La vérification intégrée réussit : **412 tests TypeScript, 197 Rust, 27 Python**, build, ressources, contrôle d’architecture (106 commandes) et Clippy. Deux tests TypeScript et douze Rust restent ignorés ; leurs domaines ne sont pas qualifiés par cette suite. Les scénarios natifs, leurs données synthétiques et les cas physiques non conclusifs sont détaillés dans [le rapport de validation](validation-0.6.0.md). Le plan initial et son calendrier sont conservés comme référence, sans transformer une qualification partielle en promesse de compatibilité complète.
