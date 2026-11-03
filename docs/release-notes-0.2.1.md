# Ariane 0.2.1

Version de développement du 3 novembre 2026, non publiée. Les manifestes npm, Cargo et Tauri utilisent `0.2.1`, sans suffixe alpha. Cette passe porte sur les 40 points retenus dans l’audit de sécurité et de performances. Les numéros ci-dessous conservent ceux de cet audit.

Les changements visent la robustesse des sauvegardes, la limitation des traitements natifs et la réactivité sur les gros projets. Ils conservent les modèles sémantiques et leurs seuils. Les variantes retenues et les limites de validation sont explicitées ci-dessous ; ce document ne constitue pas une garantie d’absence de vulnérabilités.

## Stockage, sécurité et dépendances

| Point | Changement intégré |
| --- | --- |
| 1 | Validation des identifiants avant leur emploi dans les fichiers du projet et les restaurations : composants vides, séparateurs, NUL, `.` et `..` refusés. Les identifiants historiques compatibles restent acceptés. |
| 2 | Accès aux miroirs et copies de récupération relatifs à des descripteurs de dossiers, avec refus des liens symboliques et fichiers spéciaux. Vérification de la base et de ses fichiers annexes ; ouverture SQLite avec `NOFOLLOW`. |
| 3 | Fichiers temporaires uniques, création exclusive, permissions privées, synchronisation du contenu puis renommage et synchronisation du dossier. |
| 4 | Accusé des révisions durablement enregistrées dans SQLite séparé des erreurs de miroir. Une table persistante permet de reprendre les miroirs inachevés sans perdre le suivi des brouillons. |
| 6 | Sérialisation des protocoles d’écriture par projet, au-delà du commit SQLite ; verrou système conservé pendant l’ouverture du projet et les opérations encore en cours. Test d’exclusion d’une seconde instance. |
| 11 | Extraction PDF interrompable, limitée à 30 secondes, 500 pages et 8 Mio de texte. Le processus et son groupe sont arrêtés en cas de dépassement ou d’annulation. |
| 12 | Validation des budgets des requêtes avant désérialisation typée et travail bloquant. Files d’attente bornées, capacité distincte pour les sauvegardes et abandon des demandes de recherche/révision dépassées. |
| 13 | Permissions Tauri explicites et dialogues pilotés par Rust. Les opérations sur des chemins externes exigent un chemin accordé par le dialogue approprié ; l’ouverture des projets déjà connus reste possible. Les autorisations temporaires expirent après 30 minutes. |
| 14 | Clients HTTP des moteurs locaux sans proxy ni redirection, délais et réponses JSON bornés, contrôle que le processus attendu est toujours vivant. |
| 15 | Lecture des sorties des workers avec plafond avant allocation complète, canaux bornés et réinitialisation des workers qui violent le protocole. |
| 16 | Mise à niveau vers `zip` 9 et revalidation des tests d’import DOCX. Voir l’[avis RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0429.html). |
| 17 | Remplacement de `serde_yaml`/`unsafe-libyaml` par `serde-saphyr`, avec limites de taille, profondeur et expansion ; conservation des conventions de métadonnées testées. |
| 18 | Verrous complets des environnements Python, dépendances transitives et empreintes incluses. Installation dans un dossier provisoire, vérification des modèles par révision et empreinte, validation avant activation et conservation de l’installation précédente. MLX est fixé à 0.29.4. |
| 19 | Audits npm, Rust, Python et moteurs natifs en CI, à chaque changement et chaque semaine ; actions GitHub épinglées par SHA. Politique d’exceptions précise et expirante pour les avis Python décrits plus bas. |

## Recherche, édition et sources

