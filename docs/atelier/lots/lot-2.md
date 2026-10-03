# Lot 2 — API transactionnelle et synchronisation : compte rendu

Branche du lot : `lot/2-api`, partie de `lot/1-modele` (contenu identique à `atelier/principal` après la PR #42),
retour vers `atelier/principal` (D-020). Cahier : §5.3–5.5, §5.7, §7 (lot 2).
**État : en cours.**

## Organisation

Phase 1, en parallèle : L2.1 (schéma figé : tables §5.5, `VolumeStore`, passage état ⇄ lignes) et L2.4 (client
d'après les routes figées du §5.4). Phase 2 : L2.2 et L2.3 (service de commandes et événements) sur le schéma
de L2.1, puis L2.5 (tests API T03, T06, T07, T08, T10, scénario hors ligne). Deux équipiers au plus à la fois
(mémoire du poste) ; les tests qui exigent PostgreSQL et PostGIS tournent dans la CI, déclenchée à chaque push.

## Matrice de propriété

| Zone | Propriétaire |
| --- | --- |
| Section `atelier` de `apps/api/src/db/init.sql`, bloc `atelier` de `schema.ts`, `lib/volume-store.ts`, `lib/atelier-rows.ts`, `scripts/verify-restore.sh` | équipier « base » (L2.1) |
| `apps/api/src/routes/atelier-commands.ts`, `lib/atelier-commands.ts`, `lib/atelier-events.ts` | équipier « API » (L2.2, L2.3, L2.5) |
| `apps/web/src/modules/atelier/bus/**`, `apps/web/src/lib/api/atelier-commandes.ts` | équipier « client » (L2.4) |
| `docs/atelier/lots/lot-2.md`, `docs/atelier/decisions.md`, `docs/migration/matrix.md` | chef de projet (L2.6) |

L'ancien Atelier (`routes/atelier.ts`, `lib/atelier-store.ts`, `lib/api/atelier.ts`) reste intact jusqu'au lot 4.

## Avancement

| Tâche | Issue | État |
| --- | --- | --- |
| L2.1 tables, `VolumeStore`, migration | #36 | fusionnée (PR #44) ; 9 tests PostgreSQL + aller-retour P.118 ; D-030 |
| L2.2 service de commandes | #37 | après L2.1 |
| L2.3 événements | #38 | après L2.1 |
| L2.4 client : bus, file Dexie, conflits | #39 | fusionnée (PR #43) ; 17 tests ; détails d'API figés (D-029) |
| L2.5 tests API, scénario hors ligne | #40 | avec L2.2 |
| L2.6 décisions, compte rendu | #41 | en cours |
