# M21 — Registry, Manager et profils : préparation A4 Mission 003

18 octobre 2026. Proposition à instruire DEC-04/05/06/07/14/18, dépendances M17 et M15. Aucun Registry Studio implémenté ; aucun outil n'est déclaré vérifié par cet inventaire. HEAD de lecture `a09c11d397c8527987c3d1c4410ebb2eb240a819`.

## Constat ciblé conservé, sans nouvel audit général

`apps/web/src/modules/atelier/nouveau/outils.ts:84` contient `id:echelle`, famille créer, fiche DA-07-13, icône ⫴, objet d'accès toiture. Même fichier ligne120 : `id:echelle`, famille modifier, fiche DA-02-05, icône ⤢, transformation d'homothétie. Ligne150 construit `OUTILS_PAR_ID` avec Object.fromEntries ; dans le littéral actuel le second élément remplace le premier pour cette clé. `AtelierNouveau.tsx:473` résout les favoris par cette map. `packages/planche-model/src/catalogue-outils.ts:1061` expose aussi `echelle`, libellé SketchUp Scale, raccourci S : outil de transformation dans un autre catalogue. Ceci prouve une collision de métadonnées, **pas un bug utilisateur reproduit dans cette mission**. Ne pas supprimer l'objet industriel ni renommer les commandes persistées arbitrairement.

## Identité et compatibilité proposées

Définir un toolId canonique stable, distinct du label traduit, raccourci, icône et commandType. Candidats illustratifs à arbitrer, pas IDs acquis : `fadi.architecture.ladder.create`, `fadi.transform.scale2d`, `fadi.planche.scale3d`. Si la transformation constitue une même capacité multi-contexte, un seul ID canonique avec adaptateurs explicitement testés peut remplacer les deux derniers ; ne pas fusionner sur simple ressemblance de label.

Table d'alias **scopée et versionnée** : `{ sourceCatalogue, sourceVersion, legacyId, ficheOuContexte?, canonicalToolId, migrationRule }`. `echelle` seul n'est pas suffisant. L'ancien favori ambigu sans catalogue/fiche doit être affiché « Choix à préciser » avec alternatives nommées, prévisualisation sans mutation, décision utilisateur tracée. Aucun choix par défaut vers homothétie ou échelle d'accès. La résolution d'alias doit être unique ou refuser explicitement ; chaînes/cycles et collisions rejetées. Conserver provenance/compatibilité en lecture des profils historiques ; modifier le profil uniquement sur décision explicite, sauvegarde et retour arrière. Pas de migration en base sous ce mandat.

L'alias UI ne change pas le schéma des commandes/historique. A2/M05/M17 déterminent quels IDs sont réellement persistés, machines et commandes ciblées, copies détachées/offline ; les commandes historiques gardent leur sens. Un manifeste signé/vérifié n'autorise jamais son exécution par lui-même.

## Manifeste logique candidat

Pour chaque capacité : toolId/version du contrat, propriétaire métier, domaines/planches compatibles, finalité, paramètres/validation, conditions de contexte, permissions requises, commandType/version, effets/dérivés, données propriétaires, preview/annulation et reprise, loaders littéraux/dépendances/ressources, politique offline, icône dédiée/barre/raccourci, labels/aide FR source et EN, provenance/licence, tests et état de vérification. Pas d'URL de script arbitraire dans profil importé. Figer schéma/compatibilité et validation build dans DEC-05 ; les modèles métier ne sont pas stockés dans le Registry.

État d'un outil = dimensions indépendantes : visibilité dans profil ; contexte compatible ; autorisation effective ; ressource disponible (non chargée/en chargement/prête/échec, et cached/non cached) ; exécution (inactive/active/preview/pending/failed). Un bouton masqué n'est ni désinstallé ni interdit ; un outil du catalogue non présent offline n'est pas prêt. L'interface fournit motif et action à chaque indisponibilité sans fuite d'information sensible.

## Contrat Manager proposé

Recherche/catalogue léger sans initialisation des moteurs ; recherche FR/EN et synonymes retourne IDs distincts avec contexte et disponibilité explicite ; favoris/groupes/raccourcis personnalisés ne modifient ni données, ni révision, ni droits. Le profil d'essai de vingt outils n'est pas un catalogue final ou plafond.

Cycle logique activation : résoudre ID canonique et alias ; contrôler contexte/permissions côté client pour guidage ; résoudre/versionner dépendances ; mutualiser chargement d'une même ressource ; présenter progression/erreur ; activer machine liée au contexte immuable ; preview transitoire ; dispatcher intention vers commandes validées serveur ; appliquer résultat courant seulement. Une activation d'outil rare charge au besoin, pas tous les moteurs au démarrage.

