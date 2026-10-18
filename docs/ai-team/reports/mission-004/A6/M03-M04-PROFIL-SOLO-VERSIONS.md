# A6 — M03/M04 : profil solo et preuves courantes

Relevé18octobre2026 vers12:14UTC (14:14 Europe/Zurich). Lecture seule GitHub/Cloud et versions locales, propositions écrites uniquement dans ce dossier scratch. Aucun appel DB, service, migration, relance CI, installation, administration ou fusion. Le programme reste ouvert ; ces résultats ne constituent pas un nouvel audit général de Fadi.

## M03 — Avancement concret

D05 est désormais repris comme choix retenu pour la **conception** : profil solo, 0 approbation GitHub supplémentaire, PR obligatoire, conversations résolues, acceptation humaine tracée, force-push/suppression interdits. Pas de nouvelle demande du même arbitrage ; activation administrative demeure un accord séparé.

Patch concret sur le document existant : `github-settings-solo.patch` ; rendu complet `github-settings-solo.proposed.md`. Il ajoute un complément daté sans effacer le constat historique17octobre. Réutilisation du candidat PR152 et son JSON disabled, aucune nouvelle registry/règle concurrente. Patch non appliqué au checkout documentaire ; A0 l’intègre après décision CI-doc applicable.

Main actuel a4caaab0e6665480f09febe3914c960b424b6b47 toujours protected=false. Lecture des endpoints branches/main et commits/<SHA>/check-runs?per_page=100 ; app observée GitHub Actions15368. PR152 ouverte àf2777230e3e9c3bd6a2a5f61e2147acd1fba4b38. PR169 draft àa15d65044ca4454bf3159f4155e51465b2a70a2c. PR165 ouverte à63e804be7b8e8935913514bd57937053c7402474. Les quatre références sont distinctes.

| Nom exact du check | main a4caaab | PR152 f277723 | PR169 a15d650 | PR165 63e804b |
|---|---|---|---|---|
| validate | succès | succès | **skipped** | succès |
| e2e | succès | succès | **skipped** | **en cours**, conclusionnull |
| image | succès | succès | **skipped** | succès |
| Continuité — docs, checkpoints et tests | succès | succès | succès | succès |
| no-foreign-app-reference | succès | succès | succès | succès |
| Architecture — frontières et isolation | absent | succès | absent | absent |
| Codex — 31 missions et 630 tâches | absent | absent | absent | succès |
| DB1/2 — tests simulés sans base (DB3 non validée) | absent | absent | succès | absent |
| inventory | absent | absent | absent | succès, workflow filtré |

« absent » signifie aucun check de ce nom dans la réponse du SHA, pas une défaillance constatée. Sources détaillées et URLs par check dans M03-M04-preuves.json. CI main39119236553 success ; CI16939125959694 pure success ; CI16539125426559 toujours E2E en cours au relevé. Aucun verdict complet vert de PR165 déduit.

### Configuration finale recommandée, à activer ultérieurement

Conserver le candidat #152 : PR obligatoire sur main, minimumapprobations0 profilsolo, discussions résolues, strict_required_status_checks_policy, interdiction suppression/non-fast-forward, pas de bypass permanent proposé. Cinq checks existants main exacts = validate/e2e/image/continuité/isolation. Ajouter Architecture et Codex seulement après leurs intégrations autorisées et déclenchement vérifié sur chaque PR. Ne pas exiger inventory globalement. Les checks conditionnels DB1/2 ne sont pas une disponibilité générale de recette DB.

Attention opérationnelle précise : un check skipped peut satisfaire la mécanique des required checks GitHub. Les trois skips de #169 ne prouvent donc pas DB-3 ; ne pas présenter la configuration comme capable de bloquer à elle seule toute fusion métier prématurée. Aucune fusion #169 autorisée ; acceptation humaine et dossier DB-3 restent requis. Avant généralisation, un check de readiness explicite échouant si intégration requise absente peut être spécifié dans un lot ultérieur, pas inventé dans les réglages maintenant.

Recette administrative préparée dans le patch : accord distinct → paramètres candidat relus → activation → relecture de règle effective → PR documentaire de contrôle autorisée sans DB interdite → preuve refus si check requis absent/échec → inspection interdictions force/suppression sans les tenter sur main → preuve et clôture #146 seulement alors. Ne pas tester un push destructif. Les permissions/bypass administratifs effectifs ne sont pas certifiés par la proposition JSON.

## M04 — Comparaison des outils, nouvelle observation Cloud

**Fait nouveau : runtime voulu/observé40**, observations actuelles, running et enforced au nouveau relevé. Révision32 était vérifiée au début Mission004 ; elle est maintenant historique. A6 n’a modifié aucune configuration. Même identité d’environnement ne prouve toujours pas reproduction à blanc.

| Outil | Cloud réellement lu maintenant | CI réellement lue | Preuve / portée |
|---|---|---|---|
| Node | v24.19.0 | v22.23.3 | commandeslocales ; job169117671022920 log12:07:07UTC |
| npm | 11.9.0 | 10.9.9 | mêmes preuves |
| Python | 3.12.14 | 3.11 configuré CI ;3.11.17 observé lors du relevé précédentPR165a09c11d | Ne pas transférer cette versionPythonexacte à169 : jobpur ne configure pasPython |
| Chromium | système154.0.8037.57 | 141.0.7390.37 build1194 | commandelocale ; log **maina4caaab** e2e11765123506010:26:54UTC. Aucun Chromium lancé dans jobpur169 |
| Playwright | lockfile1.56.0 | lockfile1.56.0 ; navigateur1194 main | Version d’installation du lockfile, pas nouvelle recetteCloud |
| IfcOpenShell | 0.9.0 via /workspace/fadi-ifc-venv | version0.9.0 fixée workflow | Import/version sans validationIFCnouvelle. AbsencePython global ne signifie pas absencevenv |

Écarts Node/npm/Python/Chromium restent documentés, aucune mise à jour forcée. Les versions du moteur d’actions GitHub éventuellement Node24 ne doivent pas être confondues avec Node22 installé pour l’application. M04 a avancé par nouveaux relevés et comparaison des références, pas par relance des suites interdites.

## Prochaines actions sans ambiguïté

1. A0 intègre le patch settings dans le document canonique existant après décisionCI-doc ; garder STATUS/HANDOFF cohérents.
2. Relever la fin E2E165 au même SHA si nécessaire, sansrerun ; si nouvelle tête, recommencer seulement ce relevé.
3. Réconcilier les deux ci.yml169/165 avant toute fusion autorisée. Le patch documentaire horsrepo n’est toujours pas appliqué par ce travail.
4. Activer règles administratives seulement avec accord ponctuel. DB-3, vraiebase, repriseCloudnonattestée, production et sauvegardes restent horspérimètre.

Livrables : patchsettings concret, matricechecks et preuveJSON, versionscourantes. Aucun résultat de test historique transformé en preuve courante du codeDB3 ou Studio.
