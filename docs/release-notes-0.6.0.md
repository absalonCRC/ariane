# ariane 0.6.0 — Capturer, retrouver, ranger

Note historique du candidat 0.6.0, intégré ensuite aux sources 0.6.1 ; les versions et le statut ci-dessous décrivent l’état du 13 novembre.

Candidat local du **13 novembre 2026**, branche `codex/0.6.0`, depuis `099a27f` (0.5.0). Les versions npm, Cargo et Tauri sont alignées sur 0.6.0. Cette note décrit l’implémentation ; [le rapport de validation](validation-0.6.0.md) distingue les tests réussis des cas natifs non qualifiés. Aucun tag ou paquet public 0.6.0 n’est publié par ce travail.

## Capturer sans choisir de projet

Une fenêtre compacte indépendante conserve un brouillon Markdown, sa sélection et ses révisions dans la réception globale. Elle ne monte pas le Workspace, n’ouvre pas de projet et ne lance pas les moteurs documentaires. La combinaison initiale est `Mod+Shift+Space`, modifiable ou désactivable depuis les raccourcis. Son enregistrement natif est distinct des accélérateurs de l’éditeur ; un échec reste visible dans les réglages.

La sauvegarde progresse pendant la frappe, avec un déclenchement toutes les 200 ms lorsque des changements attendent. Ce délai de déclenchement n’est pas une garantie de commit en 200 ms. Échap et la fermeture conservent le brouillon ; « Terminer » ou `Mod+Enter` attendent la sauvegarde, classent la capture à ranger et préparent la suivante. Une erreur conserve le tampon et propose un réessai dans la capsule supérieure. Les réponses perdues sont rejouées avec le même identifiant d’opération.

Fermer la principale la masque après sauvegarde ; ariane continue de fonctionner. Le Dock la réaffiche. Quitter attend les acquittements des deux fenêtres, y compris la compacte masquée, et refuse la sortie lorsqu’une sauvegarde échoue. Les ressources de dictée sont arrêtées avant la sauvegarde finale et ne redémarrent pas automatiquement.

## Retrouver et ranger

La boîte de réception est accessible depuis la bibliothèque, les commandes et le menu Fichier, y compris sans projet ouvert. Elle propose recherche par texte, pagination, captures à ranger et originaux déjà rangés. Créer une destination reprend le parcours de création habituel puis revient à la capture choisie.

Le rangement indique le projet et la variante actifs. Il crée un texte de travail **hors manuscrit**, conserve l’original global et propose ensuite de rejoindre le texte. Il ne remplace aucune scène. L’intention globale, le reçu transactionnel du projet et l’identifiant réservé permettent de reprendre une opération interrompue sans doublon ni réécriture d’une édition ultérieure. Une destination remplacée ou une variante différente est refusée. Une restauration de version ne supprime pas les reçus et ne provoque pas de réimport automatique.

## Écriture et récupération

La compacte reprend les transactions CodeMirror, la sélection UTF-16, l’historique d’annulation, le curseur et le défilement machine à écrire. Les deux éditeurs partagent les règles de sons et un volume global ; les activations sonores du manuscrit restent propres au projet. Le volume nul coupe les sources actives. Composition, collage, raccourcis et lecture seule restent silencieux. Les animations respectent les préférences de mouvement réduit.

Une archive SQLite globale, avec manifeste de format 1, contient captures, réglages et journaux. La restauration suspend les mutations des fenêtres, les sauvegarde et crée une copie de retour. Elle fusionne les données : un brouillon plus récent reste intact, les textes divergents deviennent des captures distinctes, une restauration répétée ne les duplique pas. **Les projets, vaults et moteurs ne font pas partie de cette archive** ; ils doivent être sauvegardés séparément.

## Compatibilité et validation

- Projets : schéma **4→5**, avec copie cohérente préalable dans `recuperation/avant-captures-….sqlite`, identité durable de base et table de reçus. Un ancien exécutable refuse le schéma 5.
- Réception globale : nouveau schéma **1**, dans `inbox.sqlite` du répertoire de données de l’application, avec verrou d’instance et refus d’un schéma futur. Aucun profil existant n’est réinitialisé.
- Vérification complète : **412 tests TypeScript, 197 Rust et 27 Python réussis**, ressources, build, 106 noms IPC concordants et Clippy sans avertissement. Deux tests TypeScript et douze Rust restent ignorés.
- Recette native sur données synthétiques : trois captures dans deux projets, classement dans une variante, réessai après panne de sauvegarde, conservation après arrêt forcé, sauvegarde et fusion répétée. Détails et preuves supplémentaires dans [la validation](validation-0.6.0.md).
- Bundle local arm64 pour macOS 26+, nom visible `ariane`, signature ad hoc, ressources et structure vérifiées. Le bundle standard porte `fr.ariane.writer` ; le bundle exact de recette est conservé séparément avec un identifiant distinct. L’application installée n’a pas été remplacée.

Le geste physique du raccourci global depuis une autre application, le débranchement d’écran, l’écoute réelle des sons, la dictée au microphone, l’endurance, la notarisation et l’installation sur un autre Mac restent non qualifiés. Le clic sur le menu natif Annuler est resté sans effet dans la compacte, alors que son raccourci CodeMirror fonctionne. L’implémentation ne suffit donc pas à déclarer toute la matrice native 0.6.0 validée. Aucun gain de performance ou budget de latence mesuré n’est annoncé.
