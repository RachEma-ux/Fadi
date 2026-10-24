# Temps réel (Real-time Collaboration) — Tâches

## À faire

- [ ] RTC-0.4 — Fixer le profil de référence des budgets (exemple P.118, appareil Android de recette, réseau déclaré)
      et mesurer ce qui peut l'être avant RTC-1 (RT-D2, RT-Q4). (Issue #283)
- [ ] RTC-0.5 — Revue du plan après fusion d'Organisations phase 2 (bascule de `loadProjectAccess`) et du socle COM :
      réaligner portées, audiences et raccourcis. (Issue #283)
- [ ] RTC-0.6 — Statut périmé de Collaboration dans `apps/web/src/modules/module-registry.ts` (REP-06, repris du plan
      du 22 octobre) : texte d'interface et traduction `en.json`, dans une PR de code distincte. (Issue #283)
- [ ] Hors première version : annulation de l'Atelier par auteur (`cibleAnnulation` prend la dernière commande du
      projet) — décision D4 de l'ancien plan, à trancher avant que l'Atelier entre dans une session.

## En cours

- RTC-0.1 — Dossier, plan amendé, traçabilité RT-R1 à RT-R7 : PR #284.

## Terminé

- Évaluation du plan fourni : `docs/continuity/EVALUATION-PLAN-TEMPS-REEL-2026-10-24.md`.
- RT-D1 : ouverture de RTC-0 en parallèle (2026-10-24).
- RTC-0.2 — RT-Q1 à RT-Q7 répondues : RT-D2, d'après le § 9 du plan remis par le maître d'ouvrage.
- RTC-0.3 — Essai de transport : `ESSAI-TRANSPORT.md` (13 / 13 en direct, 5 / 5 à travers Caddy ; `ws` proposé).
- Plan du 22 octobre (`docs/collaboration-temps-reel-plan`) relié et repris (`PLAN.md` § 10).

## Bloqué

- RTC-1 et suivants : porte des prérequis (`PLAN.md` § 4 : Organisations phases 2–4, PR #282, socle COM fusionnés) et
  décision explicite d'engager RTC-1.

## Critères de sortie

- RTC-0 : plan revu et fusionné, RT-D2 consignée, essai de transport consigné, profil de budgets fixé (RTC-0.4),
  contrôle de continuité vert.
- Chaque lot suivant : Issue, PR, preuves, STATUS / HANDOFF à jour ; acceptation consignée par le maître d'ouvrage.
