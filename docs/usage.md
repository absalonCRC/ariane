# Utiliser ariane

## Blancs, essais de formulation et répétitions

Dans le manuscrit, ouvrez les **Commandes** avec **⌘ K**. **Laisser un blanc** insère `[…]` au curseur et permet d’ajouter un indice privé. **Blanc suivant** rejoint le prochain repère dans l’ordre du manuscrit, puis revient au premier. Sur un blanc, **Compléter le blanc** affiche son indice et remplace le signe par le texte saisi. **⌘ Z** rétablit le signe et son indice. Un blanc encore ouvert apparaît dans les exports.

Sélectionnez une formulation dans un paragraphe et choisissez **Essayer une formulation** dans les commandes ou dans la barre de sélection. Saisissez l’autre formulation. **Original** et **Essai** changent la version affichée dans le paragraphe. Fermez le panneau pour conserver le travail en cours. **Repères d’écriture** rouvre les blancs et essais du texte affiché. Un passage modifié peut être affiché comme **Passage à rattacher**. Sélectionnez le nouveau passage avant d’ouvrir la liste pour y rattacher le repère.

**Adopter l’essai** remplace la formulation en une édition annulable. **Garder l’original** ferme l’essai en conservant le manuscrit. Jusqu’à l’adoption, l’apprentissage, les compteurs et les exports utilisent l’original.

Sélectionnez un mot entier pour souligner ses autres occurrences dans le paragraphe et ses deux voisins. Le soulignement disparaît avec **Échap** ou à la reprise de la frappe.

## Prédiction du prochain mot

Activez « Proposer le prochain mot » dans **Paramètres → Écriture**. Après la frappe d’une espace, la proposition apparaît dans la ligne, juste après le curseur. **Entrée** insère le mot et **Échap** l’écarte. Sans proposition affichée, Entrée crée le retour habituel. Tab reste disponible pour indenter le passage. « Accepter le mot proposé » figure dans les raccourcis configurables.

La prédiction fonctionne en français, anglais et espagnol. Le manuscrit utilise la langue du document et la capture rapide celle de l’interface. La visibilité de la proposition est réglable. L’apprentissage utilise les textes enregistrés et inclus dans le manuscrit du projet. La capture utilise le vocabulaire commun. « Oublier ce projet » retire ses contributions et suspend son apprentissage. « Réinitialiser l’apprentissage » efface les mots et les retours appris. Les textes connus qui restent identiques sont ignorés après cette remise à zéro.

## Sauvegardes de projet et modules locaux

Dans **Paramètres → Projet et données**, « Sauvegarder le projet » crée un dossier dans la destination de votre choix. Il contient la base du projet, ses versions et variantes, ses fichiers Markdown, ses pièces jointes et le vault appartenant au projet. Conservez le dossier complet avec son inventaire. « Restaurer une copie du projet » vérifie la sauvegarde et crée une copie dans un nouveau dossier. Ouvrez ce dossier avec **Fichier → Ouvrir un projet**. Utilisez la boîte de réception pour sauvegarder les captures.

Les projets reçus ou restaurés conservent les références de leurs vaults externes. Ouvrez **Sources du projet**, accessible aussi depuis la capsule, puis sélectionnez chaque dossier à autoriser. Les projets créés avant la 0.7.5 demandent également cette autorisation lors du premier accès à leurs vaults externes. Ariane consulte ces dossiers en lecture seule. Le vault appartenant au projet est disponible dès la restauration.

La rubrique **Modules locaux** installe à la demande les moteurs de reconnaissance d’entités, de dictée ou de révision. Une connexion est nécessaire pour le téléchargement. « Interrompre » arrête l’installation et le même bouton permet de la relancer. L’écriture, la prédiction et l’export sont disponibles pendant l’installation.

## Capture rapide et boîte de réception

Tant qu’ariane est lancée, **⌘ ⇧ Espace** ouvre la capture rapide, même depuis une autre application. Le menu **Fichier → Capture rapide** fait la même chose. Le raccourci se change ou se désactive dans les réglages de la réception ou les raccourcis de l’application ; une combinaison réservée est refusée. Quitter ariane désactive ce raccourci jusqu’au prochain lancement.

