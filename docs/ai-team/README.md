# Équipe Codex — missions Fadi et Studio

**Point d'entrée : [CODEX-START-HERE.md](CODEX-START-HERE.md). Programme : [#156](https://github.com/RachEma-ux/Fadi/issues/156).**

Le [catalogue de 31 missions](MISSIONS.md) et [missions.json](missions.json) répartissent les réserves de l'audit A0 et les 630 tâches Studio sans modifier leur source. Le [registre de sources et permissions](SOURCES-AND-AUTHORIZATIONS.md) fixe les versions et limites. Ce dossier organise l'exécution, mais ne lance pas lui-même des agents.

## Navigation du programme

| Missions | Travail | Suivi |
|---|---|---|
| M00, M29, M30 | Coordination, checkpoints, jalons et clôture | #156 |
| M01, M02, M04, M09 | Cloud, cible des tests, CI et sécurité | #157 |
| M03 | Protection de main | #146 existante |
| M05, M06 | Contrats, documents et relais | #158 ; #153/PR #154 |
| M07 | Frontières et dépendances | #151/PR #152 existantes |
| M08 | Isolation native Fadi | #147/PR #148 existantes |
| M10 | Jalons production/sauvegarde Fadi | #149 existante |
| M11–M14 | Cadrage Studio, qualification, navigation, G0–G3 | #159 |
| M15–M21 | X, I, A et B | #160 |
| M22–M23 | C et D | #161 |
| M24, M26 | E et recette complète | #162 |
| M25 | Options F | #163 |
| M27–M28 | Migration, R et G4 | #164 |

## Contrôles

`python3 -m unittest discover -s docs/ai-team -p 'test_check_missions.py' -v`

`python3 docs/ai-team/check_missions.py --check`

`python3 docs/ai-team/check_missions.py --export /tmp/fadi-mission-map-nouveau`

Le workflow **Codex — couverture des missions** vérifie la source verrouillée, les 31 contrats et les 630 affectations. Son artefact contient JSON/CSV des identifiants, textes, lignes, propriétaires et un rapport. Il ne teste pas l'application et ne donne pas de verdict de conformité Studio.

Points de reprise : [ai-team](../workstreams/ai-team/HANDOFF.md) et [studio](../workstreams/studio/HANDOFF.md). Ne pas remplacer les journaux métier existants. Avant fusion, Codex doit explicitement lire la branche `docs/156-codex-missions-completes` ; ne pas supposer les fichiers présents sur main.
