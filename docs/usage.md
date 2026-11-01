# Utiliser Ariane

## Bibliothèque et rangement

Ouvrez le classeur avec ⌘ ⇧ B. Au survol du bord gauche, le chevron d’ouverture suit la hauteur du curseur ; le chevron de repli fait de même sur la bordure de la sidebar. Le chevron du titre déroule le catalogue sous le nom du projet et décale les onglets vers le bas : projets récemment ouverts, épinglés et archivés. Archiver un projet le retire des récents sans déplacer ni supprimer son dossier. Les projets antérieurs apparaissent dès leur prochaine ouverture.

Les onglets **Textes** et **Sources** partagent le même panneau, sans champ de recherche. Textes réunit les scènes et les anciennes notes dans une seule arborescence : les textes inclus dans le manuscrit participent à la lecture continue, au comptage et à l’export du projet. Le bouton + ajoute une section, un chapitre ou une scène. Le nom se saisit directement sur une nouvelle ligne dans la sidebar : Entrée ou la coche valide, Échap annule. Aucun document vide n’est créé avant validation. Les sections ont une icône de dossier, les chapitres un livre ouvert et les scènes une feuille. Les scènes peuvent rester à la racine, dans une section ou dans un chapitre. Un chapitre ne peut pas être placé sous un autre chapitre, même par déplacement d’une section intermédiaire ; le + de chaque conteneur ajoute directement à cet emplacement. Les anciens dossiers sont présentés comme des sections, sans changer leur contenu. Le clic droit conserve les actions de rangement ; les outils de sélection apparaissent pour une sélection multiple.

Sources présente les entités indexées du Vault Ariane et des vaults Obsidian connectés, regroupées par leur type. Choisissez un vault, puis dépliez Personne, Lieu ou un autre type présent dans ses données. Les documents sans type restent accessibles sous Note. Le nom d’une entité ouvre le lecteur existant. Les réglages de connexion et d’indexation restent accessibles via « Gérer les vaults… ».

Dans l’arbre, ⌘-clic sélectionne plusieurs éléments et ⇧-clic une plage visible. « Déplacer… » choisit une section, un chapitre ou la racine ; le glisser-déposer distingue avant, après et dedans. Déposer sur Textes déplace la sélection à la racine du projet. La duplication conserve le texte et les liens documentaires d’une branche.

La corbeille conserve les documents et leurs descendants. Restaurer un enfant rétablit aussi ses parents nécessaires, sans restaurer ses frères supprimés. « Annuler le dernier rangement » (ou ⌘ Z lorsque le focus est dans l’arbre) annule création, déplacement, duplication, mise à la corbeille ou restauration sans effacer les textes modifiés entre-temps. Les documents dont la création ou la duplication est annulée restent récupérables dans la corbeille. L’historique de rangement survit à la réouverture ; adopter une ancienne version du projet le réinitialise.

La loupe du bas, ⌘ F ou ⌘ ⇧ F ouvre une recherche commune aux textes du projet courant et à ses vaults. Les passages apparaissent sous le champ : cliquez sur un résultat, ou choisissez-le avec ↑/↓ puis Entrée, pour ouvrir le document et rejoindre l’occurrence surlignée. La recherche reste ouverte pendant la navigation. Les résultats des vaults apparaissent simultanément dans la marge, même sans correspondance dans le manuscrit ; cliquer sur une source ouvre sa fiche habituelle. Fermer ou vider la recherche rétablit les suggestions automatiques. Les textes supprimés sont exclus ; seuls les 200 premiers passages sont affichés, avec le nombre total. La recherche des vaults conserve ses mécanismes textuels et sémantiques locaux ; une erreur de ce moteur ne bloque pas les résultats du manuscrit.

## Sources et vaults


À la création d’un projet, Ariane peut connecter un vault Obsidian existant en lecture seule, ou créer un dossier `Vault` dans le projet. Ce vault personnel contient des modèles Markdown avec front-matter pour les personnes, lieux, organisations, événements, concepts, croyances et traditions, œuvres, documents et objets. Leurs propriétés généralisent les modèles de RLC System ; elles restent vides tant qu’elles ne sont pas renseignées.

Dans « Sources du projet », « Nouvelle fiche » crée une note dans le vault personnel et actualise son index pour la détection dans le texte. Un projet existant peut également recevoir un vault personnel depuis ce panneau. Les vaults Obsidian connectés restent en lecture seule ; leurs notes et leur configuration ne sont pas modifiées. Dans l’aperçu navigateur, ces fiches sont simulées dans le stockage du navigateur et aucun dossier n’est créé.

## Passages et hiérarchie


Entrée crée un nouveau passage ; Maj+Entrée ajoute un retour interne dans le même passage. Tab indente le passage sous son frère précédent, Maj+Tab le remonte. Option+↑/↓ déplace sa branche parmi ses frères. Un petit point apparaît lorsqu'on approche de sa zone : glissez-le pour déplacer la branche dans la scène, ou cliquez dessus pour replier ses enfants. Une branche repliée conserve un chevron visible à la place du point ; cliquer sur ce chevron la déplie. Les mêmes actions figurent dans la palette de commandes.

