# M08 — consolidation des 125 entrées, lecture seule

Les 125 entrées du mapping canonique ont désormais une analyse et une revue documentaire :117 nouvelles dans cette reprise et8 historiques réutilisées sans refaire leur audit. [Index individuel](M08-INDEX-A0.json) et [contrôle A0](M08-CONSOLIDATION-A0.json). La priorité001–007 a été traitée d'abord par A2, revue indépendamment par A5, puis consolidée par A0.

Référence des nouveaux candidats : `a15d65044ca4454bf3159f4155e51465b2a70a2c`. Les 33 chemins littéraux, cités125 fois dans69 fiches, demeurent absents à ce SHA, vérification `git cat-file -e` en lecture seule. Leur rapprochement avec des fichiers existants n'est pas une équivalence automatique des anciens oracles. Aucun scénario, navigateur, moteur, API ou DB exécuté pour cette consolidation.

## Portée des revues

A2 a produit les comparaisons unitaires et premières entrées ; A4 les comparaisons E2E. A5 a mené les lectures indépendantes E2E et des premières cohortes, puis le contrôle qualité des réserves. A3 a revu indépendamment les unités017–039 et065–092 ; A1 les unités041–064 et094–124. L'attribution est conservée : un contrôle de transcription A6 ou de correspondance A5 ne devient pas une seconde revue sémantique intégrale.

[Traçabilité A6, premières grandes cohortes](A6/REVUE-TRACABILITE-COHORTES-UNITE-E2E.json) ; [quatre dernières cohortes](A6/REVUE-TRACABILITE-QUATRE-DERNIERES-COHORTES.json). Aucune discordance sur les empreintes/citations contrôlées. Sept extraits complets omettent le newline terminal, différence de représentation explicitement conservée, sans normaliser leurs empreintes.

Une assertion précise constatée n'est pas un test récemment réussi. Une fixture de création, un titre, des métadonnées retournées ou un inverse générique ne prouvent pas la modification, recherche ou annulation ciblée. Une absence d'assertion dans les candidats prescrits ne prouve pas que la capacité entière est absente du produit.

## Deltas de revue, sans écraser les originaux

- Unités017–039 :109 sous-attendus ; les 48 « partiels » initiaux comprennent22 scénarios incomplets,15 autres opérations et11 socles génériques. Les 26 supports indirects n'ont pas l'oracle ciblé ; aucune somme présentée comme couverture. Quatre supersessions normatives bornées sont conservées ; D116 ne ferme pas l'ancien chemin. [Revue A3](A3/M08-UNITE-017-039-REVUE-A3.json), [contrôle qualité A5](A5/M08-UNITE-017-039-QA-REVUE-A3-A5.json).
- Unités041–064 :112 occurrences de sous-attendus, mais103 après déduplication des neuf attendus communs049/050. Une assertion présente,33 indices partiels,75 absences bornées,3 non conclus ; pas de garantie complète supplémentaire déduite des indices. [Revue A1](A1/M08-UNITE-041-064-REVUE-A1.json), [QA A5](A5/M08-UNITE-041-064-QA-RESERVES-A5.json).
- Unités065–092 : [delta A2 accepté après revue A3](A2/M08-065-092-DELTA-REVUE-A3-A2.json), actif **17 présents /22 partiels /93 absents bornés**. Métadonnées nature/version ne prouvent pas leur recherche ; rejet d'un statut ne prouve pas refus d'une propriété dérivée. [QA A5](A5/M08-UNITE-065-092-QA-RESERVES-A5.json).
- Unités094–124 : [delta A2 accepté après revue A1](A2/M08-094-124-DELTA-REVUE-A1-A2.json), actif **13 présents /28 partiels /94 absents bornés**. Inverse d'un lot comprenant une pose de porte : preuve partielle, pas absence totale ; parcelle nulle : pas preuve de tout le site. [Revue A1v2](A1/M08-UNITE-094-124-REVUE-A1-v2.json), [QA A5](A5/M08-UNITE-094-124-QA-RESERVES-A5.json). Le champ `controle.comptes_recalcules` de la v2 conserve le snapshot initial14/26/95 ; l'annexe_resolution et la QA donnent seuls les compteurs actifs13/28/94. Ne pas agréger le snapshot comme résultat final.

064/065 citent également une même ligne normative. Les grains des autres lectures indépendantes diffèrent et leurs notes originales restent conservées. Aucun total des sous-attendus n'est annoncé comme nombre d'obligations distinctes ni taux de conformité.

## Anomalies restant ouvertes

Les 125 références historiques ne sont pas réécrites. Les absences, couvertures partielles et différences de portée restent tracées individuellement, à traiter dans des lots distincts après cadrage. Trois contradictions documentaires P2 supplémentaires sont [sourcées par A5](A5/M08-TROIS-CONTRADICTIONS-OUVERTES-A5.json) : DA03-13/D111, DA05-02/D060, DA04-07/Suivi/D125. Elles demandent une clarification documentaire ; elles n'autorisent aucune modification de norme, fonctionnalité ou décision historique.

L'oracle classification de `a15d650` garde sa contradiction historique. Le correctif autorisé **CLASSIF-1 est séparé dans PR171 à5e0285d**, avec ses tests purs et CI propres ; il ne modifie pas rétroactivement les preuves M08.

M08 reste **En cours** : cette sous-tâche documentaire125 est achevée, mais les écarts, l'abrégé `packages/atelier-model/src/…`, DA09-09 prospectif et les limites hors scanner/licences ne sont pas déclarés résolus. Aucune case source/HTML cochée et aucune mission entière close. Les capacités natives Fadi et les 21 étapes sont préservées.
