# A5 — précondition d’inventaire A3-CLASSIF-1

Référence : PR169 `a15d65044ca4454bf3159f4155e51465b2a70a2c`. Décision autorisant le lot pur borné : [#166/6250110849](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110849). Inventaire statique indépendant, sans application/test/API/DB/service/réseau. Aucun fichier applicatif modifié. Les lignes, empreintes et recherches complètes sont dans `CLASSIF1-INVENTAIRE-INDEPENDANT-A5.json` (14 points,63 occurrences littérales sur5 recherches apps/packages).

| Consommateur | Impact et garde-fou |
|---|---|
| organisation.ts:414–439 | Écriture canonique inconditionnelle436 après affectation **et retrait**. Préserver toutes autres propriétés/effets ; corriger aussi commentaire414 devenu contraire au contrat. |
| commandes/index.ts:291–303 | Dispatcher id/ids ; chaque cible passe au même réducteur. Deuxième cible invalide doit refuser le lot sans altérer l’entrée. Ne pas étendre le contrat ids dans ce correctif. |
| annexe-c.ts:62–73 | Lit déclaration, ignore objets importésIFC, compare sans casse. Absence ne produit pas déclaration ni anomalie. Déclaration incompatible doit rester visible après code externe. |
| echanges/ifc.ts:1116–1145,1187 | Codes externes et associations distincts des classes exportées. Le diagnostic ajoute des remarques ; l’autorité AnnexeC du moteur reste inchangée. |
| route atelier-commands.ts:232 / test:948–955 | Réponse de problèmes dérivée ; assertion déclaration IfcDoor à préserver. API réelle non exécutée, aucun changement physique de route attendu. |
| Complements.tsx:69,79,85 | Liste codes, retrait et multi-sélection émettent commandes. Aucun besoin de maintenir une classeIfc calculée identifié. |
| classification-regle.ts:31–54 | Proposition pure, exclus verrouillés/déjà classés et commande ids. Ne pas appliquer automatiquement une proposition. |
| Inspecteur.tsx:255–263,1551–1556,2030–2039 | 255/1551 lisent les propriétés des occurrences : absence conservée peut supprimer ligne/colonne/compteur auparavant créée implicitement. Le helper2030 concerne groupe/calque, hors occurrenceCLASSIF1 ; aucune nouvelle propagation à ces cibles. Aucun changement UI autorisé. |
| commandes/bloc.ts:211–217 | Projection générique propriétés effectives définition/occurrence, pas invention d’héritage IFC ni modification des définitions. |
| commandes.test.ts:277–283 | Oracle281 contradictoire à remplacer, autres assertions code/retrait maintenues. |
| referentiels.test.ts:15–26,51–60 | Codes libre/chargé, validation/refus, libellés, retrait et export des classifications à préserver. |
| annexe-c.test.ts:17–30,34–58 | Diagnostic/export sans correction et proposition/règleids inverse exact existent ; manque combinaison classification + déclaration préexistante. |

Lecture complémentaire : `verrous.ts:45–55` et `commandes/index.ts:377–397,410–429` imposent contrôle des verrous après réducteur et construction de l’inverse différentiel ; les nouveaux oracles doivent passer par appliquerLot. `atelier-complements.mjs:807–825,1732–1752` conserve des assertions E2E code/libellé et règle exactement révision+1 ; elles sont lues seulement et ne doivent pas être affaiblies.

## Oracles purs à imposer après revue conjointe

- Tableau absence / déclaration saisie / importée / ancienne valeur regle-verifiee, chacune cohérente ou incohérente ; affecter, remplacer, retirer dans systèmes libre et référentiel chargé. Comparer la propriété entière (valeur, provenance, statut, unité, métadonnées inconnues imbriquées) et toutes propriétés non concernées ; aucune nouvelle propriété canonique si absence.
- Cibles id puis ids sur états mixtes ; objets exclus intacts ; même état/enveloppe donne même résultat. Après cible valide, cible inconnue/verrouillée/code invalide : refus et entrée profonde strictement identique, zéro résultat partiel observable. Ne pas utiliser seul toThrow comme preuve d’atomicité.
- Inverse exact du résultat pour chaque opération et lot, incluant références, propriétés, effets du lot et état complet ; confirmer ce qui appartient au snapshot domaine, sans confondre révision persistée (hors DB) et inversion pure.
- Référentiel libre reste déclaré ; chargé valide code/libellé ; code inconnu refuse avec motif ; retrait ne supprime que code/libellé du système. Ne pas confondre vérification d’un code et vérification de classeIFC.
- Contrôle/export sur état avant/après affectation/retrait : déclaration incompatible conservée + remarque attendue, aucune mutation du modèle, produit IFC conforme AnnexeC et association externe conservée. Objet importé garde traitement spécifique ; aucune revendication BIM paramétrique.
- Historique déjà écrit : aucune réparation/requalification par supposition. Une valeur regle/verifiee existante est préservée comme n’importe quelle propriété ; ni nettoyage, migration ni fusion d’anciennes données.

## Limites et avis préalable

Aucun lecteur explicite identifié n’exige de conserver la déduction canonique interdite. Les changements attendus dans vues génériques et diagnostics sont documentés ; ils n’autorisent aucun changement UI/API/moteurIFC/schéma. Les variables locales `classeIfc` du writerIFC sont des projections, pas des lectures de la propriété canonique. Les recherches littérales ne prouvent pas absence de consommateur externe, clé construite dynamiquement, ancien client ou fichier réel dépendant de cet effet ; aucun de ceux-ci n’a été interrogé.

Cette remise ne remplace pas la revue A2 préalable. Si A2/A3 découvre qu’un effet exige autre code, donnée historique ou assertion affaiblie, suspendre la nouvelle écriture concernée et demander l’extension bornée prévue par la décision. Aucun effet non couvert exigeant une telle extension n’est démontré par cet inventaire. L’exécution pure/typecheck/build/CI doit rester dans une branche dédiée séparée de DB1/2 ; aucun test API/E2E/DB ne découle de cet avis.
