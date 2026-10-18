# Reprise — Lead Claude Code (développement Fadi)

Mis à jour le 18/10/2026 (UTC). Ce fichier remplace, pour le code, les checkpoints Codex. Codex garde la documentation et
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

1. Vérifier que #193 est fusionnée ; sinon, mener sa CI au vert puis la fusionner.
2. Pistes suivantes, dans l'ordre recommandé :
   - outils de dessin supplémentaires (arc, cercle, polyligne, décalage), pour que l'import DXF reprenne aussi ARC et CIRCLE ;
   - cotation angulaire ;
   - Studio hors ligne (le service worker et Dexie existent déjà pour le Parcours) ;
   - préférences de notification.
3. DB-3 reste fermé. Il faut une demande explicite du propriétaire pour l'ouvrir.
4. La recette du profil A6 (`scripts/validation/studio-v1-functional.py`) demande Docker. Elle n'a pas été rejouée depuis l'intégration du schéma dans `init.sql` ; à rejouer sur un hôte qui a Docker.