Écrivez dans la petite fenêtre. La capsule indique l’enregistrement après confirmation ; si une erreur survient, le texte reste dans l’éditeur et **Réessayer** relance l’opération. **Échap**, le bouton de fermeture ou un second appel du raccourci masquent la fenêtre après sauvegarde. La perte de focus sauvegarde aussi. **Terminer** ou **⌘ Entrée** range l’idée dans la réception et prépare un nouveau brouillon. Masquer conserve l’annulation ; une relance retrouve texte et sélection, sans restaurer toute la pile d’annulation. Une fermeture forcée ne garantit que les écritures déjà acquittées.

Ouvrez **Fichier → Boîte de réception**, son accès dans la bibliothèque, la capsule des accès du projet ou la commande correspondante. La réception recherche le texte, sépare **À ranger** et **Rangées**, et conserve l’original. Le brouillon actif se poursuit uniquement dans la compacte. Sans projet, l’accueil conserve ses deux actions habituelles ; la réception reste accessible depuis la bibliothèque et le menu.

Sélectionnez une capture, vérifiez son titre, le projet et la variante de destination, puis **Ranger dans ce projet**. Le texte est ajouté comme texte de travail **hors manuscrit** ; les outils habituels permettent ensuite de l’inclure. **Rejoindre le texte** ouvre l’original rangé. Créer un projet utilise le parcours habituel et retrouve ensuite la capture choisie. Fermer la réception retrouve la vue d’écriture précédente. Une intention interrompue affiche sa destination ; ouvrez explicitement ce projet et sa variante pour reprendre. Un texte ensuite retiré ou restauré n’est jamais recréé automatiquement par un réessai.

Le volume de machine à écrire est commun aux deux fenêtres. Les interrupteurs de son et de défilement de la compacte sont indépendants des réglages du manuscrit. Le volume zéro et le masquage arrêtent les sources sonores actives. Les animations respectent le réglage de réduction des mouvements.

**Sauvegarder les captures** crée un fichier SQLite contenant brouillons, notes, états de rangement, journaux et réglages globaux. Ce fichier ne sauvegarde pas les projets destinataires ni les vaults externes : sauvegardez leurs dossiers séparément. **Restaurer les captures** attend les sauvegardes des deux fenêtres et crée d’abord une copie de retour dans les données d’ariane. Une sauvegarde ancienne n’efface pas un brouillon récent ; une divergence devient une note supplémentaire. Restaurer deux fois ne duplique pas cette note. Une destination absente reste à vérifier, sans réimport automatique.

Fermer la principale sauvegarde et masque sa fenêtre : le Dock la réaffiche et la capture reste disponible. **Quitter ariane** attend les deux fenêtres et arrête réellement l’application. Une erreur de sauvegarde empêche la sortie.

## Bibliothèque et rangement

Ouvrez le classeur avec ⌘ ⇧ B. Au survol du bord gauche, le chevron d’ouverture suit la hauteur du curseur ; le chevron de repli fait de même sur la bordure de la sidebar. Le chevron du titre déroule le catalogue sous le nom du projet et décale les onglets vers le bas : projets récemment ouverts, épinglés et archivés. Archiver un projet le retire des récents sans déplacer ni supprimer son dossier. Les projets antérieurs apparaissent dès leur prochaine ouverture.

Les onglets **Textes** et **Sources** partagent le même panneau, sans champ de recherche. Textes réunit les scènes et les anciennes notes dans une seule arborescence : les textes inclus dans le manuscrit participent à la lecture continue, au comptage et à l’export du projet. Le bouton + ajoute une section, un chapitre ou une scène. Le nom se saisit directement sur une nouvelle ligne dans la sidebar : Entrée ou la coche valide, Échap annule. Aucun document vide n’est créé avant validation. Les sections ont une icône de dossier, les chapitres un livre ouvert et les scènes une feuille. Les scènes peuvent rester à la racine, dans une section ou dans un chapitre. Un chapitre ne peut pas être placé sous un autre chapitre, même par déplacement d’une section intermédiaire ; le + de chaque conteneur ajoute directement à cet emplacement. Les anciens dossiers sont présentés comme des sections, sans changer leur contenu. Le clic droit conserve les actions de rangement ; les outils de sélection apparaissent pour une sélection multiple.