| Point | Changement intégré et portée |
| --- | --- |
| 21 | Recherche du manuscrit dans un worker, mises à jour des seules sections modifiées et rejet des réponses obsolètes. |
| 22 | Cache de normalisation par contenu de section, invalidé aussi par les brouillons ; tables d’offsets UTF-16 compactes et traitement rapide des caractères ASCII. |
| 23 | Parcours des occurrences sans tableau intermédiaire de tous les résultats. Total conservé et affichage limité à 200 résultats. Le calcul du total parcourt encore le texte correspondant. |
| 24 | Mapping des tableaux inchangés et réutilisation de leurs descriptions ; les tableaux affectés sont reparsés. L’arbre Lezer est encore parcouru pour vérifier la validité des widgets. |
| 25 | Le remappage du plan saute le préfixe inchangé par recherche binaire. L’identité du plan est renouvelée quand le texte change pour préserver la propagation dans l’éditeur. Aucune nouvelle structure persistante : les mesures disponibles ne justifient pas cette complexité. |
| 27 | Découpage des longues sources Markdown dans un worker, pages par blocs de 24 000 caractères environ et navigation vers l’extrait. Un bloc individuel démesuré est présenté par pages de texte brut. |
| 28 | PDF et images transmis par un protocole binaire local à jetons, sans base64. Fichiers réguliers autorisés uniquement, expiration, contrôle du projet/périmètre courant, requêtes partielles limitées à 8 Mio et deux lectures simultanées. |
| 30 | Polices WOFF2 seules, avec les familles, graisses et caractères latins nécessaires. 36 fichiers et 768 768 octets, contre 72 fichiers et 1 774 212 octets auparavant : réduction de 56,7 % des octets de polices. |
| 31 | Migrations SQLite transactionnelles versionnées par `user_version` ; suppression des migrations répétées à chaque opération et ajout des index utiles. Les connexions restent ouvertes par opération, sans nouveau pool global. |
| 32 | Variante minimale retenue : une seule lecture complète des sections, ensuite réparties entre textes actifs et corbeille, et lecture groupée des états de miroir. Les textes ne sont pas encore chargés à la demande. |
| 33 | Captures d’historique limitées en SQL au périmètre demandé, avec liens et citations correspondants. |
| 34 | Index adaptés à l’historique et pagination SQL/interface par 50 versions, sans suppression automatique. |
| 35 | Validation des positions UTF-16 par parcours ordonné, sans ensemble contenant toutes les frontières du texte. |
| 36 | Conversion des positions utiles UTF-16 vers les octets en une passe pour les passages de mémoire. |
| 37 | Signatures de métadonnées persistantes, lecture et hash en flux seulement si nécessaire, puis réconciliation complète horaire. Le scan périodique reste utilisé : aucun observateur FSEvents n’est ajouté. Une erreur de parcours ne déclenche pas de suppression abusive. |
| 38 | Lots d’indexation sémantique plafonnés à 128 fragments, priorité à l’activité utilisateur, arrêt sous pression mémoire critique et reprise des vecteurs manquants. |
| 39 | Publication du texte et du plein texte avant les embeddings ; contrôle de l’empreinte avant publication d’un résultat sémantique tardif. |
| 40 | Filtrage SQL des vaults et périmètres avant désérialisation des sources, y compris en présence de données invalides d’un autre projet. |
| 41 | Générations séparées du catalogue et des vecteurs, maintenues par SQLite ; le remplissage des vecteurs conserve le catalogue en mémoire. |
| 42 | Vecteurs des sources en BLOB versionné, dimension et valeurs finies validées. Lecture des anciens JSON et migration progressive par 512 lignes. Les vecteurs propres à la mémoire du manuscrit conservent leur format actuel. |
| 43 | Au-delà du budget de cache de 128 Mio, lecture vectorielle ligne par ligne et maintien de 20 candidats sémantiques. Le catalogue et les scores par source restent résidents ; ce n’est pas un plafond de mémoire globale. |
| 44 | Filtres et pagination des sources exécutés en SQL, 50 résultats par page, résumés bornés et facettes agrégées. Les facettes sont recalculées en SQL, sans nouveau cache séparé. |
| 45 | Tables parent-enfants et parcours itératifs pour les branches et exports, avec détection des cycles. |
| 46 | Réutilisation du moteur de mise au propre vocale pendant 30 secondes d’inactivité, avec libération sous pression mémoire critique ou après erreur. Ce délai reste à ajuster par des mesures sur plusieurs dictées réelles. |
| 47 | Capture par AudioWorklet avec vidage du dernier bloc avant arrêt et encodage WAV/base64 dans un worker. Repli ScriptProcessor conservé si AudioWorklet est indisponible. |
| 49 | Maintenance des moteurs dans un cycle indépendant de 15 secondes ; un scan long ne retarde plus le déclenchement de la maintenance des autres moteurs. |

