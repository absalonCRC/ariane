# ariane 0.4.0

Cette version de développement réalise le jalon smart-tags de la [roadmap](roadmap-1.0.0.md), avec les choix d’interface précisés pendant la recette du 5 novembre. Les versions npm, Cargo et Tauri indiquent **0.4.0**.

## Écrire et retrouver ses tags

Écrire `#histoire` puis poursuivre avec un espace, une ponctuation ou Entrée crée le tag manquant ou réutilise son identité. La sortie du champ et les checkpoints de transition valident aussi le dernier mot saisi. La frappe continue et son curseur sont conservés lorsque la création termine en arrière-plan. Échap conserve une saisie littérale. Les titres Markdown, le code, les URL et les hashtags échappés sont préservés. L’autocomplétion propose les tags existants ; aucun formulaire d’ajout ne s’affiche sous le titre.

Chaque nouvelle définition reçoit une couleur distincte des tags présents. Les libellés apparaissent à la fin des passages. Les points d’outline portent les couleurs de tous leurs tags, héritage compris ; plusieurs couleurs sont réparties dans le point. Un enfant ne répète pas un libellé présent sur son parent. Ce masquage visuel ne retire aucune affectation et ne change pas les résultats d’un filtre. Les noms, couleurs et catégories restent modifiables. Le fond capsule et la croix de retrait apparaissent au survol. Le retrait vise l’affectation explicite d’origine, indiquée par l’infobulle, et garde la définition du tag.

## Administrer et consulter

Le bouton Smart-tags de la sidebar ouvre une page plein écran : recherche, catégories, création, nom, couleur, usages, affectation à un texte, retrait d’une affectation, fusion et suppression. Les affectations directes visent les chapitres, sections, scènes, notes et nœuds d’outline ; leurs descendants héritent dynamiquement des tags. Les usages incluent la corbeille. Retirer une affectation directe ne masque pas le même tag encore hérité. Les tags des sources restent distincts.

Cliquer sur un libellé ouvre une vue temporaire de tous les passages qui portent le tag, directement ou par héritage. Cette projection est en lecture seule ; l’éditeur original conserve son contexte. Cliquer sur un passage ouvre son original pour l’éditer. Ce parcours simple est avancé depuis la 0.5.0 à la demande de l’utilisateur ; les expressions combinées `#`/`@`, ET/OU, vues enregistrées et raccourcis configurables restent au jalon suivant.

## Titres, propriétés et capsule

Un `#tag` saisi dans le titre crée ou réutilise le tag de la page. Il s’affiche sur la même ligne, en petite typographie et près du titre, et s’applique par héritage à toutes les lignes de la page. Les libellés hérités ne sont pas répétés dans chaque passage. Les saisies supprimées pendant la création asynchrone sont préservées ; les ajouts ne remontent pas l’éditeur.

Le chevron à côté du point plie/déplie. Le point reste l’indicateur coloré, la poignée de déplacement, et ouvre le détail de la ligne dans la marge droite. Le gestionnaire de tags définit des propriétés de texte, date, nombre, case à cocher et relation nommée vers une note ou une ligne. Elles apparaissent dans le détail et, en consultation, dans le tableau. Schémas et valeurs peuvent être hérités ; une valeur directe prime. Les champs de liens configurés par type utilisent les mentions courantes et non ambiguës. Une cooccurrence ne suffit pas à inventer une relation sémantique. Les références stables préparent le graphe souhaité, sans prétendre livrer sa visualisation complète.

La capsule de titre et de notifications est adaptée à l’accueil, aux pleins écrans et aux vues de travail. Son titre change uniquement avec la vue principale (document, filtre de tag, Versions, Paramètres, Smart-tags) ; les menus, dialogues et panneaux latéraux conservent le titre courant. Les dialogues de l’accueil conservent « Accueil ». Nom et icône de branche sont absents si aucune variante n’existe, ainsi que pendant toute notification. Ils reviennent ensuite lorsque le projet possède une variante. Actions, erreurs et reprises restent accessibles dans les détails de la capsule.

## Structure et données

Maj-clic sur un point établit une ancre ; les suivants étendent une plage contiguë comprenant les descendants, même repliés. Ce geste ne plie pas et ne déplace pas la branche. La copie contient les lignes originales complètes, sans libellés de tags. Une navigation ordinaire réinitialise l’ancre.

SQLite passe au schéma **3**, avec une copie cohérente préalable dans `recuperation/`. Les anciens projets et snapshots restent lisibles. Les affectations directes sont stockées sur les sections et les nœuds stables ; l’héritage est calculé, sans copies dans chaque enfant. Le manuscrit, ses miroirs Markdown et ses exports n’incorporent pas ces métadonnées. Les transactions CodeMirror conservent l’annulation/rétablissement des tags de passages.