Sources présente les entités indexées du Vault ariane et des vaults Obsidian connectés, regroupées par leur type. Choisissez un vault, puis dépliez Personne, Lieu ou un autre type présent dans ses données. Les documents sans type restent accessibles sous Note. Le nom d’une entité ouvre le lecteur existant. Les réglages de connexion et d’indexation restent accessibles via « Gérer les vaults… ».

Dans l’arbre, ⌘-clic sélectionne plusieurs éléments et ⇧-clic une plage visible. « Déplacer… » choisit une section, un chapitre ou la racine ; le glisser-déposer distingue avant, après et dedans. Déposer sur Textes déplace la sélection à la racine du projet. La duplication conserve le texte et les liens documentaires d’une branche.

La corbeille conserve les documents et leurs descendants. Restaurer un enfant rétablit aussi ses parents nécessaires, sans restaurer ses frères supprimés. « Annuler le dernier rangement » (ou ⌘ Z lorsque le focus est dans l’arbre) annule création, déplacement, duplication, mise à la corbeille ou restauration sans effacer les textes modifiés entre-temps. Les documents dont la création ou la duplication est annulée restent récupérables dans la corbeille. L’historique de rangement survit à la réouverture ; adopter une ancienne version du projet le réinitialise.

La loupe du bas ou ⌘ F ouvre la recherche. La saisie sélectionne et affiche directement la première occurrence dans le texte ouvert. Les flèches ↑/↓ parcourent les occurrences précédentes et suivantes en boucle, depuis le champ ou depuis l’éditeur tant que la recherche reste ouverte. La recherche ne montre aucune liste de passages et ne change pas de texte pour chercher ailleurs dans le projet.

Les fiches trouvées dans les vaults apparaissent dans de petites cartes flottantes au-dessus du champ, deux à la fois. Elles ne remplacent pas les suggestions et notes déjà présentes dans la marge. **Ajouter à la marge** y conserve volontairement une fiche pour le texte concerné, y compris après fermeture de la recherche et réouverture du projet. Le bouton de retrait enlève ce repère sans supprimer la fiche ni ses autres associations. Dans une fenêtre trop étroite pour afficher la marge habituelle, le repère reste enregistré.

## Sources et vaults

Dans la marge, le nom de chaque fiche prend la couleur de son type. Survolez une mention ou placez-y le focus avec Tab pour lire son type, la raison de sa présence et sa description ou un extrait. Un clic ou la touche Entrée ouvre la fiche complète.

À la création d’un projet, ariane peut connecter un vault Obsidian existant en lecture seule, ou créer un dossier `Vault` dans le projet. Ce vault personnel contient des modèles Markdown avec front-matter pour les personnes, lieux, organisations, événements, concepts, croyances et traditions, œuvres, documents et objets. Leurs propriétés généralisent les modèles de RLC System ; elles restent vides tant qu’elles ne sont pas renseignées.

Dans « Sources du projet », « Nouvelle fiche » crée une note dans le vault personnel et actualise son index pour la détection dans le texte. Un projet existant peut également recevoir un vault personnel depuis ce panneau. Les vaults Obsidian connectés restent en lecture seule ; leurs notes et leur configuration ne sont pas modifiées. Dans l’aperçu navigateur, ces fiches sont simulées dans le stockage du navigateur et aucun dossier n’est créé.

## Passages et hiérarchie


Entrée crée un nouveau passage ; Maj+Entrée ajoute un retour interne dans le même passage. Tab indente le passage sous son frère précédent, Maj+Tab le remonte. Option+↑/↓ déplace sa branche parmi ses frères. Un petit point apparaît lorsqu'on approche de sa zone : glissez-le pour déplacer la branche dans la scène, ou cliquez dessus pour replier ses enfants. Une branche repliée conserve un chevron visible à la place du point ; cliquer sur ce chevron la déplie. Les mêmes actions figurent dans la palette de commandes.