## Vérifications et mesures

`npm run verify` contrôle les ressources, les tests Python, la compilation frontend, Vitest, les tests Rust et Clippy avec avertissements interdits. La passe complète a réussi, puis les suites concernées ont été relancées après les derniers changements : **286 tests frontend, 121 tests Rust et 17 tests Python réussis**. Ils couvrent aussi le dépassement du cache vectoriel et la conservation de la fin du signal audio. Les trois tests Rust nécessitant des modèles facultatifs et un test frontend déjà désactivé ne sont pas comptés comme réussis.

Un scénario natif isolé Tauri/WKWebView a exercé un projet synthétique de 2 000 scènes, 11,24 millions de caractères et 2 500 sources : 120 insertions, sauvegarde du dernier ajout et annulation/rétablissement. Sur l’exécution finale de développement, le p95 des insertions était de 12 ms et le dernier vidage de sauvegarde de 29 ms. La recherche du manuscrit a trouvé 200 000 occurrences, dont 200 affichées, en 923 ms ; 53 images ont été affichées pendant son calcul. Ces chiffres sont des observations locales, sans référence native avant/après équivalente ; ils ne prouvent pas une accélération globale. Le faisceau JavaScript principal a légèrement augmenté, malgré la réduction des polices.

Le microbenchmark du plan n’a pas établi d’amélioration du p95. Les contrôles géométriques historiques de marge sur les petites fenêtres ne sont pas validés par ce scénario. Les comportements de saisie et de sauvegarde mentionnés ci-dessus le sont.

Les tests du protocole de fichiers vérifient les réponses partielles et la révocation des jetons quand le projet ou le périmètre change. Le rendu visuel PDF/image dans le paquet natif reste à qualifier. Les tests audio vérifient l’ordre des échantillons, la vidange du bloc partiel, le format WAV et ses valeurs ; ils ne remplacent pas une dictée réelle sous charge. Les installateurs Python sont testés avec simulation des dépendances et pannes de bascule ; aucune réinstallation du runtime personnel n’a été effectuée pendant cette passe.

## État des audits et suivi

Au 3 novembre 2026, l’audit npm et l’audit du verrou Python vocal ne signalent aucune vulnérabilité. L’audit Rust ne signale aucune vulnérabilité ; les avertissements de maintenance `proc-macro-error` et `glib` ne font pas partie du graphe de dépendances de la cible macOS arm64. La politique Rust filtre sur ce graphe exact et échoue pour un avis applicable.

Le verrou du module mémoire conserve **Transformers 4.57.6 avec six avis connus**. Ce composant n’est donc pas déclaré corrigé. Les exceptions sont limitées à cette version et à ces identifiants dans [la politique Python](../scripts/python-security-exceptions.json), avec expiration au **3 décembre 2026**. Elles reposent sur le chargement hors ligne de modèles fixés par révision et vérifiés par empreinte, et sur l’absence des chemins concernés d’entraînement, conversion de checkpoints ou chargement de code de génération personnalisé. Toute modification des modèles ou chargeurs impose une réévaluation. Tout nouvel avis, autre version ou exception expirée fait échouer le contrôle.

L’audit natif OSV couvre cinq recherches sur les composants identifiés du verrou et ne retourne aucun avis sur cette exécution. `libomp` et `gmp` restent explicitement hors de cette couverture automatisée, à examiner manuellement. Une panne de l’API ne donne pas un résultat vert.

La version n’est ni publiée ni notarifiée. Les prérequis de distribution restent ceux de la [procédure de release](releasing.md).
