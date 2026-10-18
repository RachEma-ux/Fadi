# Compléments G1 — appliquer les orientations DEC-01/DEC-03 sans clore les choix physiques

Reprise programme#156, 18 octobre2026. A1 Produit, contribution documentaire à intégrer par A0 après revue A2/A4/A5. Aucun modèle parallèle : ce document propose des précisions à **C-STUDY/C-DRAWING2D/C-COMMAND/C-PUBLICATION** déjà décrits dans M17/M24 au SHA `7b0cca44fa44449cae80785dea078a857be4180c`. Aucun paquet, SQL, routeAPI, POC, codeStudio, migration ou test produit créé.

## 1. Décisions à appliquer, sans nouvelle demande identique

Sources lues dans l'export réel A0 `decisions-166.json`, récupéré le18/10/2026 à12:53:15UTC :

- [6250109830 — G0](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250109830) : cadrage documentaire accepté pour le dossier7b0cca44…, inconnues conservées. Les anciennes mentions «G0 non passé» dans les pièces historiques sont des faits datés ; le nouvel acte les complète sans les réécrire.
- [6250110124 — DEC-01](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110124) : **optionA document2D canonique autonome retenue pour préparer G1**, réemploi des noyaux Fadi purs par interfaces publiques ; DEC-01 reste ouverte pour modèlephysique/coûts/preuves/persistance/migration/rollback.
- [6250110501 — DEC-03](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110501) : **identités métier propres Étude/Variante et Révision immuable dans Projet transverse retenues pour préparer G1** ; stockage/IDsphysiques/contraintes/isolation/restauration/migration/rollback restent ouverts.

Le compte GitHub auteur réel est RachEma-ux ; les corps portent CHATGPT-DECISION dans la délégation documentée. Le choix de principe n'est plus candidat ; sa traduction physique et sa preuve restent à instruire. Aucune acceptationG1–G4 ni codeStudio n'en découle. Les autres décisions de cet export (CIpure bornée, classificationpure sousinventaire, CSP/KMLpréparation) ne sont pas des autorisations d'implémenter ces contrats Studio.

## 2. Delta à intégrer dans M17 §1/2 — C-STUDY et C-DRAWING2D

| Point | Précision logique à retenir pour les spécifications G1 | Preuve future et décision restante |
|---|---|---|
| Identité document2D | `documentId` stable distinct de l'identité de la feuille publiée, de sa version de pièce et de son rendu. Le document appartient à une variante autorisée d'une étude/projet. | Créer/éditer/sauver/fermer/rouvrir avec mêmes identités ; allocation/forme physique IDs reste DEC01/03 |
| Source de vérité | Primitives, calques, cotes, annotations et contraintes du document font autorité, pas SVG/Canvas/maillage ou copie d'un modèle3D. | Comparer canonique avant/après reconstruction des caches ; aucun modèle3D synthétique substitut |
| Autonomie forte | Ni création ni édition ni version ni persistance ni publication d'un dessinA ne requiert un document/modèle3D. Une source3D peut être référencée explicitement mais n'est pas une dépendance obligatoire du dessin libre. | TEST001 complet, moteur3D absent/nonchargé lorsque non requis ; mesurer sans inventer budget |
| Référence vs copie vs associé | Une conversion/extrusion produit objet3D ou association explicite selon contrat. Une coupe3D dérivée n'est pas déclarée dessin2D indépendant sans opération d'extraction explicite ; copie autonome n'entretient pas de propagation. | TEST004–007, provenance/IDs et rapport des liens ; DEC02 topologie/associations reste ouverte |
| Primitives/relations | Identités de primitives/calques/cotes stables dans leur contexte ; références contrôlées. Suppression/division ambiguë d'une cible conserve la cote avec statut àrésoudre ou correspondance démontrée, pas rapprochement arbitraire. | Caspositif/casnégatif exacts et réouverture, passimpleproximité ; choix types/solveur physiques non décidés |
| Unités/repères | Unité et repère du document explicites ; transformations vers projet/local/géographique versionnées lorsque utilisées. Pixels ne deviennent jamais unité canonique. Information inconnue déclarée, pas défautinventé. | Imports àunités/repères inconnus refusés ou mis en résolution ; conversions comparées aux oracles |
| Commandes | C-COMMAND/IF006 reste l'interface logique commune. L'identité authentifiée, droits, parenté, baseRevision et writerAuthority sont vérifiés avant effet ; pas écriture directe du moteur dans stockage. | Mauvaise révision/contexte/droit → refus atomique, même requestId → pas doubleeffet ; DEC12/historique à stabiliser |
| Version/persistance | `schemaVersion`, `contractVersion`, `revisionId`, `baseRevisionId`, `documentVersion` conservent les sens distincts de M17 ; aucun numéro n'est substitué à un autre. Une confirmation centrale suit engagement durable, pas image obtenue. | Sauvegarde/réouverture après incident sur corpus sûr autorisé ; erreurdurabilité ne devient pas succès |
| Réemploi | Noyaux géométriques purs Fadi existants réutilisés par API/adaptateur public après qualification ; aucun nouvel outil n'importe UIAtelier comme autorité. | Comparaison fidélité/limites/licences/coûts ; DEC18 parcomposant, pas réécriture automatique |
| Compatibilité | Lecture/import/export distingués par format/version/entité/sens. Conservation desID et propriétés reconnues ; inconnues préservées ou rapport de pertes explicite, jamais disparition silencieuse. | Corpus ancien/nouveau avant/après ; pas roundtrip paramétrique supposé ni migration implicite |