Le texte, les identifiants et la hiérarchie sont sauvegardés ensemble dans le projet. Cmd+Z annule également les opérations de structure. Les anciens documents conservent leur texte ; leurs blocs Markdown servent de passages initiaux. Le déplacement entre scènes et les références partagées ne font pas encore partie de cet incrément.
## Dictée locale


La dictée utilise Parakeet TDT v3 de NVIDIA (CC BY 4.0, conversion MLX 4 bits par Animas Labs) et Spokenly Cleanup 1 (Apache 2.0). Spokenly indique prendre en charge le français, l’anglais, l’allemand et l’espagnol, avec une qualité moindre hors anglais ; l’italien reste en transcription brute. Les enregistrements et le traitement restent locaux.

Un clic bref sur le micro active la dictée continue ; le clic suivant l'arrête. Le texte est inséré par fragments pendant l'enregistrement. Maintenir le bouton active le push-to-talk : le relâchement arrête immédiatement l'enregistrement puis lance la transcription. Le raccourci ⌘ ⇧ M suit les mêmes règles d'appui bref ou maintenu. Aucun double appui ni glissement de verrouillage n'est nécessaire.

Le moteur Parakeet reste chargé pendant les fragments de dictée continue ; ceux-ci sont transcrits directement, sans attendre une mise au propre par le second modèle. Le push-to-talk garde la mise au propre après l'arrêt. Les modèles restent locaux. Si le manuscrit est modifié entre deux fragments, la suite est conservée dans une transcription à copier plutôt que d'écraser le texte. La dictée native n'est pas disponible dans l'aperçu navigateur.

Pour installer le moteur et les modèles sur un Mac Apple Silicon, avec Python 3 et `uv` disponibles : `python3 scripts/setup-voice.py`. Les fichiers sont placés dans les données d’ariane et téléchargés une seule fois ; la transcription fonctionne ensuite sans téléchargement. La compilation de l’application macOS est nécessaire pour prendre en compte l’autorisation du microphone et le nouveau moteur natif.

## Révision locale


Dans « Aa », le bouton « Réviser le passage » analyse la sélection ou, sans sélection, la ligne où se trouve le curseur. Les suggestions de LanguageTool et de SalamandraTA sont proposées individuellement ; aucune modification n'est appliquée sans clic. Une suggestion devient caduque si le texte a changé, et les passages traversant plusieurs scènes ne sont pas révisés. L'analyse est limitée à 800 caractères ; le modèle est volontairement conservateur et n'affiche que des changements courts dont la structure reste compatible avec le Markdown. Les suggestions restent à relire.

Installer les moteurs locaux une fois sur Mac Apple Silicon avec `python3 scripts/setup-revision.py`. Le script vérifie les empreintes et place LanguageTool 6.6, Temurin JRE 17 et SalamandraTA 2B Q8 dans les données d'ariane ; après installation, la révision n'envoie pas le texte vers Internet. Les moteurs se démarrent à la demande et s'arrêtent après une période d'inactivité. L'aperçu dans le navigateur ne dispose pas du moteur natif ; les modifications du moteur nécessitent une compilation ultérieure de l'application macOS.

Les exports PDF, Word et EPUB acceptent les images locales au projet. Les ressources distantes, liens symboliques sortant du projet et fragments HTML/TeX/Typst bruts sont refusés. L’export Markdown conserve le texte.

### Repères et rangement dans Textes

Les lignes de liaison montrent les branches du projet. Chaque entrée possède un œil : ouvert si ses textes sont inclus dans le manuscrit, barré s’ils sont exclus, en pointillés si un groupe est partiellement inclus. Cliquer sur l’œil d’une section ou d’un chapitre applique le choix à tous les textes qu’il contient ; une inclusion partielle devient une inclusion complète au clic. L’œil ne change pas le texte ouvert. Les groupes vides n’ont pas de texte à inclure.

Les textes de travail restent dans Textes, modifiables et recherchables. Ils sont indiqués en italique et exclus de « Lire le manuscrit » et de l’export « Manuscrit entier ». Un export explicite de la section actuelle conserve ses textes de travail. Les anciens projets conservent tous leurs textes inclus par défaut. L’inclusion est enregistrée avec le projet et peut être annulée comme un rangement.

