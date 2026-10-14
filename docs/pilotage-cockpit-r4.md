# Modular Project Cockpit — R4 · Indicateurs métier sourcés

Date : 14 octobre 2026. Base : R3 fusionnée dans `main`.

## Décision d'architecture

R4 ne crée **ni nouvelle base KPI** ni une seconde vérité métier. Les indicateurs affichés sont des dérivations pures et testées des API existantes : `Parcours`, `planning R2`, `Documents` et `Analyses`.

Les données d'une étape appartiennent au module métier qui les a créées. Le cockpit sert à les réunir et à les rendre compréhensibles, pas à les modifier ni à certifier un résultat non attesté.

## Métriques et règles vérifiées

| Indicateur | Source | Définition | Valeur absente |
| --- | --- | --- | --- |
| Étapes déclarées terminées | `GET /projects/:id/steps` | Compte de `status === "termine"` pour 21 étapes valides | Non évalué |
| Étapes en cours | Parcours | Compte de `status === "en-cours"` | Non évalué |
| À réexaminer | Parcours | `stale || staleRetainedCount > 0` | Non évalué |
| Étapes datées | `GET /projects/:id/planning` | Deux dates civiles valides, fin ≥ début | Non évalué |
| Responsables renseignés | Planning R2 | Valeur `responsible` non vide après suppression des espaces | Non évalué |
| Prochaines actions renseignées | Planning R2 | Valeur `nextAction` non vide | Non évalué |
| Échéances passées non achevées | Planning R2 + Parcours | Date de fin valide antérieure au jour de consultation, étape non terminée | Non évalué sans date |
| Pièces produites | `GET /projects/:id/documents` | Documents dont `stepNumber` correspond à l'étape et `produced !== null` | Non évalué si catalogue non lu |
| Pièces produites à jour / périmées | Documents | État de fraîcheur calculé par le serveur depuis les empreintes des entrées | Non évalué si révisions incohérentes |
| Contrôles techniques | `GET /projects/:id/analyses` | Compte par statut métier enregistré et contrôlé contre `totals` | Non évalué si les comptes diffèrent ou la révision ne correspond pas |

**Important :** une étape « terminée » est un état déclaré dans Parcours, pas un contrôle de conformité. Une pièce « à jour » signifie que ses entrées n'ont pas changé selon l'empreinte du catalogue, **pas que son contenu a été approuvé**.

Les contrôles techniques `conforme / non-conforme / à vérifier / non évalué / sans objet` sont **globaux au dossier**. Le contrat actuel ne fournit pas de correspondance fiable pour les répartir par phase ou étape ; R4 refuse donc de leur attribuer arbitrairement une phase.

## Agrégation

Les phases reprennent les bornes R1, sans renuméroter les cartes : 01–03, 04–08, 09–12, 13–16, 17–19, 20–21. Les indicateurs de phase sont des comptes simples de ses étapes et de ses documents rattachés par `stepNumber`. Aucun score pondéré, indice global de qualité ou ratio de conformité supposé n'est calculé.

Les valeurs de type `null` sont affichées « Non évalué », **jamais zéro**. Le plan est rattaché au même `projectId`. Le catalogue Documents et les contrôles Analyses ne sont retenus que si leur `modelRevision` concorde avec celui du projet. Les agrégats techniques déclarés sont recoupés avec les contrôles reçus. Les versions, la date de calcul et les empreintes de contexte restent accessibles.

## Présentation

- Une synthèse très compacte sous les références de planning R2, sans matrice nouvelle.
- Dans chaque phase, couverture des dates et des responsables, échéances dépassées, points à réexaminer, nombre de pièces à jour et périmées.
- Dans le panneau de l'étape sélectionnée, état des champs, échéance, compte et libellés des pièces produites.
- Un pli de traçabilité donnant les sources, leur disponibilité, la version des analyses, la révision et les empreintes.
- Les vues mobile et bureau restent réactives ; les statistiques n'ajoutent pas de grandes tables.

## Tests d'acceptation

1. 21 étapes exactes ou progression « Non évalué » ; jamais de 0 trompeur pour une source absente.
2. Dates incomplètes, erronées ou d'un autre projet ne produisent aucun planning vérifié.
3. Échéance dépassée seulement pour une étape non terminée, avec date de fin valide.
4. Source Documents absente, catalogue de révision différente ou Analyse incohérente => indicateur non évalué.
5. Le nombre de documents ne vaut pas acceptation technique du livrable.
6. Le statut déclaré du Parcours et les pièces documentaires restent des indicateurs distincts.
7. La navigation R3, les écritures R2, les six phases et la présentation mobile ne régressent pas.

## Hors périmètre

Révision réglementaire automatique ; validation de dimensionnement structurel ; estimation financière non sourcée ; création de nouveaux modules et stockage persistant supplémentaire. Leur état reste celui déclaré par les modules métier, sans KPI substitutif.
