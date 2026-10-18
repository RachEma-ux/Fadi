# A6 — CI PR171 au SHA exact

Référence **5e0285d37f23c7c539502664036f0a2ff0986409**, PR171 draft. RunCI39130408506. Premier relevé : jobpur en cours, installation/typecheck/suiteAtelier déjà réussis et build en cours ; aucun succès final inventé. Au checkpoint naturel après revueG2 statique, jobpur **117684235447 completed/success**, build et résumé compris.

Les jobs **e2e117684236342**, **image117684236606**, **validate117684236645** sont completed/**skipped**, tableauxstepsvides. Aucune étape Initializecontainers dans le jobpur ; aucun service configuré dans sa définition vérifiée par A6. Installation sanslifecycle, typecheck, suiteentière modèleAtelier et build seulement : pas de PostgreSQL/API/E2E/migration réelle.

Isolation39130408504 et continuité39130408553 étaient completed/success au même SHA. Les extraits tests/versions réellement lus et tousstepsjobs sont conservés dans CI-171-observation.json, sans journal intégral ni variables de connexion. Ce verdict ne valide pas intégrationAPI/E2E/IFC, donnéeshistoriques, gateStudio ou DB3 et ne donne aucune autorisation fusion/déploiement. Aucunrerun/service/admin/merge effectué par A6.