Le titre en gras et bleu indique le texte ouvert ; le fond indique la sélection multiple à manipuler. Un groupe replié reprend ce traitement lorsqu’il contient le texte ouvert. La navigation vers un résultat déplie ses parents et le rend visible. Replier volontairement le groupe conserve ce repère typographique.

Dans l’arbre, les flèches gauche/droite replient, déplient et rejoignent parents/enfants ; F2 renomme sur place. Le menu d’une scène propose « Nouvelle scène après celle-ci » : son nom se saisit entre cette scène et la suivante. Le + général ajoute à la racine ; le + d’un groupe ajoute dedans.

Pendant un déplacement, la ligne indique une insertion avant/après et le contour indique une insertion dans un groupe. Le survol prolongé déplie une destination ; les bords de l’arbre font défiler la liste. Une destination interdite affiche la raison. Après rangement, le message précise l’opération et propose « Annuler ».

### Retrouver une entité dans le projet

Les fiches et les notes complètes proposent « Citée dans ce projet ». La liste rassemble les occurrences littérales du nom, des alias et des références de citation dans les textes actuels, y compris les textes de travail ; la corbeille est exclue. Les noms ambigus restent des occurrences textuelles, pas des identifications confirmées. Cliquer sur un passage ouvre et souligne l’occurrence dans le texte, en conservant la source consultable dans la marge.


### Profil et activité d’écriture

Le bouton Profil, au-dessus de la capsule de la bibliothèque, ouvre un aperçu du manuscrit courant et de ses objectifs. Le nom de plume et la présentation sont facultatifs et restent sur cet appareil.

Le calendrier suit les jours d’écriture dans les projets ouverts sur cet appareil à partir du début du suivi. Sélectionnez un jour pour voir les mots ajoutés nets : les suppressions et annulations corrigent le total du jour, tandis qu’une réécriture peut laisser un jour actif sans ajout net. Les dates précédant le suivi ne sont pas reconstituées. Les captures rapides ne sont pas comptées. Le journal du profil est local et ne fait pas partie des archives de captures ou des sauvegardes de projet.

### Apparence et versions

Le pied de la bibliothèque donne accès aux paramètres et au bouton Clair/Sombre. Le choix est conservé sur cet appareil ; les paramètres proposent aussi le thème du système. L’animation respecte la réduction des mouvements.

Les paramètres occupent un écran complet : apparence, écriture, sources et références, projet et données, raccourcis. Revenir au texte ou Échap ferme cet écran.

Les versions sont créées automatiquement par texte : premier état sauvegardé, puis toutes les cinq minutes si le contenu évolue, après 90 secondes de pause, au changement de texte ou de projet, et à la fermeture normale de l’application Mac. Une réécriture importante conserve aussi l’état précédent. Les doublons et les seuls changements de curseur ou de compteur de révision ne créent pas de version. La sauvegarde courante continue de fonctionner indépendamment, après 650 ms de pause.

L’historique automatique garde jusqu’à 40 versions par texte : les huit plus récentes, puis des états espacés par heure sur 24 heures et par jour sur 30 jours. Un plafond global de 128 Mio par projet s’applique aux données des nouvelles versions automatiques : les plus anciennes sont retirées en premier. Une version dépassant à elle seule ce plafond est ignorée. Les versions nommées, les copies avant restauration et les anciennes sauvegardes non gérées par cette rétention ne sont jamais supprimées automatiquement. Le fichier SQLite réutilise l’espace libéré ; sa taille sur disque ne diminue pas nécessairement. L’aperçu navigateur applique un plafond de 2 Mio, adapté à son stockage local. La liste ne charge que les noms et dates ; le texte d’une version est chargé à l’ouverture de la comparaison.

Versions remplace la zone du manuscrit par une comparaison en deux colonnes, dans le même cadre que l’éditeur : logo, bibliothèque, recherche et dictée restent accessibles. La bibliothèque change le texte comparé ; Revenir au texte retrouve l’édition. Une recherche mène au passage dans l’éditeur, et démarrer la dictée revient à l’écriture. Conservez un état nommé du projet ou de la section actuelle, puis choisissez une référence et une version à comparer. Les textes s’affichent côte à côte, avec retraits barrés et ajouts soulignés. Les flèches parcourent les passages modifiés ; le filtre limite la liste aux textes modifiés. Une reprise de passage crée d’abord une sauvegarde de la scène. Restaurer une version nécessite une confirmation et conserve l’état précédent. Deux versions enregistrées restent en lecture seule.

