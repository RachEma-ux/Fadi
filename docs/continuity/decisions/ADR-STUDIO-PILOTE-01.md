# ADR-STUDIO-PILOTE-01 — Délégation totale et arbitrages du pilote Studio

Statut : **Accepté** (délégation du maître d'ouvrage) ; décisions prises par le chef de projet sous délégation.
Date : 2026-10-25.
Chantier : `studio` (programme [#156](https://github.com/RachEma-ux/Fadi/issues/156), canal [#166](https://github.com/RachEma-ux/Fadi/issues/166)).
Dossier préparatoire : [`DEC-OUVERTES-PILOTE.md`](../../workstreams/studio/DEC-OUVERTES-PILOTE.md) ; options des 18 DEC :
`docs/ai-team/reports/mission-004/A1/studio-18-decisions-v2.json`.

## Contexte

Le registre Studio (`docs/workstreams/studio/task-register.json`) bloque 209 obligations sur la même cause : responsables
non nommés, DEC non arbitrées, sous-lots non autorisés. Le pilote est ratifié depuis G0 (CAD-DEC-01, D01) : étude
synthétique local/pavillon, parcours A (2D autonome jusqu'à la publication), B (3D directe jusqu'à vue et coupe), C
(objets associés jusqu'à revue et publication). Le 25 octobre 2026, après lecture du dossier préparatoire, le maître
d'ouvrage écrit (session Claude Code) : « T'as une délégation totale pour les décisions qui me reviennent à faire.
Applique tes recommandations en lieu et place. Exécute de A à Z ».

## Décision et responsable

### P-01 — Délégation

Délégation totale pour le chantier Studio, de même forme que D-203 et ADR-GEODATA-02 : le chef de projet (Claude Code)
tranche les décisions qui reviennent au maître d'ouvrage, applique les recommandations du dossier préparatoire,
consigne chaque décision ici et au registre, et fusionne **seulement CI verte**. Le maître d'ouvrage peut reprendre la
main ou annuler une décision à tout moment.

**Exclusions maintenues** : publication en production (Release du maître d'ouvrage), paramètres et protections GitHub,
secrets, données réelles de projet, tests destructifs hors base jetable. La délégation ne crée aucune personne, aucune
mesure et aucun seuil : ce qui n'est pas mesuré reste « non évalué ».

### P-02 — Responsabilités (RESP-01 à RESP-05, CAD-DEC-02, CAD-DEC-03)

| Rôle | Responsable de l'acceptation | Instruction et réalisation |
|---|---|---|
| Produit : périmètre métier, navigation, recette (RESP-01) | Maître d'ouvrage (compte GitHub `RachEma-ux`) | Chef de projet |
| Architecture : instruction des DEC, frontières (RESP-02) | Maître d'ouvrage | Chef de projet |
| Sous-lots CAO, backend, frontend, BIM/documentation (RESP-03) | Maître d'ouvrage | Chef de projet |
| Qualité/sécurité : tests adverses, corpus, preuves (RESP-04) | Maître d'ouvrage | Chef de projet ; CI du dépôt |
| Exploitation : migration, sauvegarde, retour arrière (RESP-05) | Maître d'ouvrage, qui seul publie en production | Chef de projet (préparation, base jetable) |

- **Personnes** : une seule personne habilitée réelle, le maître d'ouvrage. Les agents (A0–A6, Claude Code) ne sont pas
  des habilitations humaines. Aucun autre nom n'est inventé.
- **Disponibilité** : à la demande du maître d'ouvrage, sans engagement de délai. Aucun réviseur humain indépendant n'est
  identifié : on garde le profil solo de D05 (PR, CI, acceptation tracée).
- **Cumul** : autorisé pour le maître d'ouvrage. Sous la présente délégation, le chef de projet consigne les
  acceptations en son nom. La séparation reste tracée : rédaction et réalisation par l'agent, acceptation par le maître
  d'ouvrage ou par cet acte, preuve par la CI.

### P-03 — Intégration de Studio (ADR-03)

[ADR-STUDIO-NAV-01](ADR-STUDIO-NAV-01.md) est **acceptée, option A** : routes sous `/studio`, entrée par un descripteur
global distinct de `MODULES`, `StudioShell` indépendant de `ProjectShell`, plein écran explicite, coexistence COEX-02 à
COEX-06. C'est ce que réalise le code de `main` (`apps/web/src/modules/studio/StudioShell.tsx`, `routes-studio.ts`).

### P-04 — Les 18 décisions DEC

| DEC | Option retenue | Réserve |
|---|---|---|
| DEC-01 | Document 2D existant (`studio-document/1`) comme autorité 2D indépendante, stocké dans `studio_revisions.document` | Une migration de format future est déclarée version par version |
| DEC-02 | Association vers un objet sémantique unique quand le rattachement est prouvé ; sinon référence liée, copie indépendante ou statut « à résoudre » explicite | Jamais d'approximation silencieuse |
| DEC-03 | Étude, variante et révision comme entités propres (`studio_studies`, `studio_variants`, `studio_revisions` en ajout seul) | Les projets existants ne sont pas migrés en études : l'étude s'ajoute au projet |
| DEC-04 | Profils standard, métier et personnel attachés au compte | Profil d'équipe partagé reporté |
| DEC-05 | Manifeste d'outils statique, versionné et validé au build (`manifeste-outils.ts`) | Pas de catalogue servi par l'API dans le pilote |
| DEC-06 | Adaptateurs par famille derrière l'API commune du catalogue | Le gestionnaire ne recalcule ni ne valide le métier |
| DEC-07 | Morceaux par famille, moteurs lourds (3D, noyau exact) chargés à la demande | Découpage plus fin seulement sur mesure |
| DEC-08 | Rendu SVG/React | Aucune bascule Canvas/GPU sans mesure comparée (TEST-025) |
| DEC-09 | Parcours linéaire sous 1 000 éléments, grille uniforme au-delà (seuil mesuré, banc C.1) | Résultat identique au parcours linéaire exigé (test de propriété) |
| DEC-10 | Invalidation par signature et lots stables, avec reconstruction complète en repli | Lots acceptés seulement si la désignation (picking) reste exacte |
| DEC-11 | Worker paresseux par moteur, avec délai, annulation et relance (`workers/hote-worker.ts`) ; noyau exact séparé (D-177) | Pas de service serveur de calcul dans le pilote |
| DEC-12 | Historique local par commandes (`studio/history.ts`) au-dessus de révisions immuables | Une annulation ne réécrit jamais une révision ni une publication |
| DEC-13 | Voir ci-dessous | — |
| DEC-14 | Socle hors ligne restreint : la file locale versionnée est conservée, un outil absent du cache est déclaré indisponible | Rien n'est publié hors ligne |
| DEC-15 | Extensions et MCP **exclus du pilote** (report D02), option conservée au backlog | Rouvrir par une décision propre |
| DEC-16 | Manifeste de publication immuable, avec empreintes, refus `manifest_mismatch`, approbation et diffusion distinctes | — |
| DEC-17 | Qualité graphique fixe : aucune concession adaptative dans le pilote | — |
| DEC-18 | Réemploi des moteurs Fadi par leurs interfaces publiques (`@parcours/atelier-model`, conventions du noyau exact) | Remplacement d'un sous-composant seulement sur preuve |

**DEC-13 — appareils et budgets.**
- Appareils de recette du pilote :
  - Chromium (Playwright) en bureau, sur le runner Linux de la CI ;
  - Chromium en gabarit téléphone, dans les recettes qui le prévoient.
- Ce qui reste **non évalué** : le rendu y est logiciel, donc les performances GPU réelles et les appareils physiques
  restent « non évalués » ; aucun n'est disponible.
- Budgets : on retient les seuils publiés des Core Web Vitals (web.dev, p75 : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1)
  comme cible d'interface. Pour la géométrie, on exige l'exactitude, pas la vitesse. Aucun autre seuil chiffré n'est
  fixé.

## Justification

Chaque option retenue est celle du dossier préparatoire. Elle est réalisée par le code de `main` au 25 octobre 2026
(commit `3e992b6`) et couverte par ses tests et recettes. Arbitrer autrement obligerait à réécrire du code qui
fonctionne, sans gain démontré (DEC-18).

## Conséquences

- Au registre, RESP-01 à 05, CAD-DEC-02, CAD-DEC-03, ADR-03 et DEC-01 à DEC-18 passent à « Accepté », avec cet acte
  comme preuve.
- Les obligations de recette (NAV, TEST, REC) ne passent à « Vérifié » que sur une recette exécutée qui contrôle
  leur critère exact (voir `STATUS.md`).
- Restent ouverts : appareils physiques et GPU réel (DEC-13), réviseur humain indépendant, corpus intégral (famille X),
  priorités des risques (ADR-05), et tout ce qui n'a pas de recette.
