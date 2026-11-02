# Déploiement automatique — préproduction puis production

20 octobre 2026 · Roch · **Statut : plan validé par le maître d'ouvrage ; phase A en service (`fadi-preprod-auto`), durée revue le 25 octobre 2026 (section « Durée d'un déploiement ») ; phase B : scripts et tests livrés le 25 octobre 2026 (`fadi-prod-auto`), installation et première mise en production en attente de l'administrateur / du maître d'ouvrage**

Le VPS **tire** les versions validées depuis GitHub : `main` vérifiée par la CI part automatiquement en préproduction ; la production ne reçoit que la version validée en préproduction, après une autorisation explicite du maître d'ouvrage. GitHub ne détient aucune clé du serveur.

```
Concept → développement (Claude / Codex) → branche + PR (revue, CI) → main
   → [automatique] preprod.fadimmo.com → validation du maître d'ouvrage
   → [Release GitHub] www.fadimmo.com
```

## Décisions (20 octobre 2026)

| Décision | Statut |
| --- | --- |
| Modèle « le VPS tire » : un service sur le VPS interroge l'API publique de GitHub, aucun secret dans GitHub, aucune connexion entrante depuis GitHub | Décidé |
| Notification des déploiements par e-mail via Healthchecks (déjà utilisé pour les sauvegardes) | Décidé (canal par défaut, modifiable) |
| Autorisation de production = **Release GitHub** publiée par le maître d'ouvrage sur le commit validé en préproduction | Décidé |
| La production n'entre pas dans la délégation de la session VPS : la Release est le geste du maître d'ouvrage | Décidé |

Options écartées : push SSH depuis GitHub Actions (clé dans les secrets GitHub et port entrant) ; runner GitHub auto-hébergé sur le VPS (exécute le code du dépôt avec des droits Docker, équivalents à root).

## Ce qui existe déjà

- **CI** (`.github/workflows/ci.yml`) : `validate`, tranches `e2e`, et `image`, qui construit l'image de production et la sonde : c'est le feu vert du déploiement.
- **`fadi-preprod`** (`deploy/preprod/`, installé sur le VPS) : `sync`, `build`, `migrate`, `up`, `smoke`, `e2e`, `backup`, `restore-check`, avec garde d'isolation et rôles administrateur / opérateur. Testé par `consolidation-validation.yml`.
- **Sauvegarde chiffrée hors VPS** (restic, service `fadi-backup-offsite` surveillé par Healthchecks).
- **`fadi-prod-auto`** (`deploy/prod/`, phase B, **non installé**) : script, unités systemd, installateur à empreintes et tests à doubles (`deploy/prod/tests/run.sh`, joués par `consolidation-validation.yml` avec shellcheck).
- **Plan d'activation** : `docs/exploitation-fadi-cloud.md`, portes 4 à 6 (compte limité, livraison immuable, environnement protégé).
- À ne pas confondre : Builder Deploy (démo temporaire par tunnel, environnement `recette`) et `fadifront.yml` (site statique Infomaniak) ne sont pas des déploiements permanents.

## Phase A — préproduction automatique