Sélectionnez une phrase dans l’une des deux versions, puis activez **Aligner ici**. Si elle apparaît une fois dans chaque version, ses deux occurrences se placent à la même hauteur. Le réglage appartient à la comparaison affichée.

En mode Versions, le bouton de réglages en bas à droite prend une icône de comparaison et ouvre les outils Versions : conserver un état, parcourir les changements, filtrer les textes modifiés et restaurer la référence. Le menu Écriture et lecture revient en quittant ce mode.

## Importer et commencer à écrire

Le menu **Fichier → Importer un manuscrit** accepte les fichiers Markdown, texte UTF-8, DOCX, les dossiers de textes et les dossiers TextBundle contenant `text.md`. L’aperçu liste les scènes à créer. L’import ajoute les textes au projet ouvert. Il ne crée pas de nouveau projet et ne conserve pas d’archive des originaux ni de rapport sur disque. Les fichiers source restent à leur emplacement. Les dossiers deviennent des sections ; les titres Markdown restent dans le texte.

Les DOCX sont convertis localement : la mise en page, les commentaires, le suivi des modifications et certains champs ne sont pas transférés dans l’éditeur. Les images Markdown inline sont reliées aux images copiées dans `assets/import-…` quand elles font partie du dossier importé. Pour garder les images d’un Markdown isolé, importer son dossier. Les liens Markdown complexes, images par référence et liens entre documents nécessitent une vérification après import. L’import direct des projets `.scriv` n’est pas pris en charge : utiliser un export Markdown ou DOCX. L’import d’un TextBundle n’importe pas les métadonnées propres à Ulysses.

Au lancement, l’accueil présente seulement Créer un projet et Ouvrir un projet. La liste des projets récents apparaît après Ouvrir. À la création, seul le nom est demandé avant le choix de l’emplacement ; les sources se règlent ensuite dans le projet.

## Rechercher, annoter et réorganiser

La recherche des textes tolère les accents, les apostrophes droites ou typographiques et les ligatures françaises. Le remplacement global avec aperçu et annulation a été retiré.

**Édition → Réorganiser le texte** permet de séparer au curseur, réunir une scène avec la suivante du même emplacement, avec copie directe du texte. Les versions de sécurité automatiques et le transport spécifique des notes et des identités de passages ajoutés à ces opérations ont été retirés. La scène absorbée par une réunion reste dans la corbeille. Ces commandes sont disponibles dans l’application Mac.

Sur Mac, placez le curseur à l’intérieur de la scène et ouvrez les commandes avec **⌘ K**. Choisissez **Scinder la scène** pour voir la fin de la première scène et le début de la seconde, puis validez avec **Entrée**. **Échap** ferme l’aperçu et rend la main à l’éditeur.

La vue d’ensemble des scènes a été retirée. Les versions distinguent aussi les changements de titre, emplacement, ordre, synopsis, statut, objectif, inclusion et plan du texte.

Sélectionner un passage puis **Annoter la sélection**, dans la barre de sélection ou le menu Édition, ouvre les annotations dans la marge des sources. Une annotation peut être modifiée, résolue puis rouverte. Elle reste séparée du manuscrit et des exports. Le passage est retrouvé par son texte exact et son contexte ; une annotation ambiguë ou dont le passage a changé est signalée comme introuvable. Les annotations restent dans le projet lors d’une restauration de version ; leur ancrage est alors réévalué.

Les fiches de sources distinguent les **références explicites** des **mentions du nom**. Une mention littérale ne confirme pas une identité. Les associations choisies par l’auteur restent une information distincte. Les citations et les références sont insérées au curseur et remplacent la sélection éventuelle. Les définitions des notes sont placées en fin de scène. À l’export, les identifiants des notes sont rendus uniques par scène.

## Langue de l’interface

