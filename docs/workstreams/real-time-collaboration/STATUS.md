# Temps réel (Real-time Collaboration) — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**En cours — cadrage RTC-0 (documentaire)** ouvert par RT-D1. Aucune implémentation ; RTC-1 bloqué par la porte des
prérequis. Ne pas assimiler à un travail livré.

## Faits vérifiés

- Base observée : `main@2577e25` (CI « CI », architecture, continuité, isolation, project-layout vertes sur ce SHA).
- Aucun WebSocket / SSE dans `apps` ni `packages` ; relectures périodiques de 60 s.
- Existants réutilisables : journal Atelier à curseur (`GET /projects/:id/atelier/journal?apres=n`), `atelier_outbox`,
  `atelier_locks`, réservation projet (`routes/lock.ts`), idempotence Studio et Atelier (`requestId`), audiences E1.
- Chantiers dont il dépend, non fusionnés au checkpoint : PR #281 (Organisations, OP-3), PR #282 (E5, E6, E9, E10),
  branche COM `ccr-a50667e3-fng2br` (#280, sans PR).

## Points ouverts

- RT-Q1 à RT-Q7 (`DECISIONS.md`).
- Essai de transport et budgets de référence (RTC-0.3, RTC-0.4).
- Fichiers de suivi d'autres chantiers en retard sur `main` (collaboration-rules : #274 ; organisations : phase 1) : à
  corriger par leurs chantiers.

## Liens de suivi

- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche de tâche : `ccr-93a486a1-cbijf8`
- Pull Request : PR de cadrage RTC-0 (voir l'Issue).

## Préconditions de clôture

- RTC-0 : critères de sortie de `TASKS.md`.
- Chantier : lots RTC-1 à RTC-5 acceptés, tests `PLAN.md` § 6 des lots RTC-1 à RTC-5 verts, préproduction validée par le maître d'ouvrage.
