# Utiliser Ariane

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
