# A3 — CLASSIF-1 : conservation des déclarations IFC

Autorisation6250110849, programme #156, Issue bornée #170. Branche `fix/156-classification-no-ifc-inference`, baseline `main@a4caaab0e6665480f09febe3914c960b424b6b47`. Préconditions conjointes A2/A5 lues avant écriture ; aucune nouvelle extension nécessaire identifiée. A0 seul commit/push/PR, aucune écriture dans169.

## Changement effectivement réalisé

Affecter, remplacer ou retirer un code externe ne crée plus et n’écrase plus `proprietes.classeIfc`. La seule écriture automatique est supprimée dans `organisation.ts` ; commentaire ajusté, reste du réducteur conservé. Une déclaration absente demeure absente ; les valeurs saisies/importées et anciennes regle/verifiee restent entières, sans migration ou réparation historique par hypothèse.

L’oracle contradictoire dans `commandes.test.ts` vérifie désormais l’absence de déclaration fabriquée. Les assertions exactes du code externe et de son retrait sont conservées ; deux inverses exacts sont ajoutés. Aucune suite/assertion numérique+1 n’est supprimée ou relâchée ; aucun skip, tolérance ou seuil abaissé.

A5 a écrit indépendamment24cas purs dans `classification-conservation.test.ts` : sept états de déclaration (absence, saisie/import cohérents et incohérents, anciennes regle/verifiee cohérentes et incohérentes), libre/avec référentiel, trois opérations avec inverses/rejeu ; ids mixtes ; refus atomiques profonds après cible valide ; autres systèmes/exclusions/propriétés et attributs inconnus ; contrôle AnnexeC et export dérivés sans mutation ; objet importé synthétique inchangé.

Une propriété auparavant fabriquée peut ne plus figurer dans une colonne/compteur générique ; un diagnostic d’incohérence demeure après classification. Effets attendus du contrat, aucun besoin de modifier UI/API/IFC-engine/schéma/données identifié. Ces consommateurs restent inchangés.

## Références et essais

Contrôle supplémentaire des42sources inventoriées àa15d650 contre la baselinea4 : **41fichiers identiques**. Le seul écart est `apps/api/src/routes/atelier-commands.test.ts`, dont169 a changé import/resetDb pour DB1/2. Diff relu ; le corps des suites depuis `beforeAll(resetDb)` est strictement identique. Aucune reprise de169 ni exécution API n’est déduite de cette comparaison.

Installation isolée255packages via `npm ci --ignore-scripts --no-audit --no-fund --cache /workspace/work/resume496/npm-cache`, exit0. Premier essai cache par défaut échoué ENOENT, résolu sans écrire danshome et sans script lifecycle. Aucun node_modules partagé par symlink ; le lien workspace pointe ce checkout.

**Suite Atelier complète :492tests/107fichiers réussis**, dont24A5, à13:06:45UTC en19,42s (`atelier-final.log`). Premier passage490/107 avec22cas, remplacé par cette preuve après ajout des anciennes déclarations incohérentes. `npm run typecheck` et `npm run build` réussis pour tous workspaces/Web+API, sans serveur ; `git diff --check` réussi. Avertissements Vite de dépendances/use-client, externalisation node:module et taille des chunks consignés, sans correction hors périmètre.

Aucun npm test racine/API, DB réelle, SELECT/TRUNCATE réel, service, migration, E2E/HTTP mutateur ou déploiement. Le contrôle/export testé est une fonction pure sur modèle synthétique, aucune certification BIM ou fidélité paramétrique intégrale affirmée.

## Reprise

`CLASSIF1-VALIDATION-A3.json` contient commandes, références et empreintes des quatre fichiers (workflow A6 inclus en lecture seulement). A6 seul auteur du workflow CI ; A0 recueille revues A2/A5/A6, enregistre checkpoint, commit et PR distincte non fusionnée puis contrôle les Actions au SHA exact. A3 n’a fait aucun commit/push/fusion. Succès local distinct de recette métier et d’autorisation de fusion/production.

Gel final demandé par A0 : quatre fichiers seulement (organisation, oracle, nouveau test A5, workflow A6). Temps exact de la suite :19,42s ; Vite11,64s/API esbuild275ms selon sortie. Durées totales types/build non instrumentées, donc non inventées. Les fichiers sources sont figés pour commit A0.
