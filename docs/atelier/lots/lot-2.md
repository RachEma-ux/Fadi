# Lot 2 — API transactionnelle et synchronisation : compte rendu

Branche du lot : `lot/2-api`, partie de `lot/1-modele` (contenu identique à `atelier/principal` après la PR #42),
retour vers `atelier/principal` (D-020). Cahier : §5.3–5.5, §5.7, §7 (lot 2).
**État : livré et accepté (D-032, au titre de D-028).**

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
| L2.5 tests API, scénario hors ligne | #40 | T03, T06, T07 (de bout en bout avec L2.3), T08, T10, annuler / rétablir, journal, problèmes, révision passée : fusionnés (PR #46) ; scénario coupure et rejeu contre le vrai serveur, avec le bus et le client fusionnés : fusionné (PR #48) ; D-032 |
| L2.6 décisions, compte rendu, matrice | #41 | fusionnée (PR #47 et suivante) ; D-028 à D-032 ; interface `atelier-events.ts` figée ; `docs/migration/matrix.md` §3 complétée |

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

Section « Coupure et rejeu » (run 37166041116) :

```text
— Coupure et rejeu (file hors ligne) —
A envoyée sur la révision 4, réponse perdue (coupure) : A reste en file
File hors ligne : Mur A base 4, Mur B base 5, Mur C base 6
Rejeu Mur A : HTTP 200 → révision 5 journal acmd_af122bcb-…
Rejeu Mur B : HTTP 200 → révision 6 journal acmd_db1c315a-…
Rejeu Mur C : HTTP 200 → révision 7 journal acmd_35a1be6f-…
✓ les trois rejeux sont acceptés (200)
✓ A rend la réponse enregistrée (aucune nouvelle révision)
✓ révision finale 7, trois entrées au journal (A une seule fois)
Démonstration conforme.
```

## Acceptation (cahier §7, lot 2)

| Critère | Preuve |
| --- | --- |
| Tests API verts | CI verte de `lot/2-api` : `commands.atelier-api.test.ts`, `hors-ligne.atelier-api.test.ts`, `db.atelier-events.test.ts`, `db.atelier-base.test.ts` (PostgreSQL + PostGIS) |
| Même enveloppe envoyée deux fois → une seule révision | T06 (réponse identique à l'octet) ; démonstration « Idempotence » |
| Conflit détaillé | T08 (409 `{ baseRevision, revisionCourante, conflits }`) ; démonstration « Conflit entre deux comptes » ; conflit d'une enveloppe de la file (test hors ligne, étape 4) |
| Documents marqués périmés après une commande | T07 de bout en bout (route → traitement de la boîte de sortie) ; `db.atelier-events.test.ts` |
| File rejouée après coupure | `hors-ligne.atelier-api.test.ts` : `BusAtelier` + client fusionnés contre le vrai serveur ; démonstration « Coupure et rejeu » |
| L'Atelier visible est encore l'ancien | `routes/atelier.ts`, `lib/atelier-store.ts`, `lib/api/atelier.ts` intacts ; scénarios e2e de l'ancien Atelier verts |

## Réserves et reports

- e2e : le contrôle « reprise automatique (sonde /health) » du scénario web `09-hors-ligne` a échoué une fois
  (run 37166041116, 1er essai) puis réussi au 2e, sur un changement sans code applicatif : instabilité de délai à surveiller.

- T07 côté API vérifie `updatedAt >=` : l'écriture du service suffit à la satisfaire ; la preuve que l'aperçu
  conceptuel est invalidé par le traitement est dans `db.atelier-events.test.ts` (L2.3).
- `/problemes` ne produit encore rien pour `conflit` ni `harmonie` (D-031) ; à compléter quand l'Atelier
  affichera les problèmes (lot 3a ou ultérieur).
- Défaut corrigé à l'intégration : l'initialisation du modèle écrivait un événement (notification et bilan
  Harmonie périmé à la simple ouverture) ; supprimé (D-031).
