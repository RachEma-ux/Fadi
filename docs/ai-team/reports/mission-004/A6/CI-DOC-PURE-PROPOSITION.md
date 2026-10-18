# A6 — Patch documentaire proposé, non appliqué

Question Q-M004-CI-DOC-PURE, #166 commentaire6249646154 : décision déléguée attendue. Aucun changement du checkout documentaire ni push par A6.

Patch concret : `ci-doc-pure.patch`, généré contre `.github/workflows/ci.yml` du checkout documentaire HEAD301a4fa8f2594fa1c8f0317c18085b5ae22ac7a3. Copie complète proposée : `ci-doc-pure.proposed.yml`. Rebaser/revérifier le contexte si la branche a changé avant application autorisée ; ne pas appliquer aveuglément.

Condition exacte : événement pull_request ET head.repo.full_name RachEma-ux/Fadi ET head docs/156-codex-missions-completes ET base main. Le job documentaire seul s’active ; validate/e2e/image ont un if avant services et sont skipped pour ce seul tuple. Pushmain, fork, autrehead et autrebase gardent la CI habituelle. Aucun services, envDB, npmci, migration ou code serveur dans le job pur. Checks : unittest documentaire (14 attendus selon référentiel, décompte réel à relever lors de l’exécution), check_missions, tests/structure continuité, isolation nominale. Résumé always explicite les absences d’intégration et l’absence de validation métier/fusion.

Vérifications locales réalisées : YAML parse réussi ; jobs mission-docs-pure/validate/e2e/image ; absence de services dans mission-docs-pure. Matrice cinq cas : exact→puretrue/dbfalse ; pushmain/fork/autrehead/autrebase→purefalse/dbtrue. Aucun workflow GitHub déclenché pour cette proposition. Aucune assertion existante modifiée.

Autres workflows : builder-deploy déclenchement manuel workflow_dispatch uniquement, ne pas appeler ; continuité et isolation existants restent purs. Le workflow documentaire codex-missions de la branche ne démarre pas de service. La duplication de contrôles purs avec leurs workflows existants est intentionnelle pour fournir un verdict borné lisible, pas un remplacement de contrôles applicatifs.

## Preuve CI code #169 séparée

PR169 draft ouverte, HEADa15d65044ca4454bf3159f4155e51465b2a70a2c. Run39125959694 relu sans relance : validate117671023828, image117671023934 et e2e117671024060 skipped, aucune étape. Job117671022920 DB1/2 actif : installation ignore-scripts, typecheck et tests simulés réussis ; build en cours au premier relevé. Aucun Initialize containers, service PostgreSQL ou migration dans ce job. Isolation39125959914 et continuité39125959712 réussies. Preuve bornée dans CI-169-observation.json. Ne pas déclarer CI achevée avant fin du build ; skipped n’est pas success de recette DB.

Second relevé confirmé : job pur117671022920 terminé success, build et résumé compris ; validate/e2e/image restent skipped. Aucun nouveau run ni relance effectué.

## Durcissement du périmètre avant publication — proposition finale

Ajout au patch hors dépôt, toujours non appliqué : checkout fetch-depth0 et étape de contrôle du diff avant setup-node et tout contrôle de projet. BASE_SHA vient de github.event.pull_request.base.sha ; format strict40hex requis. Python stdlib appelle git diff --name-only --no-renames -z base...HEAD via subprocess sans shell. Seuls docs/**, Studio/**, AGENTS.md, CLAUDE.md, apps/web/src/modules/README.md et .github/workflows/{ci,codex-missions}.yml sont admis. Tout autre chemin échoue le job pur : les trois jobs DB restent skipped pour respecter zéro base, mais le verdict global ne peut devenir vert par ce job. --no-renames conserve le chemin source supprimé lors d’un déplacement vers docs ; noms traités séparés NUL, affichage ascii échappé en cas de refus.

Contrôle de la PR165 distante actuelle effectué : HEAD63e804be7b8e8935913514bd57937053c7402474, base27c0c5a35e2f116752a83a9c66459484488a1975, **114 fichiers**, pages GitHub100+14 toutes lues ; aucun fichier hors allowlist. Le checkout local HEAD301a4fa8… a113 chemins depuis cette base ; l’étape Python proposée réellement exécutée en lecture seule sur ce diff accepte113. La différence114/113 est explicitement conservée : preuve distante et preuve locale ne portent pas la même tête.

YAML et Python inline compilés ; ordre étape confirmé. Cas simulés de la même étape (subprocess doublé, aucune base) : docs-only accepté ; sourceapp, package.json, SQL et déplacement sourceapp→docs rejetés exit1. La matrice d’événements précédente reste inchangée. Aucun lancement GitHub pour ces vérifications.

Conflit futur à réserver à A0 : PR169 et cette proposition modifient ci.yml avec deux exceptions de branche différentes. Les réconcilier avant toute fusion explicitement autorisée, sans perdre les garde-fous, sans généraliser les skips et sans réutiliser un succès CI d’une tête différente. Aucun changement supplémentaire du workflow code169 effectué par A6 pour ce durcissement documentaire.
