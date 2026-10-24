# Communication (COM) — Tâches

## À faire

- [ ] COM-9 — Confirmation explicite des décisions COM-D1 à COM-D14 (la PR #285 est fusionnée sur demande du maître d'ouvrage).
- [ ] COM-10 — Après Organisations phase 2 : brancher l'audience sur les affectations (`loadProjectAccess`), sans changer le modèle COM.
- [ ] COM-11 — Après Organisations phase 4 : audience « paquet » et voie de revue externe (concept § 4).
- [ ] COM-12 — Suites du concept sur décision : photos et épingles, espace d'organisation, BCF, annuaire, courriel, IA.

## En cours

- Aucune : livraison fusionnée (PR #285, `173b9f1`) ; COM-9 attend la confirmation des décisions.

## Terminé

- [x] Livraison — PR #285 fusionnée dans `main` (`173b9f1`, 2026-10-24), CI verte, revue Codex traitée.
- [x] COM-0 — Plan d'implémentation et décisions COM-D1 à COM-D14 (`PLAN.md`, `DECISIONS.md`).
- [x] COM-1 — Schéma (`init.sql`, `schema.ts`), règles pures (`lib/com-audience.ts`), conversations, audiences, participants, messages, références et mentions (`routes/com.ts`, `lib/com.ts`).
- [x] COM-2 — Partage d'extraits et actions liées avec aperçu et empreinte.
- [x] COM-3 — Demandes de précision (`lib/demandes-regles.ts`, `lib/demandes.ts`, `routes/demandes.ts`).
- [x] COM-4 — Accusés, boîte (`GET /com/boite`), notifications `message` et `demande`.
- [x] COM-5 — Interface : section Communication, demandes, panneau d'étape, « Ma boîte », règle d'or, traduction anglaise.
- [x] COM-5 bis — Activité du projet filtrable, revues Studio liées, panneaux contextuels Studio et Documents (relecture du `.docx`).
- [x] COM-6 — File d'envoi rejouable hors ligne et états montrés.
- [x] COM-7 — Responsabilités et reprise (animation, réattribution).
- [x] COM-8 — Recette `apps/web/e2e/communication.mjs` (CI, tranche `complements`) et documentation.

## Bloqué

- Aucune tâche bloquée.

## Critères de sortie

- CI verte de la PR (dont la recette `communication.mjs` et `interface-anglais.mjs`) ; acceptation du maître d'ouvrage consignée.
