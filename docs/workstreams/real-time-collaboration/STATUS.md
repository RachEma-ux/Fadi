# Temps réel (Real-time Collaboration) — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**En cours — cadrage RTC-0 (documentaire)** ouvert par RT-D1 ; questions RT-Q1 à RT-Q7 répondues (RT-D2, RT-D3) ; essai de
transport réalisé (RTC-0.3). Aucune implémentation ; RTC-1 bloqué par la porte des prérequis.

## Faits vérifiés

- Base observée : `main@2577e25` (CI verte sur ce SHA). PR #284 : CI verte sur `99562d9` ; `main` refusionné après #281 et #286 (conflit d'index résolu).
- Aucun WebSocket / SSE dans `apps` ni `packages` ; relectures périodiques de 60 s.
- RT-D3 : première version = **Studio seul** ; **canal propre au Temps réel**. RT-D2 : WebSocket ; une instance ; hôte remplacé explicitement ; coédition
  reportée ; COM garde sa remise.
- Essai RTC-0.3 (hors dépôt) : `ws` 8.18.3 sur Express 5.1.0, 13 / 13 en direct, 5 / 5 à travers Caddy 2.10.2 avec
  `basic_auth` ; un message trop gros sans gestionnaire d'erreur arrête le processus (corrigé dans l'essai, exigence
  RTC-1).
- `cibleAnnulation` de l'Atelier prend la dernière commande du projet, quel qu'en soit l'auteur
  (`routes/atelier-commands.ts:470`).
- Prérequis (porte de RTC-1) au checkpoint :
  - COM : **fusionné** (PR #285, `173b9f1`) — rempli ;
  - Organisations : PR #281 **fusionnée** (`0d5bb9b`) avec les phases 2, 3 bis et 5 (vue `project_effective_access`,
    six rôles, Approbateur / Diffuseur Studio) ; **phases 3 (invitations) et 4 (revue externe) non livrées** ;
  - PR #282 (E5, E6, E9, E10) : ouverte. E5 recoupe la phase 2 d'Organisations déjà fusionnée : à réaligner par son chantier.

## Points ouverts

- RTC-0.4 (profil de budgets), RTC-0.5 (réalignement après fusions), RTC-0.6 (statut de `module-registry.ts`).
- Durées chiffrées de conservation (RT-Q5) avant RTC-5.
- Fichiers de suivi d'autres chantiers en retard sur `main` : à corriger par leurs chantiers.

## Liens de suivi

- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche de tâche : `ccr-93a486a1-cbijf8`
- Pull Request : https://github.com/RachEma-ux/Fadi/pull/284

## Préconditions de clôture

- RTC-0 : critères de sortie de `TASKS.md`.
- Chantier : lots RTC-1 à RTC-5 acceptés, tests `PLAN.md` § 6 des lots RTC-1 à RTC-5 verts, préproduction validée par le maître d'ouvrage.