ariane est disponible en français, anglais et espagnol. Choisissez la langue sur l’écran d’accueil, ou dans **Paramètres → Apparence → Langue de l’application**. Le choix s’applique immédiatement à l’interface et aux menus natifs, puis reste mémorisé sur ce Mac. La langue du document, utilisée pour la dictée et la révision, se règle séparément dans **Paramètres → Écriture**.

### Entités automatiques et alias

Une entité détectée reste colorée lorsque vous poursuivez sa phrase ou que son contexte est réanalysé. Modifier le nom lui-même retire la marque jusqu’à sa prochaine reconnaissance. Après sauvegarde et analyse, une entité nouvelle crée sa fiche dans le vault du projet. Si un nom correspond à plusieurs fiches ou ressemble de très près à un nom existant, cliquez sur la mention pour choisir la fiche correspondante ou confirmer une fiche distincte.

Dans une fiche du vault du projet, la section **Alias** accepte un nom par ligne. Renseignez sur une seule fiche les anciens noms, surnoms, pseudonymes ou noms historiques à reconnaître. Après **Enregistrer les alias**, ces formes renvoient à cette fiche. Cela fonctionne pour les personnes, les lieux et tous les types de fiches Markdown. Les alias de vaults externes sont lus depuis leurs fichiers et se modifient dans leur application d’origine.


## Entités, vues et raccourcis (0.5.0)

Dans la recherche, `/Gérer les entités` ouvre les identités du projet : occurrences, alias, confirmation, fiches et relations. Les sources externes restent consultables ; seules les fiches du vault ariane sont modifiables. Une fusion manuelle présente ses conséquences et peut être annulée depuis « Fusions précédentes » tant qu’une édition ultérieure n’empêche pas sa restauration sûre.

Saisir `#enquête + #à revoir` pour une intersection, `#enquête, #à revoir` pour une union ou `@"Marie Curie" + #enquête` pour combiner identité et tag. ET a priorité sur OU. Utiliser les propositions pour choisir un homonyme. « Afficher les passages » ouvre une vue en consultation ; cliquer sur un passage rejoint son original. Une analyse en attente ne signifie pas qu’aucune mention n’existe.

Donner un nom à une requête puis « Enregistrer la vue » la rend accessible depuis la même barre de recherche. Les IDs conservés permettent de retrouver tags et entités après renommage ; une référence manquante est signalée. La vue peut être renommée, modifiée ou supprimée.

`/Configurer les raccourcis` ouvre leur page dans les paramètres. Sélectionner un champ et presser la combinaison souhaitée ; un conflit explique quelle action l’utilise. Les actions Retirer et Rétablir les raccourcis par défaut permettent de revenir au réglage voulu. Le raccourci global de capture arrive avec le jalon 0.6.0.

## Annoter un PDF ou une image sur Mac

1. Ouvrez le document depuis les sources du projet ou un résultat de recherche. Vous pouvez continuer à écrire à gauche. Les flèches du lecteur changent de page et les boutons − et + règlent le zoom.
2. Sélectionnez le passage à relier dans le manuscrit. Dans le PDF, sélectionnez les mots, ou activez **Zone** pour tracer un cadre. Sur une image ou un scan, tracez directement le cadre. Au clavier, placez le focus sur la zone et utilisez les flèches pour déplacer le cadre, ou Maj et les flèches pour le redimensionner.
3. Choisissez **Relier au passage du manuscrit**. Vérifiez le passage et la cible, écrivez votre note, puis choisissez **Ajouter l’annotation**. Vous pouvez aussi choisir la cible documentaire avant de sélectionner le passage à gauche.
4. Dans **Annotations**, **Retrouver la source** rouvre la bonne page avec le passage surligné ou la zone encadrée. Si le fichier a changé ou a été déplacé, choisissez **Rattacher à une source**, ouvrez le bon document, sélectionnez à nouveau la cible puis choisissez **Confirmer le nouveau lien**. Si le vault demande une autorisation, reconnectez son dossier dans **Sources du projet**.

Pour lire une note de bas de page, activez le signe † dans la phrase, au clic, avec Entrée ou avec Espace. La définition apparaît sous la ligne. Activez à nouveau l’appel pour la replier et retrouver le focus. Le manuscrit et son export conservent la syntaxe Markdown de la note.
