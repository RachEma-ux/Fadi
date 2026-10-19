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

1. Vague 4 (branche locale `lead-vague4`, PR à ouvrir après #196) : murs et ouvertures (A.4, REC-A-03 vérifié :
   3,600 m³ brut, 0,420 déduit, 3,180 net), rapport de fidélité des exports (E.6-03), index spatial de la planche (C.1).
   Revue indépendante faite ; correctifs en cours (validation incrémentale de l'architecture, transformations des murs
   depuis l'interface, ouverture refusée sur mur masqué, sélection du mur du côté de son corps).
2. Restent connus : repli du service worker sur un cache périmé, ajustements de métré (E.3-05) non persistés.
3. DB-3 reste fermé ; exiger le job Studio dans la protection de branche demande l'administrateur du dépôt.
4. Recette locale dans un worktree sous `.claude/` : copier `apps/web/dist` hors de ce dossier pour `WEB_DIST`
   (`send` refuse les chemins qui traversent un dossier caché). Une base neuve demande `CREATE EXTENSION postgis` par
   le superutilisateur avant `db:migrate`.