Ces précisions définissent les responsabilités, pas une nouvelle structure de document sérialisée. Les exemples M17/M24 restent illustratifs ; leur `schemaVersion=illustrative-1` n'est pas un formatStudio accepté par le code.

### Clarification de vocabulaire — revue A2 P3

Dans les exemples v2 uniquement, `contentVersion` désigne la version illustrative du **contenu canonique** cité par une révision ; `documentVersion` reste la version de **pièce livrée** dans le manifeste M24/IF-009. `revisionId` est l'état historique immuable de la variante, `schemaVersion` le format du contenu et `contractVersion` le contrat de commande. Ces notions ne sont pas interchangeables. Le champ illustratif `contentVersion` ne décide ni nouveau format applicatif, ni stockage, ni allocation d'ID. Il évite seulement l'ambiguïté du premier exemple. Les fichiers initiaux restent historiques ; le v2 est actif pour cette clarification.

Les dix refus v2 conservent leur faute sémantique ciblée avec liens d'empreinte recalculés : le hash périmé n'ajoute plus une deuxième faute artificielle aux cas documentaires. Cela ne prouve pas qu'un validateur Fadi les refuse ; aucun runtime n'est exécuté.

## 3. Delta à intégrer dans M17 §1/3/4 — identités Projet→Étude→Variante→Révision

| Identité logique | Relation et invariant retenus | Refus/compatibilité à préciser |
|---|---|---|
| ProjetFadi | Autorité transverse existante : comptes, accès, sources et catalogue partagés. | Aucun projetparallèle créé pour rendre Studio autonome |
| Étude | Identité métier propre, appartient à un projet ; cadrage/sources avant géométrie et avant variante permis. | Étude d'un autre projet dans URL/commande/source rejetée sans fuite |
| Variante | Identité métier propre, appartient à une étude ; toute géométrie persistée a une variante propriétaire. | Interdire géométrieorpheline et attribution implicite à «dernierprojet» |
| Révision | Identité immuable, appartient à exactement une variante, parents/transaction/sources identifiés. | Aucune mutation rétroactive ; nouvelle commande sur tête autorisée ou fork explicite |
| Fork | Nouvelles identités propriétaires et provenance verssource selon contrat ; paspropagation implicite d'une copie. | Mapping explicite des anciennes variantes-projets ; pas renommer/copier/migrer silencieusement les données existantes |
| Session/droits | Identité tenant/projet/étude/variante vérifiée serveur avec permissions surressource/action ; `actorId` client ne fait pas autorité. | Une combinaison d'IDs tous existants mais appartenant à des parents différents est refusée |
| WriterAuthority | Un écrivain unique pour chaque donnée canonique2D/3Dlibre/associée ; vues/scènes ne sont pas écrivains. | Deux planches ne fabriquent pas deux copiesautoritaires du même mur ; migration d'autorité distincte et non autorisée ici |
| Diffusion | Publication et approbation visent leurs ensembles exacts ; travail courant peut évoluer sans effacer référence historique. | `revisionId` n'est ni statutdediffusion ni publicationId ; ne jamais substituer latest enréouverture |