1. **Service `fadi-preprod-auto`** (script root, minuteur systemd toutes les 3 minutes depuis le 25 octobre 2026, 5 auparavant, installé par l'administrateur) :
   - lit le dernier commit de `main` par l'API publique de GitHub ;
   - exige que les contrôles `validate`, `e2e` et `image` soient verts sur ce commit, et que le commit appartienne à l'historique de `main` ;
   - s'il est nouveau : `fadi-preprod sync <sha>`, `build`, `migrate`, `up`, `smoke`, puis un jeu court de scénarios (`sandbox-module`, `parcours-scenario`) — la CI a déjà joué tous les scénarios ;
   - écrit l'état (`/opt/fadi-preprod/etat.json` : commit, heure, étape, résultat), lisible par `fadi-preprod show` et `status` ;
   - un verrou empêche deux déploiements simultanés ; le budget d'appels de l'API publique (60 par heure) est respecté.
2. **Échec** : la version précédente reste en ligne. Une construction ratée ne remplace rien ; un démarrage raté revient à l'image précédente (images étiquetées par commit, conservées). La base de préproduction ne contient que des données synthétiques et peut être réinitialisée.
3. **Notification** : succès et échec envoyés au maître d'ouvrage (Healthchecks, e-mail).
4. **Route `/version`** dans l'application : commit et date de construction, pour vérifier d'un coup d'œil ce qui tourne (petit lot de code).

## Durée d'un déploiement (analyse et correctifs du 25 octobre 2026)

Mesures sur les pushes de `main` du 25 octobre (API GitHub) ; la durée côté VPS n'est pas observable depuis une session
cloud et reste à mesurer sur place (`fadi-preprod show <run>-auto journal.log`, horodatage des étapes dans `etat.json`).

| Poste | Avant | Cause | Correctif |
| --- | --- | --- | --- |
| Attente de la CI avant son premier job | jusqu'à 13 min (run 40187030690 : créé 10:59:58, premier job 11:13:07) | groupe de concurrence par branche : sur `main`, chaque exécution attendait la fin de la précédente ; GitHub annulait de plus l'exécution en attente dès un troisième push | `ci.yml` : groupe par commit sur `main` (exécutions parallèles, aucune annulée) |
| CI elle-même | 15,7 min (tranche `e2e (complements)`, la plus longue) | 15 recettes ajoutées à la tranche prévue pour `atelier-complements` seule | tranche `organisations` (comptes, collaboration, organisations-participation, simulation de migration) ; reste ≈ 13,5 min, borné par `validate` (tests API, 8 min) |
| Détection du feu vert | 0 à 5,5 min (minuteur de 5 min) | budget de 60 appels / h de l'API publique (un 304 compte aussi sans jeton) | minuteur de 3 min ; pendant l'attente de la CI, l'exécution trouvée est retenue (2 appels par passage au lieu de 3) ; un refus (CI rouge) n'est revu que toutes les 15 min |
| Construction sur le VPS | deux `npm run build` en parallèle (≈ 1 min 30 chacun sur 4 cœurs, plus sur le VPS) + une couche `chown -R /work` qui recopiait node_modules : ≈ 0,9 Go propres à chaque commit pour l'image de recette | `recette.Dockerfile` refaisait le build de l'image applicative et changeait le propriétaire après coup | la recette copie `apps/api/dist` et `apps/web/dist` de l'image applicative du même commit (`APP_IMAGE`, vérifiée par la garde), construite d'abord par Compose (`additional_contexts: app: service:app`, seul contexte admis par la garde) ; tout est installé directement en `pwuser`. Mesuré le 25 octobre (session cloud, Docker 29, Compose 5.6) : image de recette construite en ≈ 1 min hors cache npm, ≈ 0,2 Go propres à chaque commit ; `pwuser` propriétaire, builds présents, Chromium et `psql` opérationnels |
| Disque du VPS | deux images par commit, jamais supprimées | aucune purge | `fadi-preprod nettoyer` après chaque succès : seuls le commit en ligne et le précédent (retour arrière) restent ; dépôts `fadi-preprod-*` seulement, ni production ni cache de construction |
| **Blocage : aucun déploiement réussi depuis la PR #287 (7 h 05 UTC)** | chaque commit de `main` échouait au jeu court, puis revenait à `f2cc31b` | depuis `c6818eb` (24 octobre), `parcours-scenario` lit le lien de vérification d'adresse dans les courriels ; la préproduction n'envoie jamais aux domaines réservés des comptes de recette et n'a pas de Mailpit | jeu court `sandbox-module accueils-design studio-exemple-p118`, sans lecture de courriel (contrôlé par test) ; les recettes qui lisent les courriels (31) sont retirées de la liste complète de la préproduction, repérées dans leurs sources par `tests/run.sh` |
| Liste e2e de la préproduction | `geodata`, `sandbox-axes`, `sandbox-reperes`, `sandbox-origine`, `sandbox-reperes-lies` absents : `tests/run.sh` échouait | contrôle lancé seulement quand `deploy/preprod/**` change | liste réalignée (`geodata` exclu : base jetable, comme `comptes-*`) ; `consolidation-validation.yml` tourne aussi quand `ci.yml` ou `apps/web/e2e/` change |

### Mise en service (administrateur, une fois)

Les correctifs de `ci.yml` s'appliquent dès la fusion. Ceux du VPS demandent la réinstallation des scripts depuis le
commit fusionné, relu, empreinte vérifiée, comme à l'installation :

```
install -o root -g root -m 0755 deploy/preprod/fadi-preprod /usr/local/sbin/fadi-preprod
install -o root -g root -m 0755 deploy/preprod/fadi-preprod-auto /usr/local/sbin/fadi-preprod-auto
install -o root -g root -m 0644 deploy/preprod/systemd/fadi-preprod-auto.timer /etc/systemd/system/
systemctl daemon-reload && systemctl restart fadi-preprod-auto.timer
fadi-preprod nettoyer "$(cat /opt/fadi-preprod/approved-commit)"   # première purge des images accumulées
```

Le premier déploiement suivant reconstruit une fois la couche `npm ci` de l'image de recette (propriétaire `pwuser`) ;
les suivants la reprennent du cache. Règle sudoers proposée : `fadi-preprod nettoyer` ajouté aux commandes de l'opérateur.

## Phase B — production après autorisation

1. **Autorisation** : le maître d'ouvrage publie une **Release GitHub** (possible depuis l'application Android) sur le commit validé en préproduction. Une règle de protection des étiquettes réserve leur création à son compte.
2. **Service `fadi-prod-auto`** : ne déploie que si le commit de la Release est **exactement** le dernier commit passé en préproduction sans échec. Ordre :
   1. sauvegarde de la base (locale et restic hors VPS), vérifiée ;
   2. mise à jour de la copie du dépôt de production (`/mnt/data/fadi/app`), jamais à la main ;
   3. nouvelle image, puis redémarrage du seul service `app` — ni la base ni Caddy ne sont recréés ; la surcharge du proxy (`deploy/preprod/proxy/proxy-preprod.override.yml`) est toujours incluse ;
   4. sondes : `https://www.fadimmo.com/health` (`"db":"ok"`), page d'accueil, `/projects` en 401.
