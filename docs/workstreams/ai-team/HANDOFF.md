# Reprise — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## Checkpoint Mission 003 — récupération des originaux

Les originaux de Mission 002 sont maintenant retrouvés et archivés sans modification d’octets : [rapport et limites](../../ai-team/reports/MISSION-003-RECUPERATION.md), [manifeste](../../ai-team/reports/mission-002-originals/manifest.json).19 fichiers inventoriés,14 pièces non redondantes versées. DEC/NAV/matrices sont intégrées aux rapports originaux ; aucun fichier autonome INV/IF/AC/DEC original inventé.

Le [registre consolidé 630](../studio/task-register.json) conserve les 630 affectations/textes exacts, les six vérifications documentaires et tous les blocages. Aucune case source cochée ni tâche produit acceptée. M00/M29 restent en cours ; transfert des originaux vérifié, préparation des 141 fiches et des autres missions en cours. Les paragraphes antérieurs ci-dessous constituent le relevé de réception avant ce transfert.

Référence programme avant ce checkpoint : a09c11d397c8527987c3d1c4410ebb2eb240a819 ; CI exacte 39114417812 réussie (pas la preuve de ce nouveau commit). Prochaine action autorisée : intégrer les spécifications des agents puis les contrôler/publier ; A3, code/POC/migrations/services/admin/fusions/production restent non autorisés.

## Point de reprise

Lire AGENTS.md, docs/continuity/README.md, ce HANDOFF puis STATUS, TASKS et CONTEXT. Lire docs/ai-team/CODEX-START-HERE.md et [MISSION-002-RECEPTION.md](../../ai-team/reports/MISSION-002-RECEPTION.md). Retrouver #156 et la PR #165 sur docs/156-codex-missions-completes ; ne pas supposer une fusion dans main.

## Dernier état vérifié

Main relu à 27c0c5a35e2f116752a83a9c66459484488a1975, non protégé. CI de cette référence maintenant réussie (run 39095745108 : validate/e2e/image). PR #165 ouverte ; plan initial c1c0f7f3ad3a1720e8c64252eea89823351f0b88. Source Studio verrouillée et couverture du plan initial contrôlée ; voir STATUS. Aucun correctif, fusion, déploiement, changement administratif ou service Cloud exécuté pendant cette réception.

Mission 002 reçue : A0 et cinq sous-agents déclarés exécutés, A3 inactif ; préparation L1–L6. Le compte rendu n’est pas les cinq rapports ou le registre enrichi. Leur versement reste à effectuer par Codex depuis sa session, sans inventer les pièces.

## Prochaine action

**M00/M29 : récupérer les livrables originaux de Mission 002, pas recommencer la mission.** Identifier les fichiers réellement présents dans la session, versions/empreintes et limites. Les rapprocher des 31 missions, des 630 affectations et des dossiers ai-team/studio déjà créés dans #165. Enregistrer les documents non sensibles sur branche/PR autorisée, avec STATUS/HANDOFF ensemble. La préparation et le suivi documentaire sont déjà couverts par #156 ; ne pas redemander cette autorisation de principe.

Puis compléter les préparations prêtes M01/M02/M03/M05–M09 et M11/M12/M13/M15/M26. M12 exige les 141 fiches exactes : le relevé initial par groupe ne les clôt pas. Préparer les décisions bornées pour la garde DB et la reprise Cloud ; aucune correction A3, opération mutatrice, fusion ou administration depuis ce seul relais. Continuer les tâches indépendantes pendant l’attente.

## Tests et preuves

Contrôles documentaires : python3 -m unittest discover -s docs/ai-team -p 'test_check_missions.py' -v ; python3 docs/ai-team/check_missions.py --check ; node scripts/check-continuity.mjs. Lier les runs à la tête exacte de #165. Les 1 757/47/3 historiques ne deviennent pas les résultats de Mission 002 ou de ce checkpoint. Aucun test destructif sur cible inconnue.

## Risques et blocages

Pièces originales non versées ; cause d’arrêt PostgreSQL et scripts Cloud exacts à rapprocher ; garde DB non implémentée ; main non protégé ; gates/décisions non acceptés. Les demandes M002-D01 à D08 sont enregistrées dans le retour. Réutiliser #142/#152/#154 pour les périmètres recouvrants ; un seul éditeur des fichiers partagés. La branche work n’est pas une anomalie par son nom.

## Arrêt sûr

Chaque blocage garde cause, propriétaire, essais, action de déblocage et prochaine vérification. Avant interruption, enregistrer SHA/diff/tests/prochain geste dans STATUS/HANDOFF ensemble. Si GitHub ou une pièce est inaccessible, le dire et préserver le checkpoint local. Aucun abandon ni promesse d’exécution en arrière-plan sans processus réel.