Le texte, les identifiants et la hiérarchie sont sauvegardés ensemble dans le projet. Cmd+Z annule également les opérations de structure. Les anciens documents conservent leur texte ; leurs blocs Markdown servent de passages initiaux. Le déplacement entre scènes et les références partagées ne font pas encore partie de cet incrément.
## Dictée locale


La dictée utilise Parakeet TDT v3 de NVIDIA (CC BY 4.0, conversion MLX 4 bits par Animas Labs) et Spokenly Cleanup 1 (Apache 2.0). Spokenly indique prendre en charge le français, l’anglais, l’allemand et l’espagnol, avec une qualité moindre hors anglais ; l’italien reste en transcription brute. Les enregistrements et le traitement restent locaux.

Un clic bref sur le micro active la dictée continue ; le clic suivant l'arrête. Le texte est inséré par fragments pendant l'enregistrement. Maintenir le bouton active le push-to-talk : le relâchement arrête immédiatement l'enregistrement puis lance la transcription. Le raccourci ⌘ ⇧ M suit les mêmes règles d'appui bref ou maintenu. Aucun double appui ni glissement de verrouillage n'est nécessaire.

Le moteur Parakeet reste chargé pendant les fragments de dictée continue ; ceux-ci sont transcrits directement, sans attendre une mise au propre par le second modèle. Le push-to-talk garde la mise au propre après l'arrêt. Les modèles restent locaux. Si le manuscrit est modifié entre deux fragments, la suite est conservée dans une transcription à copier plutôt que d'écraser le texte. La dictée native n'est pas disponible dans l'aperçu navigateur.

Pour installer le moteur et les modèles sur un Mac Apple Silicon, avec Python 3 et `uv` disponibles : `python3 scripts/setup-voice.py`. Les fichiers sont placés dans les données d’Ariane et téléchargés une seule fois ; la transcription fonctionne ensuite sans téléchargement. La compilation de l’application macOS est nécessaire pour prendre en compte l’autorisation du microphone et le nouveau moteur natif.

## Révision locale


Dans « Aa », le bouton « Réviser le passage » analyse la sélection ou, sans sélection, la ligne où se trouve le curseur. Les suggestions de LanguageTool et de SalamandraTA sont proposées individuellement ; aucune modification n'est appliquée sans clic. Une suggestion devient caduque si le texte a changé, et les passages traversant plusieurs scènes ne sont pas révisés. L'analyse est limitée à 800 caractères ; le modèle est volontairement conservateur et n'affiche que des changements courts dont la structure reste compatible avec le Markdown. Les suggestions restent à relire.

Installer les moteurs locaux une fois sur Mac Apple Silicon avec `python3 scripts/setup-revision.py`. Le script vérifie les empreintes et place LanguageTool 6.6, Temurin JRE 17 et SalamandraTA 2B Q8 dans les données d'Ariane ; après installation, la révision n'envoie pas le texte vers Internet. Les moteurs se démarrent à la demande et s'arrêtent après une période d'inactivité. L'aperçu dans le navigateur ne dispose pas du moteur natif ; les modifications du moteur nécessitent une compilation ultérieure de l'application macOS.

Les exports PDF, Word et EPUB acceptent les images locales au projet. Les ressources distantes, liens symboliques sortant du projet et fragments HTML/TeX/Typst bruts sont refusés. L’export Markdown conserve le texte.

### Repères et rangement dans Textes

Les lignes de liaison montrent les branches du projet. Chaque entrée possède un œil : ouvert si ses textes sont inclus dans le manuscrit, barré s’ils sont exclus, en pointillés si un groupe est partiellement inclus. Cliquer sur l’œil d’une section ou d’un chapitre applique le choix à tous les textes qu’il contient ; une inclusion partielle devient une inclusion complète au clic. L’œil ne change pas le texte ouvert. Les groupes vides n’ont pas de texte à inclure.

Les textes de travail restent dans Textes, modifiables et recherchables. Ils sont indiqués en italique et exclus de « Lire le manuscrit » et de l’export « Manuscrit entier ». Un export explicite de la section actuelle conserve ses textes de travail. Les anciens projets conservent tous leurs textes inclus par défaut. L’inclusion est enregistrée avec le projet et peut être annulée comme un rangement.

Le titre en gras et bleu indique le texte ouvert ; le fond indique la sélection multiple à manipuler. Un groupe replié reprend ce traitement lorsqu’il contient le texte ouvert. La navigation vers un résultat déplie ses parents et le rend visible. Replier volontairement le groupe conserve ce repère typographique.

Dans l’arbre, les flèches gauche/droite replient, déplient et rejoignent parents/enfants ; F2 renomme sur place. Le menu d’une scène propose « Nouvelle scène après celle-ci » : son nom se saisit entre cette scène et la suivante. Le + général ajoute à la racine ; le + d’un groupe ajoute dedans.