Renommer conserve l’identité ; fusionner déduplique toutes les références, corbeille comprise. Une version précède les modifications administratives des tags existants. Les versions complètes restaurent définitions et affectations ; les restaurations ciblées conservent les définitions courantes et récupèrent celles qui manquent. Les variantes isolent leurs définitions et affectations. La scission conserve les nœuds inchangés, donne une identité au fragment coupé et transmet ses tags ; la réunion déduplique les tags. Les vaults externes restent en lecture seule.

## Vérification et limites

Vérification complète `RUST_TEST_THREADS=1 npm run verify` réussie : ressources, packaging Python (27 tests), build, architecture (83 noms IPC), tests frontend (**394 réussis, 2 ignorés**), Rust (**178 réussis, 12 ignorés**) et Clippy. Les tests Rust ignorés, les moteurs et la dictée réels restent hors de cette preuve.

Recette navigateur de production depuis un projet vide puis existant : tags automatiques, titre et héritage, couleurs, labels de descendants, gestion plein écran, propriétés directes/héritées, Maj-clic et copie exacte avec branches repliées, originaux, réouverture et filtre sur **5 passages dans 2 pages**. Le compteur affiche **20 mots** dans le filtre, puis revient à 6 mots pour la page active. Texte/tableau, sidebar, retour à « Aa », désactivation/réactivation de la profondeur et console sans erreur vérifiés. Largeur du tableau mesurée à **1 080 px** avec une propriété ; à 800 px avec sidebar, défilement horizontal local sans élargir le document. Le bouton de changement de vue conserve ses coordonnées lors du basculement. Les derniers ajustements purement visuels ont été reconstruits et vérifiés dans le navigateur.

Capsule : titre du document conservé avec Écriture et lecture, le menu du projet, la recherche, l’historique et le détail d’une ligne. Titres distincts confirmés pour Smart-tags, Paramètres, Versions et la vue filtrée par tag. L’accueil garde « Accueil » dans les dialogues Créer/Ouvrir. Retour au texte et fermeture au clavier vérifiés ; à 800×650, le déclencheur des réglages garde ses coordonnées et le document ne déborde pas. Console sans erreur ni avertissement. Capture : `title-stable-writing-menu.png` dans les preuves locales de recette.

Paquet local macOS **arm64**, nom `ariane`, identifiant canonique, version **0.4.0**, signature ad hoc vérifiée. Aucune notarisation ni publication. Un build isolé avec identifiant distinct a lancé l’accueil et ouvert la création et le choix de dossier ; ce dialogue a ensuite bloqué l’automatisation. La saisie, sauvegarde, fermeture/réouverture et le drag natifs complets restent donc **non qualifiés** pour le paquet final. Cette limite ne vaut pas validation de ces parcours ; les tests de stockage Rust et la recette navigateur sont des preuves distinctes.

La validation du geste Maj-clic par l’utilisateur, les benchmarks, l’endurance et les moteurs réels constituent des preuves distinctes. Aucun gain de performance, notarisation, tag Git ou release GitHub n’est annoncé par cette version de développement.


## Accès rapides lorsque la sidebar est fermée

Un survol maintenu d’environ une demi-seconde sur le thème déploie uniquement la capsule : Smart-tags, Versions, Corbeille et Paramètres deviennent accessibles. Le reste de la sidebar reste fermé et le thème conserve sa position. La capsule se replie à la sortie ou avec Échap ; l’accès au clavier est conservé. Un clic sur Corbeille ouvre explicitement la sidebar dans cette vue.

Recette du dock : annulation d’un survol court et nettoyage des timers couverts par les tests DOM ; déploiement, sortie, focus clavier/Échap, ouverture des smart-tags et de la corbeille vérifiés dans le navigateur. Le thème conserve exactement ses coordonnées avant/après le déploiement, en 1 434×905 et en 800×650. Aucune sidebar n’est montée pendant le survol ; console sans erreur. Capture : `dock-hover.png` dans les preuves locales de recette.

## Historique depuis le bord droit

Le bouton supérieur « Reprendre le fil » est remplacé par un accès sur le bord droit, similaire à celui de la sidebar. L’historique est replié au départ. Approcher le pointeur révèle le chevron et l’infobulle « Historique » ; un clic ouvre le panneau, un second le referme. Le survol seul garde le panneau fermé. Le contenu du journal et des sessions est conservé. Le bouton reste accessible au clavier ; Échap ferme le panneau et rend le focus au déclencheur.

Recette navigateur : état initial replié, infobulle au survol sans ouverture, ouverture/fermeture au clic, ouverture par Entrée et fermeture par Échap avec retour du focus vérifiés. Le bord garde ses coordonnées avant/après ouverture, en 1 434×905 et en 800×650 ; le panneau laisse le bord accessible et le document ne déborde pas horizontalement. Compteur et recherche restent présents. Console sans erreur ni avertissement. Capture : `history-edge-open.png` dans les preuves locales de recette.
