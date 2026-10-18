# Reprise — Studio

Mis à jour : 2026-10-18 (UTC).

## Checkpoint Mission 003 — récupération des originaux

Les originaux de Mission 002 sont maintenant retrouvés et archivés sans modification d’octets : [rapport et limites](../../ai-team/reports/MISSION-003-RECUPERATION.md), [manifeste](../../ai-team/reports/mission-002-originals/manifest.json).19 fichiers inventoriés,14 pièces non redondantes versées. DEC/NAV/matrices sont intégrées aux rapports originaux ; aucun fichier autonome INV/IF/AC/DEC original inventé.

Le [registre consolidé 630](../studio/task-register.json) conserve les 630 affectations/textes exacts, les six vérifications documentaires et tous les blocages. Aucune case source cochée ni tâche produit acceptée. M00/M29 restent en cours ; transfert des originaux vérifié, préparation des 141 fiches et des autres missions en cours. Les paragraphes antérieurs ci-dessous constituent le relevé de réception avant ce transfert.

Référence programme avant ce checkpoint : a09c11d397c8527987c3d1c4410ebb2eb240a819 ; CI exacte 39114417812 réussie (pas la preuve de ce nouveau commit). Prochaine action autorisée : intégrer les spécifications des agents puis les contrôler/publier ; A3, code/POC/migrations/services/admin/fusions/production restent non autorisés.

## Point de reprise

Lire AGENTS.md, docs/continuity/README.md, ce HANDOFF puis STATUS, TASKS et CONTEXT. Lire docs/ai-team/CODEX-START-HERE.md, les missions M11–M30 et [MISSION-002-RECEPTION.md](../../ai-team/reports/MISSION-002-RECEPTION.md). Utiliser la branche de #165 tant que la fusion n’est pas confirmée.

## Dernier état vérifié

Chantier initialisé dans #165 depuis main 27c0c5a35e2f116752a83a9c66459484488a1975 ; source et groupes #159–#164 existants. Couverture initiale réussie, pas de réalisation Studio déduite. Qualification et cinq rapports annoncés par Mission 002 ; seule leur synthèse reçue est archivée ici. Les originaux restent à retrouver. Aucun G0–G4 accepté ni case de checklist cochée par ce checkpoint.

## Prochaine action

**Ne pas recréer les quatre fichiers de chantier proposés par Mission 002 : ils existent sur cette branche.** M29/A0 récupère le registre enrichi et les rapports depuis la session Codex, compare les 630 IDs aux affectations canoniques et enrichit les documents sans écraser leurs preuves. Pièce introuvable : blocage précis, pas fichier inventé.

M11 complète le dossier des sources/pilote et les divergences ; M12 rapproche les libellés exacts et complète les 141 fiches ; M13 complète navigation/autorités/contrats ; M15/M26 complètent corpus et oracles. Préparer les décisions G0/G1 et sous-lots, sans implémenter I/A/B ou accepter les gates automatiquement. Les propositions DWG/IA/MCP/extensions et placement Studio restent proposées. Continuer les qualifications indépendantes.

## Tests et preuves

Exécuter les seuls contrôles documentaires autorisés : python3 docs/ai-team/check_missions.py --check ; node scripts/check-continuity.mjs. Vérifier les artefacts au SHA exact. Les succès Fadi/IFC historiques, la CI main et les 630 affectations ne valident pas les parcours Studio. Aucun test API/E2E mutateur avant garde/cible jetable et autorisation.

## Risques et blocages

Pièces originales non versées ; 141 fiches non démontrées individuellement complètes ; G0–G3/DEC non ratifiés ; autorités/profils/publication à stabiliser ; #142 recouvre navigation. M002-D01/D02/D06/D07 consignent les décisions demandées. Un seul propriétaire des fichiers communs ; conserver Atelier, normes/fonctions industrielles et 21 étapes.

## Arrêt sûr

Mettre à jour STATUS/HANDOFF ensemble avec IDs réellement traités, preuve, version, blocage et prochaine action. Aucun identifiant abandonné, aucune option effacée ; un compte rendu de préparation ne vaut pas acceptation métier. Ne pas attendre une décision indépendante pour poursuivre une documentation autorisée.
