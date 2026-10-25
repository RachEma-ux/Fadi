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

- RTC-2 — Vue partagée Studio : implémentée et vérifiée en local (`lots/rtc-2.md`), PR du lot (Issue #283).
- RTC-3 à RTC-5 — à enchaîner un par un (RT-D4).

## Terminé

- RTC-1 — Socle des sessions et canal temps réel : PR #288 fusionnée CI verte (`lots/rtc-1.md`), trois remarques de revue corrigées (`eb3cf3a`).
- RTC-0.1 — Dossier, plan amendé, traçabilité RT-R1 à RT-R7 : PR #284 fusionnée (`c3f87de`).
- RT-D4, RT-D5 — exécution déléguée de RTC-1 à RTC-5 et choix techniques consignés.
- Évaluation du plan fourni : `docs/continuity/EVALUATION-PLAN-TEMPS-REEL-2026-10-24.md`.
- RT-D1 : ouverture de RTC-0 en parallèle (2026-10-24).
- RTC-0.2 — RT-Q1 à RT-Q7 répondues : RT-D2, d'après le § 9 du plan remis par le maître d'ouvrage.
- RT-D3 — Studio seul ; canal propre au Temps réel (réponse du maître d'ouvrage, 2026-10-24).
- RTC-0.3 — Essai de transport : `ESSAI-TRANSPORT.md` (13 / 13 en direct, 5 / 5 à travers Caddy ; `ws` proposé).
- Plan du 22 octobre (`docs/collaboration-temps-reel-plan`) relié et repris (`PLAN.md` § 10).

## Bloqué

- Rien pour RTC-2. RTC-4 dépend de la phase 4 d'Organisations (revue externe) pour l'accès des invités ; à défaut, il se limite aux membres du projet sur un paquet figé.

## Critères de sortie

- RTC-0 : plan revu et fusionné, RT-D2 consignée, essai de transport consigné, profil de budgets fixé (RTC-0.4),
  contrôle de continuité vert.
- Chaque lot suivant : Issue, PR, preuves, STATUS / HANDOFF à jour ; acceptation consignée par le maître d'ouvrage.