3. **Retour arrière** : si une sonde échoue, l'application revient automatiquement à l'image précédente. La base n'est restaurée qu'avec l'accord du maître d'ouvrage, depuis la sauvegarde prise à l'étape 1.
4. **Migrations** : la production applique le schéma au démarrage (`MIGRATE_ON_START=1` à l'origine, aujourd'hui le service `migrate`, voir ci-dessous) ; c'est pourquoi la sauvegarde vérifiée précède toujours le redémarrage.

### État au 25 octobre 2026 : scripts et tests livrés, installation et première mise en production en attente

| Élément | Statut | Preuve |
| --- | --- | --- |
| `deploy/prod/fadi-prod-auto` (script root) | Implémenté, vérifié par tests à doubles | `bash deploy/prod/tests/run.sh` : 121 contrôles, 0 échec (session cloud, 25 octobre 2026) ; shellcheck sans avertissement |
| `deploy/prod/systemd/fadi-prod-auto.service` / `.timer` | Implémenté | contrôlés par les mêmes tests ; `systemd-analyze calendar '*:0/10'` |
| `deploy/prod/installation/installer-prod-auto.sh` (installateur à empreintes) | Implémenté | les tests vérifient que ses SHA-256 sont celles des fichiers du dépôt |
| Branchement CI | Implémenté | `consolidation-validation.yml`, job `deployment-sources` (déclenché par `deploy/**`, `docker-compose.yml`, `ops/systemd/**`) |
| Recette d'un échec simulé et du retour arrière en préproduction, sur le VPS | **En attente** (session VPS / administrateur) | procédure : [recette de la phase B](deploiement-automatique-recette-phase-b.md) |
| Installation root, adresse Healthchecks de production, règle de protection des étiquettes | **En attente** (administrateur / maître d'ouvrage) | procédure ci-dessous |
| Première mise en production autorisée (Release) | **En attente** (maître d'ouvrage) | — |

La session cloud n'a aucun accès au VPS (et `preprod.fadimmo.com` lui répond 401) : rien de ce qui précède n'a été
exécuté sur le serveur ; aucun lot n'est déclaré accepté.

### Choix de réalisation (session cloud, délégation du 25 octobre 2026)

- **Emplacement** : `deploy/prod/`, et non `deploy/preprod/`. La garde de `fadi-preprod` ne pilote que le projet Compose
  `fadi-preprod` et refuse par construction tout ce qui touche la production ; `fadi-prod-auto` pilote le projet
  `app` de `/mnt/data/fadi/app` et n'appelle jamais `fadi-preprod`. Il **lit** seulement l'état de la préproduction.
- **« Dernier commit passé en préproduction sans échec »**, lu dans ce qui existe vraiment sur le VPS :
  `/opt/fadi-preprod/etat.json` (écrit par `fadi-preprod-auto`) et `/opt/fadi-preprod/approved-commit` (écrit par
  `fadi-preprod sync`). Exigé : `dernier_essai` = `en_ligne` = commit de la Release, résultat qui n'est ni `echec`,
  ni `echec-retour`, ni `en-cours`, et commit approuvé = commit de la Release. Si `main` a avancé et que la
  préproduction a essayé un commit plus récent (réussi ou non), la Release est refusée : il faut la publier sur le
  commit que la préproduction sert. Un refus de ce type est revu à chaque passage sans appel à l'API (la
  préproduction peut être en train de passer ce commit) et notifié une fois.
- **Release** : `releases/latest` (dernière Release publiée, ni brouillon ni prérelease, revérifiés), étiquette
  résolue par `git/ref/tags/<étiquette>` (étiquette annotée suivie) ; puis comparaison `compare/<sha>...main`
  (`identical` ou `ahead`) et contrôle local (`git merge-base --is-ancestor` après `git fetch` de `main`).
- **Sauvegarde vérifiée**, par les mécanismes établis du dépôt : dump local `pg_dump -Fc` (service `db` de
  `docker-compose.yml`) dans le dossier du déploiement, relu par `pg_restore --list` (service `backup`), empreinte
  SHA-256 ; puis `systemctl start fadi-backup-offsite.service` (`scripts/backup-offsite-restic.sh` : dump, `restic
  backup`, `restic check`, `docs/sauvegarde-externe.md`), dont l'exécution réelle est relue dans systemd
  (`ConditionResult=yes`, `Result=success`, `ExecMainStatus=0`, nouvelle fin d'exécution). Le nom de l'unité est
  réglable (`UNITE_SAUVEGARDE` dans `/etc/fadi-prod-auto/config`, root 0600, lu sans être exécuté). Sauvegarde non
  vérifiée → rien n'est modifié ni redémarré.
- **Copie du dépôt** : `git fetch` puis `git reset --keep <sha>` par le **propriétaire** de `/mnt/data/fadi/app/.git`
  (`runuser`, jamais root dans le dépôt d'un autre compte), seulement si la copie est propre et que le commit est une
  avance rapide ; `.env.deploy` (ignoré par git) n'est jamais touché.
- **Image** : `fadi-prod-app:<12 caractères du commit>`, construite depuis `git archive` du commit (aucun fichier non
  suivi), avec `FADI_COMMIT` / `FADI_BUILD_DATE` (route `/version`) ; l'image en ligne est étiquetée
  `fadi-prod-app:retour`. Après succès, `app-app:latest` désigne la nouvelle image (commandes Compose manuelles) et
  les anciennes `fadi-prod-app:*` sont retirées (en ligne, précédente et retour gardées).
- **`MIGRATE_ON_START=1`** : depuis D-7, `docker-compose.yml` fixe `MIGRATE_ON_START=0` pour `app` (connectée en
  `fadi_app`, sans droit DDL : forcer `1` ferait échouer le démarrage) et applique le schéma par le service à usage
  unique `migrate` (`MIGRATE_ONLY=1`), dont `app` dépend. `fadi-prod-auto` joue donc ce service avec la nouvelle image
  (`docker compose run --rm --no-deps -T migrate`, journal « Migration terminée » exigé) juste avant de redémarrer
  `app` ; il ne force jamais `MIGRATE_ON_START` (contrôlé par test). Un échec de migration n'entraîne aucun
  redémarrage ; le message rappelle que le schéma a pu changer et nomme la sauvegarde.
- **Redémarrage** : `docker compose -p app … -f docker-compose.yml -f <surcharge du proxy prise au commit>
  -f <image> up -d --no-deps --no-build --pull never --wait app` — ni `db`, ni `proxy`, ni `backup` ne sont recréés ;
  leurs identifiants et heures de démarrage sont comparés avant / après (un écart déclenche le retour arrière).
- **Sondes** (12 essais, 5 s d'écart) : `/health` (`"status":"ok"`, `"db":"ok"`), `/` (`<div id="root"`),
  `/projects` en 401, `/version` = commit. Elles sont aussi exigées **avant** le déploiement, sur la version en
  ligne, et `/version` doit alors être le commit de la copie : sinon refus, rien n'est modifié.
- **Retour arrière** : copie rendue au commit précédent, `up` de `fadi-prod-app:retour`, nouvelles sondes (dont
  `/version` = commit précédent). Résultat `echec` (version précédente rétablie) ou `echec-retour` (intervention
  requise). La base n'est **jamais** restaurée : le message, l'état et la notification nomment le dump de l'étape 1
  (chemin et empreinte) et l'instantané restic, et rappellent que la restauration exige l'accord du maître d'ouvrage.
- **Sondage et déploiement séparés** : l'état du dernier passage auprès de GitHub (Release absente, brouillon ou
  prérelease, erreur ou budget de l'API) est consigné dans `sondage` et `sondage_message`. Il ne remplace jamais le
  résultat du dernier déploiement (`release_id`, `etape`, `resultat`) : une panne passagère de l'API ne peut pas effacer
  l'échec d'une Release ni autoriser un nouvel essai sans `fadi-prod-auto relancer` (contrôlé par test).
- **État, verrou, journal** : `/mnt/data/fadi/deployments/etat.json` (0600) ; verrou
  `/mnt/data/fadi/deployments/deploiement.lock`, **le même** que celui des déploiements contrôlés
  (`scripts/deploy-*-controlled.sh`) ; journal et dump dans `/mnt/data/fadi/deployments/<run>-auto/` (0700). Un
  passage interrompu (délai systemd de 4 h, redémarrage) est repris au passage suivant : retour à l'image précédente si
  `app` avait été redémarrée, sinon copie rendue à son commit. Une Release en échec n'est pas rejouée :
  `fadi-prod-auto relancer` (administrateur).
- **Budget de l'API publique**, partagé avec `fadi-preprod-auto` (même adresse, 60 appels / h) : minuteur de
  10 minutes, 1 appel par passage sans nouveauté (6 / h), 3 ou 4 pour une Release nouvelle ; arrêt si la réserve
  annoncée tombe sous 20 (laissés à la préproduction).
- **Notification** : Healthchecks, contrôle **distinct** de celui de la préproduction
  (`/etc/fadi-prod-auto/healthchecks-url`, root 0600, transmis à curl par l'entrée standard) ; succès → ping,
  échec ou refus → `/fail`.

### Installation (administrateur, une fois, après fusion)

Prérequis : `fadi-preprod-auto` en service, `fadi-backup-offsite.service` installé et vérifié
(`docs/sauvegarde-externe.md`), copie `/mnt/data/fadi/app` propre et alignée sur la version servie
(`curl -s https://www.fadimmo.com/version` = `git -C /mnt/data/fadi/app rev-parse HEAD`).

1. Relire, sur le commit fusionné de `main`, `deploy/prod/fadi-prod-auto`, ses unités et
   `deploy/prod/installation/installer-prod-auto.sh` ; recalculer les empreintes et les comparer à celles inscrites
   dans l'installateur :
   ```
   git clone --quiet https://github.com/RachEma-ux/Fadi.git /root/fadi-relecture
   git -C /root/fadi-relecture -c advice.detachedHead=false checkout --quiet <commit>
   sha256sum /root/fadi-relecture/deploy/prod/fadi-prod-auto /root/fadi-relecture/deploy/prod/systemd/fadi-prod-auto.*
   grep -A4 '^FICHIERS=' /root/fadi-relecture/deploy/prod/installation/installer-prod-auto.sh
   ```
2. Installer, minuteur **non activé** (l'installateur vérifie que le commit est dans `main`, télécharge les fichiers
   figés sur ce commit, refuse toute empreinte différente, garde les versions précédentes en `*.avant-<commit>`) :
   ```
   sudo bash /root/fadi-relecture/deploy/prod/installation/installer-prod-auto.sh <commit>
   ```
3. Adresse Healthchecks de la production (nouveau contrôle, e-mail du maître d'ouvrage) :
   `sudo install -o root -g root -m 0600 /dev/stdin /etc/fadi-prod-auto/healthchecks-url` (coller l'adresse, Ctrl-D).
4. **Règle de protection des étiquettes** (maître d'ouvrage, GitHub → Settings → Rules → Rulesets → New tag ruleset) :
   cible « toutes les étiquettes », restreindre création, mise à jour et suppression, liste de contournement réduite
   au compte du maître d'ouvrage. Sans elle, toute personne ayant le droit d'écriture pourrait publier une Release.
5. Passage manuel à blanc, sans Release nouvelle : `sudo systemctl start fadi-prod-auto.service`, puis
   `cat /mnt/data/fadi/deployments/etat.json` (attendu : `sondage` à `aucune`, ou la dernière Release « déjà traitée » / « déjà
   servie »), `journalctl -u fadi-prod-auto.service -n 50`.
6. Jouer la [recette de la phase B](deploiement-automatique-recette-phase-b.md) (tests à doubles sur le VPS, échec
   simulé et retour arrière en préproduction), puis activer le minuteur : `sudo systemctl enable --now fadi-prod-auto.timer`.
7. Première mise en production : le maître d'ouvrage publie une Release sur le commit que sert la préproduction
   (`fadi-preprod status`), et suit l'état (`etat.json`) et la notification.

## Phase C — optionnelle

- États de déploiement visibles dans GitHub (environnements `preprod` et `production`), avec un jeton à droits restreints sur le VPS.
- Images publiées sur GHCR, pour que la production reçoive l'image de la préproduction au bit près.

## Sécurité

- Aucune clé root, aucun accès au socket Docker, aucun secret du serveur dans GitHub.
- Les scripts root sont installés depuis un commit relu, avec empreinte vérifiée, jamais depuis une copie modifiable par un compte non root.
- Le service ne déploie qu'un commit de `main` à CI verte ; une branche, une PR ou une étiquette quelconque ne déclenche rien.
- Chaque déploiement est journalisé (commit, heure, étapes, résultat).

## Répartition

| Tâche | Par qui |
| --- | --- |
| Scripts `fadi-preprod-auto` et `fadi-prod-auto`, leurs tests, la route `/version`, la documentation | session cloud (PR, CI) |
| Revue de sécurité des scripts et vérification sur le VPS | session VPS |
| Installation root (scripts, minuteurs systemd), règle de protection des Releases, adresse Healthchecks | administrateur / maître d'ouvrage, une fois |

## Ordre des travaux

1. Phase A : route `/version`, puis `fadi-preprod-auto` et ses tests, puis installation et premier déploiement automatique observé.
2. Phase B : `fadi-prod-auto` (scripts et tests livrés le 25 octobre 2026), recette d'un échec simulé et du retour arrière en préproduction, règle de protection des Releases, puis première mise en production autorisée (en attente de l'administrateur et du maître d'ouvrage).
3. Phase C, si utile.
