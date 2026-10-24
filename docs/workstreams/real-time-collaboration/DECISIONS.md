# Temps réel — décisions

## Décisions prises

- **RT-D1 — Ouverture de RTC-0 en parallèle (2026-10-24).** Le maître d'ouvrage, à la question « ouvrir RTC-0 maintenant
  (documentaire, en parallèle des chantiers en cours) ou attendre la fusion d'Organisations 2–4 et de COM (CR-D9 (a)) »,
  répond « 1 » (ouvrir maintenant). Portée : cadrage documentaire seulement (Issue #283). Elle ne vaut **ni** engagement
  de RTC-1, **ni** dérogation à CR-D9 pour l'implémentation : RTC-1 attend la porte des prérequis (`PLAN.md` § 4) et une
  décision explicite.

## Questions ouvertes (au maître d'ouvrage)

Recommandations du chef de projet, **non adoptées** tant qu'elles ne sont pas répondues.

| N° | Question | Options | Recommandation | Motif |
| --- | --- | --- | --- | --- |
| RT-Q1 | Périmètre du premier lot de vue partagée | (a) Studio seul ; (b) Studio puis Atelier dans RTC-2 ; (c) Studio + Atelier dès RTC-2 | (b) | Le concept nomme Studio propriétaire des révisions ; l'Atelier a ses propres révisions, son journal à curseur (`GET /projects/:id/atelier/journal?apres=n`) et ses verrous fins, et COM le cite comme contexte (`revision-atelier`) : l'ignorer créerait un angle mort (P2). |
| RT-Q2 | Canal serveur → client | (a) un canal unique, propriété du Temps réel, que COM utilise pour signaler ses nouveautés ; (b) un canal propre à chaque module | (a) | Un seul upgrade à sécuriser, une seule revalidation ; les contenus et audiences restent à COM (P5). |
| RT-Q3 | Transport | (a) WebSocket ; (b) SSE + HTTP | (a), après essai en RTC-0 | Pointeurs et caméra sont bidirectionnels et fréquents ; SSE resterait possible pour les seules notifications. Bibliothèque choisie après essai (Express 5, Caddy, `basic_auth` de préproduction). |
| RT-Q4 | Budgets de capacité | cibles § 7 du plan | à mesurer sur P.118 et l'appareil Android de recette | Aucune mesure Fadi n'existe ; ne pas les annoncer comme capacités (P9). |
| RT-Q5 | Conservation | présence, présence nominative (assiduité), rejeu, audit | présence éphémère ; rejeu court ; annotations selon leur propriétaire ; assiduité seulement si justifiée | Décision du concept laissée ouverte ; ne rien inventer. |
| RT-Q6 | Reprise de l'hôte | (a) expiration visible + remplacement explicite autorisé ; (b) promotion automatique | (a) | RT-R2, RT-R6 : aucune promotion vers une autorité métier. |
| RT-Q7 | Coédition (RTC-6) | ADR distincte après première version acceptée | reportée | Concept v1.2 : seulement après les tests de transaction, géométrie, annulation, conflit et reprise. |
