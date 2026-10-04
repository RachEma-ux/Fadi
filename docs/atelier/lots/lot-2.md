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
| L2.2 service de commandes | #37 | fusionnée (PR #46) ; droits, réservation, conflit détaillé, idempotence à l'octet, journal et inverses, annuler / rétablir, essai, routes §5.4 ; D-031 (session interrompue le 2026-10-04 : travail sauvegardé en e559227 puis repris) |
| L2.3 événements | #38 | fusionnée (PR #45) ; boîte de sortie idempotente, traitement unique, échecs rejouables ; documents et bilan Harmonie périmés, aperçu invalidé, notification « modèle » regroupée ; tests PostgreSQL |
| L2.4 client : bus, file Dexie, conflits | #39 | fusionnée (PR #43) ; 17 tests ; détails d'API figés (D-029) |
| L2.5 tests API, scénario hors ligne | #40 | T03, T06, T07 (de bout en bout avec L2.3), T08, T10, annuler / rétablir, journal, problèmes, révision passée : fusionnés (PR #46) ; scénario coupure et rejeu contre le vrai serveur : en cours (`tache/L2.5-hors-ligne`) |
| L2.6 décisions, compte rendu, matrice | #41 | en cours ; interface `atelier-events.ts` figée ; `docs/migration/matrix.md` §3 complétée |

## Démonstration en ligne de commande

`node apps/api/scripts/demo-atelier.mjs` contre une API locale (`API_URL`) ; sortie capturée dans la CI (run 37165292170) :

```text
Modèle initial : révision 0, empreinte sha256-5bbd144c239d…
Niveau et calque créés : révision 1
— Idempotence (T06) —
1er envoi : HTTP 200 révision 2 journal acmd_f0436871-…
2e envoi  : HTTP 200 révision 2 journal acmd_f0436871-…
✓ les deux envois sont acceptés (200)
✓ réponse identique (réponse enregistrée, rien de réappliqué)
✓ une seule révision (2) et une seule entrée au journal
— Conflit entre deux comptes (T08) —
Alice (base 2) : HTTP 200 → révision 3
Bruno (base 2) : HTTP 409 {"erreur":"conflit","baseRevision":2,"revisionCourante":3,"conflits":[{"objetId":"MA","motif":"créé par « Mur d'Alice » (révision 3)","etatServeur":"mur MA"}]}
✓ Bruno reçoit 409 « conflit »
✓ le conflit cite le mur d'Alice tel qu'il est sur le serveur
Bruno rejoue sur la révision 3 (nouveau requestId) : HTTP 200 → révision 4
✓ le rejeu sur la révision courante est accepté
Démonstration conforme.
```

## Réserves et reports

- T07 côté API vérifie `updatedAt >=` : l'écriture du service suffit à la satisfaire ; la preuve que l'aperçu
  conceptuel est invalidé par le traitement est dans `db.atelier-events.test.ts` (L2.3).
- `/problemes` ne produit encore rien pour `conflit` ni `harmonie` (D-031) ; à compléter quand l'Atelier
  affichera les problèmes (lot 3a ou ultérieur).
- Défaut corrigé à l'intégration : l'initialisation du modèle écrivait un événement (notification et bilan
  Harmonie périmé à la simple ouverture) ; supprimé (D-031).