Pendant un déplacement, la ligne indique une insertion avant/après et le contour indique une insertion dans un groupe. Le survol prolongé déplie une destination ; les bords de l’arbre font défiler la liste. Une destination interdite affiche la raison. Après rangement, le message précise l’opération et propose « Annuler ».

### Retrouver une entité dans le projet

Les fiches et les notes complètes proposent « Citée dans ce projet ». La liste rassemble les occurrences littérales du nom, des alias et des références de citation dans les textes actuels, y compris les textes de travail ; la corbeille est exclue. Les noms ambigus restent des occurrences textuelles, pas des identifications confirmées. Cliquer sur un passage ouvre et souligne l’occurrence dans le texte, en conservant la source consultable dans la marge.


### Apparence et versions

Le pied de la bibliothèque donne accès aux paramètres et au bouton Clair/Sombre. Le choix est conservé sur cet appareil ; les paramètres proposent aussi le thème du système. L’animation respecte la réduction des mouvements.

Les paramètres occupent un écran complet : apparence, écriture, sources et références, projet et données, raccourcis. Revenir au texte ou Échap ferme cet écran.

Versions remplace la zone du manuscrit par une comparaison en deux colonnes, dans le même cadre que l’éditeur : logo, bibliothèque, recherche et dictée restent accessibles. La bibliothèque change le texte comparé ; Revenir au texte retrouve l’édition. Une recherche mène au passage dans l’éditeur, et démarrer la dictée revient à l’écriture. Conservez un état nommé du projet ou de la section actuelle, puis choisissez une référence et une version à comparer. Les textes s’affichent côte à côte, avec retraits barrés et ajouts soulignés. Les flèches parcourent les passages modifiés ; le filtre limite la liste aux textes modifiés. Une reprise de passage crée d’abord une sauvegarde de la scène. Restaurer une version nécessite une confirmation et conserve l’état précédent. Deux versions enregistrées restent en lecture seule.

En mode Versions, le bouton de réglages en bas à droite prend une icône de comparaison et ouvre les outils Versions : conserver un état, parcourir les changements, filtrer les textes modifiés et restaurer la référence. Le menu Écriture et lecture revient en quittant ce mode.

## Importer et commencer à écrire

Le menu **Fichier → Importer un manuscrit** accepte les fichiers Markdown, texte UTF-8, DOCX, les dossiers de textes et les dossiers TextBundle contenant `text.md`. L’aperçu liste les scènes à créer. L’import ajoute les textes au projet ouvert. Il ne crée pas de nouveau projet et ne conserve pas d’archive des originaux ni de rapport sur disque. Les fichiers source restent à leur emplacement. Les dossiers deviennent des sections ; les titres Markdown restent dans le texte.

Les DOCX sont convertis localement : la mise en page, les commentaires, le suivi des modifications et certains champs ne sont pas transférés dans l’éditeur. Les images Markdown inline sont reliées aux images copiées dans `assets/import-…` quand elles font partie du dossier importé. Pour garder les images d’un Markdown isolé, importer son dossier. Les liens Markdown complexes, images par référence et liens entre documents nécessitent une vérification après import. L’import direct des projets `.scriv` n’est pas pris en charge : utiliser un export Markdown ou DOCX. L’import d’un TextBundle n’importe pas les métadonnées propres à Ulysses.

Au lancement, l’accueil présente seulement Créer un projet et Ouvrir un projet. La liste des projets récents apparaît après Ouvrir. À la création, seul le nom est demandé avant le choix de l’emplacement ; les sources se règlent ensuite dans le projet.

## Rechercher, annoter et réorganiser

La recherche des textes tolère les accents, les apostrophes droites ou typographiques et les ligatures françaises. Le remplacement global avec aperçu et annulation a été retiré.

**Édition → Réorganiser le texte** permet de séparer au curseur, réunir une scène avec la suivante du même emplacement, avec copie directe du texte. Les versions de sécurité automatiques et le transport spécifique des notes et des identités de passages ajoutés à ces opérations ont été retirés. La scène absorbée par une réunion reste dans la corbeille. Ces commandes sont disponibles dans l’application Mac.

La vue d’ensemble des scènes a été retirée. Les versions distinguent aussi les changements de titre, emplacement, ordre, synopsis, statut, objectif, inclusion et plan du texte.

Sélectionner un passage puis **Annoter la sélection**, dans la barre de sélection ou le menu Édition, ouvre les annotations dans la marge des sources. Une annotation peut être modifiée, résolue puis rouverte. Elle reste séparée du manuscrit et des exports. Le passage est retrouvé par son texte exact et son contexte ; une annotation ambiguë ou dont le passage a changé est signalée comme introuvable. Les annotations restent dans le projet lors d’une restauration de version ; leur ancrage est alors réévalué.

Les fiches de sources distinguent les **références explicites** des **mentions du nom**. Une mention littérale ne confirme pas une identité. Les associations choisies par l’auteur restent une information distincte. Les citations et les références sont insérées au curseur et remplacent la sélection éventuelle. Les définitions des notes sont placées en fin de scène. À l’export, les identifiants des notes sont rendus uniques par scène.
