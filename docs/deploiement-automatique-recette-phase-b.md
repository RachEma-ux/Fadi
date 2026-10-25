# Recette de la phase B — échec simulé et retour arrière

25 octobre 2026 · session cloud · **Statut : procédure rédigée ; à jouer sur le VPS par la session VPS ou l'administrateur, avant d'activer `fadi-prod-auto.timer`. Aucune de ces étapes n'a été exécutée sur le serveur.**

Référence : [déploiement automatique](deploiement-automatique.md), phase B. Le script `deploy/prod/fadi-prod-auto` ne
pilote que la production (projet Compose `app`) ; la recette « en préproduction » rejoue donc la **même séquence**
(sauvegarde vérifiée → nouvelle image → redémarrage de l'application seule → sondes → échec → retour à l'image
précédente → base intacte) avec les commandes de la préproduction, sur sa base synthétique, sans jamais toucher la
production. Elle s'ajoute aux tests à doubles, qui couvrent le script lui-même.

## Recette 1 — tests à doubles, sur le VPS (aucun effet)

Sur le commit relu, avec un compte **non root** (le script ignore les doubles sous root) ; nécessite bash, git,
python3 et flock, ni réseau vers la production ni Docker :

```
sudo -u ubuntu git clone --quiet https://github.com/RachEma-ux/Fadi.git /tmp/fadi-recette-b
sudo -u ubuntu git -C /tmp/fadi-recette-b -c advice.detachedHead=false checkout --quiet <commit>
sudo -u ubuntu bash /tmp/fadi-recette-b/deploy/prod/tests/run.sh
```

Attendu : `fadi-prod-auto : N réussi(s), 0 échec(s)`. Les scénarios couvrent notamment l'échec simulé de chacune des
quatre sondes (`/health`, accueil, `/projects`, `/version`) : retour à `fadi-prod-app:retour`, copie rendue au commit
précédent, nouvelles sondes, base jamais restaurée (seul `pg_restore --list` lit le dump), message nommant la
sauvegarde et l'accord du maître d'ouvrage ; l'échec du retour (`echec-retour`, intervention requise) ; la sauvegarde
non vérifiée (aucun redémarrage).

## Recette 2 — échec simulé et retour arrière en préproduction (Docker réel, base synthétique)

Préalable : préproduction saine (`fadi-preprod status`, `fadi-preprod smoke`). Notations :
`C1` = commit en ligne (`python3 -c 'import json;print(json.load(open("/opt/fadi-preprod/etat.json"))["en_ligne"])'`),
`C0` = commit précédent dont l'image est encore présente (`docker image ls fadi-preprod-app` : `fadi-preprod nettoyer`
garde le commit en ligne et le précédent). Toutes les commandes en root (rôle administrateur de `fadi-preprod`).

1. **Geler le déploiement automatique** : `systemctl stop fadi-preprod-auto.timer`, puis attendre la fin d'un passage
   en cours : `flock /opt/fadi-preprod/.auto.verrou true`.
2. **Relevé initial** :
   ```
   docker inspect -f '{{.Id}} {{.State.StartedAt}}' fadi-preprod-db-1 | tee /root/recette-b-db-avant.txt
   curl -s http://127.0.0.1:3101/version          # commit C1
   ```
3. **Sauvegarde vérifiée** (équivalent de l'étape 1) : `fadi-preprod backup` puis `fadi-preprod restore-check`
   (restauration dans une base de **contrôle**, jamais dans `fadi`) ; noter le nom du dump (`fadi-preprod show`).
4. **Échec simulé d'une sonde** après le redémarrage de l'application : `docker stop fadi-preprod-app-1`, puis
   `fadi-preprod smoke` → **doit échouer** (code ≠ 0, `/health` injoignable). Noter l'heure.
5. **Retour arrière à l'image précédente**, sans migration ni restauration (c'est ce que font
   `fadi-preprod-auto` et `fadi-prod-auto`) :
   ```
   fadi-preprod sync C0 && fadi-preprod up && fadi-preprod smoke
   curl -s http://127.0.0.1:3101/version          # attendu : C0
   ```
   Mesurer la durée entre l'heure de l'étape 4 et le smoke conforme.
6. **Base intacte** : `docker inspect -f '{{.Id}} {{.State.StartedAt}}' fadi-preprod-db-1 | diff - /root/recette-b-db-avant.txt`
   → aucune différence (conteneur `db` ni recréé ni redémarré) ; aucune commande de restauration n'a été lancée.
7. **Remise en état** : `fadi-preprod sync C1 && fadi-preprod up && fadi-preprod smoke`, `/version` = `C1` ; reprendre
   le déploiement automatique : `systemctl start fadi-preprod-auto.timer`. L'état `etat.json` de `fadi-preprod-auto`
   n'a pas été modifié (dernier essai et commit en ligne = `C1`), ce que `fadi-prod-auto` exige.
8. **Consigner** (commit relu, heures, durées, sorties des étapes 4 à 7) dans le suivi de la phase B.

Preuve déjà disponible : le 25 octobre 2026, chaque commit de `main` échouait au jeu court en préproduction et
`fadi-preprod-auto` est revenu automatiquement à l'image de `f2cc31b` (voir « Durée d'un déploiement ») : retour
arrière automatique observé en exploitation, base de préproduction conservée.

## Recette 3 — premier passage de production à blanc

Après l'installation (minuteur non activé) et avant toute Release nouvelle : `systemctl start fadi-prod-auto.service`,
puis `cat /mnt/data/fadi/deployments/etat.json` et `journalctl -u fadi-prod-auto.service -n 50`. Attendu : aucune
action (`aucune` Release, ou dernière Release déjà servie) ; aucun dump, aucune image, aucun redémarrage. Activer
ensuite le minuteur ; la première mise en production reste la Release du maître d'ouvrage.

## En cas d'échec réel en production

L'état (`resultat` : `echec` ou `echec-retour`), le journal (`/mnt/data/fadi/deployments/<run>-auto/journal.log`) et la
notification nomment le dump vérifié (`avant-deploiement.dump`, empreinte dans `empreintes.sha256`) et l'instantané
restic. **La base n'est jamais restaurée automatiquement** : une restauration se décide avec le maître d'ouvrage, se
répète d'abord sur une base de contrôle (`scripts/verify-restore.sh`), et suit `docs/deploiement.md`.