Désactivation : terminer ou annuler preview selon contrat ; ne pas abandonner commande pending ni détruire ressource partagée utilisée ailleurs ; libérer listeners/handles ; garder les résultats confirmés dans leurs propriétaires et non dans la scène. Refus de chargement ne produit pas commande vide. Changement de profil pendant geste suit NAV-007. Activation simultanée/double clic, outil remplacé pendant chargement et résultat tardif possèdent tests ; aucun ancien outil ne s'active dans un nouveau projet.

## Profils et UX proposés

Profil standard = quatre domaines et outillage retenu au pilote ; métier = sélection versionnée d'outils/placement/raccourcis ; personnel = préférences propres avec favoris/panneaux/barres. Partage équipe exige permission distincte, version, propriétaire et stratégie de conflit à décider DEC-04. Import : schéma/limites/versions validés, outils inconnus conservés comme références non exécutables avec rapport, pas suppression silencieuse ; outil interdit reste inexécutable même si visible.

Barres : chaque outil Planche/commande livrée garde son icône propre, barre appropriée et raccourci (D-202), tactile nommé. Détecter collisions de raccourcis entre contexte, OS/navigateur et saisie texte. Les changements de profil ne réécrivent pas raccourcis relevés historiquement sans déclaration de couche Fadi. Favoris hors barre trouvables par recherche. Classements libellés FR/EN ne changent pas identités ; profil contient IDs et préférences, jamais géométrie ni jeton de permission.

Offline : action explicite « Préparer ce profil hors connexion » présente tailles/ressources disponibles/erreurs et version ; quota/cache refusé n'est pas succès. Reconnexion revalide droits, contexte, versions et commandes. Version SW/manifeste incompatible garde profil/file anciens récupérables et empêche exécution risquée ; une mise à jour ne vide pas les commandes locales.

## Sous-lots et acceptation à préparer avant code

| Sous-lot proposé | Responsable futur | Entrées / critères discriminants |
|---|---|---|
| B1 identités/alias/inventaire | A2/M05 + A4, A3 autorisé | Collision echelle qualifiée ; IDs uniques ; ambiguïté refuse ; aucune capacité supprimée ; mapping versions et commandTypes établi. |
| B2 schéma manifestes | A2 sécurité, A3 autorisé | DEC-05, validation positifs/négatifs, loaders autorisés/littéraux et graphe de dépendances ; aucun import de script depuis profil. |
| B3 recherche/profils/UX | A4 + A3 autorisé | DEC-04/06 ; favoris persistants, conflits de raccourcis visibles, droit refusé indépendamment du profil ; TEST-017/018/019. |
| B4 chargement/cache/offline | A2/A6 + A3 autorisé | DEC-07/14 et M15 ; trace réseau/bundle/précache et mémoire à froid/chaud ; TEST-016/020/021/036. |
| B5 lifecycle/transition | A4/A2 + A3 autorisé | Activation/désactivation et NAV-007, retry/idempotence, deux consumers partagés, pas d'écouteurs dupliqués ni commande réadressée. |

Oracles positifs/négatifs : deux echelle apparaissent séparément avec sens/fiche/contextes ; alias ancien ambigu ne lance aucune machine ; profil avec Publier non autorisé garde refus serveur (TEST-018) ; trois profils différents laissent mêmes hashes géométrie/révision/droits (TEST-019) ; un outil masqué est retrouvable (TEST-017) ; vingt outils visibles ne chargent pas noyau rare tant qu'inutilisé (TEST-016, vérifier réseau + module init + SW, pas seul bundle visuel) ; offline prepared/nonprepared sont distincts (TEST-020) ; reconnexion/conflit conserve file et aucun double effet (TEST-021/036). Mesures et budgets DEC-13 non inventés, preuves liées SHA/corpus/appareil.

## Prêt / bloqué

Préparation de ce contrat : livrée à A0. DEC-04/05/06/07/14/18, contrats M17, choix d'alias historique et autorisation code restent requis. Aucun M21/B ni test n'est « réalisé » par la rédaction. Prochaine action autorisée : A2 rapproche commandTypes/stockage et arbitre les alternatives documentaires avec A1/A4 ; A5 prépare fixtures/oracles ; A0 soumet choix/lot borné. Ne pas ouvrir une branche permanente par agent.
