# Temps réel (Real-time Collaboration) — Contexte

## Objectif

Donner à Fadi des sessions en direct autorisées **sur le Studio** (RT-D3 : présence, vue partagée, suivi d'un
présentateur, annotations enregistrées, revue externe en direct d'un paquet figé Studio), par un **canal propre au Temps
réel**, **sans** créer un second moteur métier : les écritures restent aux commandes
existantes (Studio, Atelier), les messages à COM, les droits à Users Management / Organisations, la diffusion à
Studio / Documents. La coédition simultanée 2D/3D est reportée (RTC-6) jusqu'à preuve des dépendances, de l'annulation
et des conflits.

## Périmètre

- Inclus : RTC-0 (cadrage documentaire, ce dossier) sur décision du maître d'ouvrage du 2026-10-24 ; plan des lots RTC-1
  à RTC-7, contrats et traçabilité RT-R1 à RT-R7.
- Exclus : toute implémentation avant la porte « prérequis » (`PLAN.md` § 4) et une décision explicite d'engager RTC-1 ;
  le Sandbox (indépendance bidirectionnelle, `modules/sandbox/independance.test.ts`) ; production ; un système de comptes,
  d'invitations, de droits ou de messagerie propre au temps réel.

## Sources canoniques

- `AGENTS.md` ; `CLAUDE.md` ; `docs/architecture.md`
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Concept : `Fadi Concept/Fadi Concept - Real-time Collaboration.md` (v1.2) ; `Collaboration Common Rules` ;
  `Collaboration Concept Map`.
- Règles communes : `docs/workstreams/collaboration-rules/PLAN.md` § 1.3 (RT-R1 à RT-R7), § 2 (scénarios S6, S7, S9) ;
  décisions CR-D1 à CR-D10 (`collaboration-rules/DECISIONS.md`).
- Évaluation préalable : `docs/continuity/EVALUATION-PLAN-TEMPS-REEL-2026-10-24.md` (écarts P1 à P10).
- Chantiers dont il dépend : `organisations-participation/` (#262, OP-3, PR #281), PR #282 (E5, E6, E9, E10),
  `communication/` (#280, branche `ccr-a50667e3-fng2br`, non fusionnée au 2026-10-24).

## Contraintes

- Préserver les décisions et règles métier existantes ; ne pas rouvrir CR-D1, CR-D4, CR-D5, CR-D7, CR-D9.
- Ne pas confondre implémentation, vérification et acceptation.
- Pas de secret dans GitHub.
- Les 21 étapes du Parcours sont intouchables ; interface bilingue (source française, `en.json`) ; règle d'or (icône,
  barre, raccourci, testés).
- Une session n'enregistre aucune révision et n'approuve rien (RT-R3) ; l'hébergement ne donne aucun droit (RT-R2).
- Géométrie et modèles indépendants de React et du DOM : le temps réel ne déplace aucune règle métier dans le transport.

## Hypothèses et questions ouvertes

- Ordre réel des chantiers différent de CR-D9 (a) : COM ouvert par dérogation (COM-D1), Organisations exécuté de bout en
  bout (OP-3). RTC-0 démarre en parallèle (RT-D1) ; RTC-1 attend la porte des prérequis.
- Questions ouvertes RT-Q1 à RT-Q7 : `DECISIONS.md`.