Les choix d'index/stockage/IDs physiques/contraintes/lectures transactionnelles seront comparés par A2, sans créer de tables ou imposer UUID. La portée serveur de déduplication et la durée de rétention sont des choix à ratifier ; aucune rétention/sauvegarde n'est modifiée.

## 4. Delta à intégrer dans M24 §2/3/6 — publication et réouverture des identités retenues

1. Une révisionA peut ne contenir que l'autoritédocument2D ; une révisionB seulement modèle3Dlibre ; C porte l'objetarchitectural et ses relations/projections. La lecture ne complète pas artificiellement les autoritésabsentes.
2. Le dossier candidat est une **coupe logique cohérente** des références versionnées/empreintées. Pièces, règles, contrôles, observations et sources citées doivent correspondre à l'ensemble effectivement examiné ; une série de GET ne prouve pas cette cohérence.
3. L'approbation est une décision sur cet ensembleexact et la publication un acte distinct avec droitpublish. Rôleconcepteur/admintechnique ne donne pas approve/publish ; cumul seulement explicite et journalisé conformément D07.
4. Réouverturehistorique : résoudre publication/révision exactes, revalider droits et parenté, vérifier pièces/empreintes/lecteurs compatibles, puis reconstruire les projections. Source manquante/inconnue/divergente → état explicite/récupération, jamais substitutionlatest.
5. Modifier après réouverture est une intention distincte vers têteautorisée/nouvellevariante, avec préconditionIF004. L'ancien manifeste et ses pièces restent identifiables. Un statut local pending ne devient pas publication centrale.
6. La méthode de hash des exemplesJSON M24 ne décide pas la canonicalisation de production ; DEC16 reste ouverte. IFC en proxies/représentations ne prouve pas sourcecanonique paramétrique ni certification ; matrice par sens/version/entité et pertes reste requise.

## 5. Conditions de fermeture des DEC et de G1, toujours non satisfaites par ce document seul

- **DEC01 physique :** comparer modèle/stockage, coûts/compatibilité et réemploi ; preuves création2Dsans3D, persistance/réouverture/import-export, identités/historique et migration/rollback ; décision documentée. Orientation acceptée ≠ DECfermée.
- **DEC03 physique :** allocation/stockage/contraintes, isolation serveur et historiqueimmuable, restauration, mappinganciensforks et migration/rollback ; décision documentée. Aucune table ou conversion ajoutée ici.
- **G1 par sous-ensemble :** fonctions réellement retenues identifiées ; pour chacune sourceautoritaire/propriétaire, entrées/sorties/refus/effets/droits/unités/versions et oracles vérifiables ; revueA2/A1/A4/A5 trace les manques. Une141e fiche ou un JSONvalide ne ferme pas ce contrôle.
- **G2/G3/code :** POC et réalisation demeurent conditionnés aux autorisations propres. Le passageG0 n'autorise aucun POC/codeStudio/DB3 ni testmutateur. Continuerpréparations indépendantes plutôt qu'attendre une demande globale.

### Prochaines actions READY, sans refaire M17/M24

A2 intègre les précisions dans ses contrats candidats aux sections référencées et consigne alternatives physiques restantes ; A4 vérifie contexte/routes/états ; A5 affine oraclesA/B/C et refus sans prétendre corpusRTcomplet ni exécution ; A0 rassemble revues et questions techniques précises encore réellementouvertes dans#166. CAD-DEC-03 personnes/disponibilités demeure inconnu conformément acteG0. Aucun fichierpartagé modifié par A1.
