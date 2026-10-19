# Reprise — Lead Claude Code (développement Fadi)

Mis à jour le 19/10/2026 (UTC). Ce fichier remplace, pour le code, les checkpoints Codex. Codex garde la documentation et
le registre.

## Mandat

- Le propriétaire a délégué une **autorité complète** au lead Claude Code (#166, 18/10/2026) : modifier ou supprimer
  l'existant, fusionner une PR dont la CI est verte, retenir l'option « Recommandé » sans lui poser la question, augmenter
  l'effectif.
- Restent hors mandat sans demande explicite : le déploiement en production, les opérations sur une base existante et
  DB-3 (enrôlement d'une autorité de test).
- Décisions D-0 et D-A : Studio V1 (#181) est le **seul** Studio, et son schéma vit dans `apps/api/src/db/init.sql`
  (idempotent, additif).
- Statu quo par défaut : URL d'API en anglais, droit d'écriture `modify`, `ON DELETE RESTRICT` sur l'auteur des
  révisions.

## Livré sur `main`

| PR | Contenu |
|---|---|
| #184 | CI de `main` remise au vert sans affaiblir la garde DB. Les 12 suites API sont déclarées non exécutées (`scripts/check-api-tests-db3.mjs`) jusqu'à DB-3. Schéma Studio dans `init.sql`. |
| #185 | Un seul Studio : `StudioShell` (accueil, projet, étude, variante, historique en lecture seule, adresse inconnue), API étude / variantes / révisions, Planche 2D (cotes associatives, calques, annuler / rétablir, règle d'or). |
| #186 | Export SVG / DXF R12, création idempotente (`requestId`), zoom et défilement, sélection par cadre, glisser, Tool Manager et palette Ctrl+K. |
| #189 | Job e2e réparti en 5 tranches parallèles, d'environ 38 min à environ 9 min. |
| #190 | Extrusion déclarée par l'utilisateur, vue 3D (three.js, chargée à la demande), export IFC4X3_ADD2 validé par IfcOpenShell en CI. |
| #191 | Feuille de présentation (ISO, échelle, cartouche sans donnée inventée, impression / SVG / PDF), comparaison de révisions et de variantes, commentaires de variante. |
| #192 | Recettes intermittentes corrigées dans le produit : liste d'outils sur téléphone, commentaire d'étape publié pendant le premier chargement. |
| #193 | Import DXF (unités explicites, entités non prises listées, envoi par lots chaînés), liens étude ↔ étapes du Parcours, notifications de commentaires Studio. |
| #194 | Recette Docker du profil Studio V1 (`studio-v1-functional.py`) en CI sur les PR Studio et sur `main`. |
| #195 | Vagues 1–2 et découpage S0 du modèle Studio (noyau, objets, commandes, registre, exporteurs). |
| #196 | Vague 3 + E2b : transformations, accrochages, annotations, hors ligne (brouillons par utilisateur, comparer-puis-écrire entre onglets), accessibilité clavier, paquets diffusés dans Documents. |
| #197 | Vague 4 : murs et ouvertures A.4 (REC-A-03 : 3,600 / 0,420 / 3,180 m³), rapport de fidélité des exports E.6-03, index spatial C.1. |
| #198 | Vague 5 : exigences BIM E.1, visualisation E.5, approbation E.4, tâches de fond D.1–D.3, frontières X.4, sauvegarde et restauration Studio R.1 / R.2 (archives signées). |
| #199 | Vague 6 : couches du modèle sans exception et contrôle des cycles, propriétés déclarées en IFC, recalage des comptes dans les archives signées, service worker par build. |
| #200 | Vague 7 : projections versionnées et invalidation minimale C.2, ajustements de métré persistés E.3-05. |
| #201 | Vague 8 : contrat de commandes A.5, catalogue B.1/B.2 et chargement B.3/D.3 des outils, observations E.2, production documentaire E.3. |
| #204 | Vague 9 : domaines I.4 (contrat d'URL proposé), invariants et permissions X.2 (bogue INV-013 corrigé), matrice d'échanges E.6, corpus S1–S7 X.1, simulation de migration MIG en lecture seule. |
| #171, #174–#177, #142, #143, #152 | Correctifs Atelier et Planche, frontières Studio ↔ Atelier, garde-fous d'architecture, gabarit pleine largeur. Remis à jour et fusionnés par l'équipe 6. |

PR fermées :
- #178–#182 : la pile Studio concurrente, portée dans #185 ;
- #150, #154, #168 : obsolètes ou redondantes.

## Organisation constatée

Il n'y a pas d'outil « Agent Teams ». Le lead lance des sous-agents dans des worktrees isolés, avec des fichiers réservés
par lot, puis il intègre leurs travaux sur `claude/fadi-code-lead-transfer-4vzu3c`. Chaque lot passe par :

1. une recette locale ;
2. une revue indépendante (équipe 4) ;
3. les corrections ;
4. une CI verte ;
5. la fusion.

## Recette locale (sans Docker)

```bash
apt-get install -y postgresql-16-postgis-3          # après apt-get update
# cluster jetable : initdb en tant que postgres dans /srv/pg-recette, port 55432, rôle fadi/recette
DATABASE_URL=postgresql://fadi:recette@127.0.0.1:55432/<base_neuve> npm run db:migrate
npm run build
PORT=3010 WEB_ORIGIN=http://localhost:3010 WEB_DIST=apps/web/dist AUTH_RATE_LIMIT=500 API_RATE_LIMIT=5000 \
  DATABASE_URL=… node apps/api/dist/server.js &
BASE_URL=http://localhost:3010 node apps/web/e2e/studio-persistance.mjs     # + PHASE=reopen STUDIO_STATE=…
BASE_URL=http://localhost:3010 node apps/web/e2e/studio-navigation.mjs
```

Pour éviter les collisions entre agents, chacun prend sa propre base et son propre port. On n'arrête jamais un processus
par motif (`pkill -f`), seulement par son PID.

## Prochaines actions

1. Les lots de code non bloqués du registre sont traités (vagues 1 à 9, `main` cf09271). La suite dépend de décisions du
   maître d'ouvrage, soumises dans #166 :
   - I.4-03 (contrat d'URL), domaine des neuf commandes « à définir », DWG pour Studio, licence du corpus ;
   - acceptation des exigences pendant un verrou ou sur un projet de référence (« à arbitrer », PERMISSIONS.md) ;
   - DEC-03, MIG-COEX-02 et MIG-COEX-05 avant toute bascule de migration ; DEC-06 (chargement), DEC-13 (seuils) ;
   - réouverture d'une observation clôturée, retrait d'un lien de domaine, publication d'un dossier par E.4.
2. Jalons J0 à J8 et statuts du registre : déclarés seulement sur acceptation explicite (Codex tient le registre).
3. Restent connus :
   - les anciennes clés de GlobalId IFC (`project`, `pset|object|…`) peuvent entrer en collision avec un identifiant d'objet. Les corriger changerait tous les GlobalId déjà exportés.
4. Hors mandat, sur demande explicite du propriétaire :
   - DB-3 ;
   - déploiement en production. `ARCHIVE_SIGNING_KEY` doit alors venir d'un gestionnaire de secrets ; à défaut, la clé propre à la base est lisible par quiconque lit la base ;
   - F.2 / F.3, IA et MCP (DEC-15) ;
   - protection de branche, à faire par l'administrateur du dépôt.
5. Recette locale :
   - un worktree sous `.claude/` exige `WEB_DIST` hors de ce dossier : `send` refuse les chemins qui traversent un dossier caché ;
   - une base neuve demande `CREATE EXTENSION postgis` par le superutilisateur ;
   - la recette de restauration demande `DATABASE_URL_A`, `DATABASE_URL_B`, `RESTORE_PORT` et `WEB_DIST` ;
   - vérifier qu'aucune ancienne API n'occupe le port avant de lancer les recettes.
