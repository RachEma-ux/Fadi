# Haute disponibilité de la base : standby en streaming, bascule, retour

Chantier `docs/workstreams/base-donnees/`, tâche **BD-9.3** (constat M10 « instance unique »), décision du maître
d'ouvrage **D-BD-10 : standby en streaming sur une seconde machine**. Objectifs D-BD-1 : **RPO 15 min, RTO 2 h**.
Prérequis : la production est en PostgreSQL 18 (BD-9.2, `docs/montee-postgresql-18.md`) — primaire et standby ont
toujours la même version majeure. Complète `docs/sauvegarde-pitr.md` (pgBackRest) et `docs/deploiement.md`.

Rien n'est appliqué par le dépôt : la seconde machine, le réseau privé, les certificats et chaque bascule sont l'affaire
de l'administrateur, **en préproduction d'abord**, sur accord du maître d'ouvrage pour la production.

## Principe

- Le **primaire** (machine actuelle) envoie ses WAL en continu au **standby** (seconde machine) par la réplication en
  streaming, **asynchrone** : une écriture validée sur le primaire n'attend pas le standby. La perte possible à la bascule
  est le retard de réplication du moment ; la sonde alerte à 10 min de retard (sous le RPO de 15 min). La réplication
  synchrone (aucune perte, mais écritures bloquées si le standby tombe) n'est pas retenue par D-BD-10.
- Un **slot de réplication** (`fadi_standby`) garde sur le primaire les WAL que le standby n'a pas reçus, borné par
  `max_slot_wal_keep_size` pour qu'un standby arrêté ne remplisse pas le disque du primaire.
- Le standby est en lecture seule (`hot_standby`) ; il ne remplace pas les sauvegardes : une suppression erronée est
  rejouée aussitôt. pgBackRest (PITR) et les dumps restent la protection contre l'erreur.
- Sur la seconde machine, seule la base tourne ; l'application, la migration, le relais HTTPS et le service de
  sauvegarde y sont présents mais ne démarrent qu'à la bascule (profil Compose `bascule`).

## Livré dans le dépôt

| Fichier | Rôle |
| --- | --- |
| `ops/standby/role-replication.sql` | Rôle `fadi_replication` (LOGIN REPLICATION, SCRAM, mot de passe passé par `-v mdp=…` depuis l'environnement), droits de `pg_rewind`, slot physique, `pg_monitor` pour le rôle de la sonde |
| `ops/standby/pg_hba.replication.conf.example` | Lignes `pg_hba.conf` (réplication et `pg_rewind`, adresses privées, `hostssl`) |
| `ops/standby/compose.primaire.yml` | Primaire : port publié sur l'adresse privée seulement, certificats TLS montés |
| `ops/standby/compose.standby.yml` | Seconde machine : service `amorcage` (`pg_basebackup -R` avec slot), base en standby, autres services sous le profil `bascule` |
| `ops/surveillance/sonde-base.sh` | Reconnaît primaire / standby ; alertes `replication-en-retard` (600 s), `standby-absent`, `reception-wal-arretee`, `slot-inactif` |

Les surcharges Compose sont vérifiées par `docker compose config` ; elles n'ont **pas** été démarrées en conteneur dans
le chantier (pas de Docker). La mécanique PostgreSQL a été répétée sur deux clusters locaux (fin de ce document).

## Mise en place

Notations : `F="-f docker-compose.yml -f ops/pg18/compose.pg18.yml"`, plus `-f ops/pgbackrest/compose.pitr.yml
-f ops/pg18/compose.pitr18.yml` si l'archivage est en place, toujours `docker compose --env-file .env.deploy …`.

### 1. Réseau et machine

- Seconde machine chez un hébergeur ou dans une zone distincte de la première (sinon une panne commune emporte les deux) ;
  disque ≥ celui du primaire ; même Docker, même dépôt au même commit, même `.env.deploy` (copié hors Git, `0600`).
- Réseau privé entre les deux (WireGuard ou réseau privé de l'hébergeur). Port 5432 ouvert **seulement** entre les deux
  adresses privées (pare-feu des deux côtés). `FADI_REPLICATION_ECOUTE=<adresse-privée>:5432` dans `.env.deploy` de
  chaque machine (sa propre adresse).
- TLS : certificat serveur pour chaque machine (nom = adresse privée), `server.crt` / `server.key` dans
  `/etc/fadi/pg-tls` (clé `0600`, propriétaire uid 999), l'autorité dans `/etc/fadi/replication/ca.crt`. Sans TLS, la
  réplication ne doit passer que dans le tunnel WireGuard (`hostssl` → `host`, `FADI_REPLICATION_SSLMODE=disable`) ;
  choix à consigner ici.

### 2. Primaire

```sh
docker compose $F -f ops/standby/compose.primaire.yml up -d db       # publie le port privé, monte les certificats
docker compose $F exec -T db psql -U fadi -d postgres -X -v ON_ERROR_STOP=1 -v mdp="$FADI_REPLICATION_DB_PASSWORD" \
  < ops/standby/role-replication.sql                                 # rôle, droits pg_rewind, slot, pg_monitor
docker compose $F exec db sh -c 'cat >> "$PGDATA/pg_hba.conf"' < pg_hba.replication.conf   # modèle rempli
docker compose $F exec db psql -U fadi -d postgres -c "ALTER SYSTEM SET wal_log_hints = on" \
  -c "ALTER SYSTEM SET max_slot_wal_keep_size = '<taille>'" -c "ALTER SYSTEM SET hot_standby_feedback = on" \
  -c "ALTER SYSTEM SET ssl = on" -c "ALTER SYSTEM SET ssl_cert_file = '/etc/fadi/pg-tls/server.crt'" \
  -c "ALTER SYSTEM SET ssl_key_file = '/etc/fadi/pg-tls/server.key'"
# avec pgBackRest : ALTER SYSTEM SET restore_command = 'pgbackrest --stanza=fadi archive-get %f "%p"'
docker compose $F -f ops/standby/compose.primaire.yml restart db   # wal_log_hints : redémarrage (fenêtre courte annoncée)
```

- `FADI_REPLICATION_DB_PASSWORD` : mot de passe long, généré et gardé avec les autres secrets (jamais dans Git).
- `wal_level=replica` est déjà le défaut (et posé par `compose.pitr.yml`) ; `max_wal_senders` : 10 par défaut, 5 avec
  `compose.pitr.yml`, assez pour un standby et un `pg_basebackup`.
- `wal_log_hints = on` : indispensable à `pg_rewind` sur un cluster sans sommes de contrôle (cas des volumes créés par
  l'image Docker) ; à faire dans la même fenêtre que la montée en 18 si possible.
- `max_slot_wal_keep_size` : taille que le disque du primaire peut céder aux WAL en attente (mesurer l'espace libre ;
  au-delà, le slot est invalidé et le standby se reconstruit). Aucune valeur n'est fixée par le dépôt.
- Ces réglages vivent dans `postgresql.auto.conf` (dans PGDATA) : `pg_basebackup` et `pg_rewind` les recopient, donc les
  deux machines sont symétriques. `restore_command` ne sert qu'en récupération (standby, `pg_rewind`).

### 3. Standby (seconde machine)

```sh
install -d -m 0750 -g 999 /etc/fadi/replication
install -m 0600 -o 999 /dev/null /etc/fadi/replication/pgpass
printf '%s:5432:*:fadi_replication:%s\n' "<ip-primaire>" "$FADI_REPLICATION_DB_PASSWORD" > /etc/fadi/replication/pgpass
FADI_PRIMAIRE_HOTE=<ip-primaire> docker compose $F -f ops/standby/compose.standby.yml run --rm amorcage
docker compose $F -f ops/standby/compose.standby.yml up -d db
```

L'amorçage refuse un volume déjà rempli ; il écrit `standby.signal` et `primary_conninfo` (avec le **chemin** du fichier
de mots de passe, jamais le mot de passe — vérifié en répétition) dans `postgresql.auto.conf`.

### 4. Contrôler

Sur le primaire : `SELECT application_name, state, sync_state, write_lag, flush_lag, replay_lag FROM pg_stat_replication;`
(`streaming`, `async`). Sur le standby : `SELECT pg_is_in_recovery(), status FROM pg_stat_wal_receiver;` (`t`,
`streaming`). Puis la sonde des deux côtés.

### 5. Supervision

Timer de 5 min sur chaque machine, code transmis à Healthchecks (comme `docs/sauvegarde-pitr.md` § 4) :

- primaire : `SONDE_STANDBYS=1 SONDE_URL=… sh ops/surveillance/sonde-base.sh` ;
- standby : `SONDE_URL=… sh ops/surveillance/sonde-base.sh`.

| Alerte | Où | Sens | Réaction |
| --- | --- | --- | --- |
| `replication-en-retard` | les deux | retard ≥ `SONDE_RETARD_S` (600 s) : la perte en cas de bascule approche du RPO | Réseau, charge, disque du standby |
| `standby-absent` | primaire | moins de `SONDE_STANDBYS` standbys en streaming | Standby arrêté ou réseau coupé |
| `slot-inactif` | primaire | un slot ne sert plus : il retient les WAL | Relancer le standby ; sinon supprimer le slot (`pg_drop_replication_slot`) avant que le disque se remplisse |
| `reception-wal-arretee` | standby | plus de réception en streaming | Primaire, réseau, mot de passe, slot invalidé |

Sur le standby, `retard_s` est l'âge de la dernière transaction rejouée quand des WAL reçus attendent : c'est un majorant
du retard réel (répétition : 9 s mesurées pour une pause de rejeu de 3 s). Sur le primaire, c'est `replay_lag`.
`archivage-en-retard` n'est évalué que sur le primaire (le standby n'archive pas avant sa promotion).

## Bascule

### Budget du RTO (2 h)

| Étape | Mesure |
| --- | --- |
| Détection (sonde 5 min, Healthchecks, appel de l'administrateur) | à mesurer en exercice |
| Décision de basculer (panne du primaire confirmée, retard connu) | à consigner |
| Clôture de l'ancien primaire | à mesurer en exercice |
| Promotion | 0,48 s en répétition locale |
| Démarrage de l'application, relais HTTPS, DNS sur la seconde machine | à mesurer (TTL du DNS compris) |
| Contrôles (sonde, scénario de bout en bout) | à mesurer |

Le total mesuré en exercice de préproduction est consigné ici ; il doit rester sous 2 h. Garder un TTL DNS court sur
`FADI_DOMAIN` (valeur à choisir par l'administrateur avec l'hébergeur DNS).

### A. Bascule sur panne (le primaire ne répond plus)

1. **Constater** : sonde du primaire `base-injoignable` ou machine perdue ; sur le standby, noter le dernier état
   (`SELECT now() - pg_last_xact_replay_timestamp(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();`) : c'est la
   perte maximale.
2. **Clôturer l'ancien primaire** (*fencing*) avant toute promotion : deux primaires qui acceptent des écritures
   divergent sans retour (la répétition l'a montré : l'écriture faite sur l'ancien primaire après la promotion est
   perdue). Selon ce qui reste accessible : `docker compose $F stop app db` sur l'ancienne machine (un service arrêté à la
   main ne redémarre pas au redémarrage de l'hôte, `restart: unless-stopped`) ; sinon extinction ou coupure réseau par la
   console de l'hébergeur ; sinon règle de pare-feu côté seconde machine et DNS. Changer le DNS seul n'est pas une
   clôture.
3. **Promouvoir** le standby : `docker compose $F -f ops/standby/compose.standby.yml exec db psql -U fadi -d postgres -c
   "SELECT pg_promote(wait => true, wait_seconds => 60)"` (équivalent : `pg_ctl promote -D "$PGDATA"` dans le conteneur,
   en utilisateur postgres). `pg_is_in_recovery()` doit renvoyer `f` ; la ligne de temps passe à 2.
4. **Rouvrir le service sur la seconde machine** : `docker compose $F -f ops/standby/compose.standby.yml --profile bascule up -d`.
   L'API s'y connecte à `db:5432` (sa base locale, `DATABASE_URL` de `docker-compose.yml` inchangé) ; `migrate` ne doit
   rien appliquer. Faire pointer `FADI_DOMAIN` sur l'adresse publique de la seconde machine (ports 80/443 ouverts) : Caddy
   obtient le certificat.
5. **Sauvegardes** : sur la nouvelle machine, `/etc/pgbackrest/pgbackrest.conf` (même dépôt, `pg1-path` du volume local)
   est en place dès la mise en route ; la nouvelle ligne de temps s'archive dans la même stanza (même identifiant de
   système). `pgbackrest --stanza=fadi check`, puis une sauvegarde complète. Timers de sauvegarde, d'exercice et de sonde
   activés sur cette machine (`SONDE_STANDBYS=0` tant qu'aucun standby n'est reconstruit).
6. **Consigner** : heure (suisse) de la panne, de la décision, de la promotion, de la réouverture ; retard au moment de la
   panne (perte réelle).

Si seul le conteneur de la base est tombé et que l'hôte du primaire va bien, un redémarrage du service `db` suffit en
général : la bascule est pour la perte de la machine ou une panne longue.

### B. Bascule planifiée (*switchover*, maintenance de la première machine)

1. Annoncer la fenêtre ; `docker compose $F stop app proxy` sur le primaire.
2. Attendre un retard nul : `SELECT pg_current_wal_lsn();` sur le primaire, égal à `pg_last_wal_replay_lsn()` du standby.
3. Arrêter proprement le primaire (`docker compose $F stop db`) : l'arrêt propre envoie ses derniers WAL.
4. Promouvoir le standby, rouvrir sur la seconde machine (A.3 à A.5). Aucune perte.
5. Rattacher l'ancien primaire en standby (ci-dessous) ; pour revenir à la configuration d'origine, refaire la même
   bascule dans l'autre sens.

## Retour de l'ancien primaire en standby (`pg_rewind`)

L'ancien primaire a pu écrire des WAL que le nouveau n'a jamais reçus : `pg_rewind` le ramène au point de divergence en
recopiant les blocs modifiés depuis le nouveau primaire, puis il rejoue la ligne de temps 2.

```sh
# Sur le nouveau primaire : un slot pour lui
docker compose … exec db psql -U fadi -d postgres -c "SELECT pg_create_physical_replication_slot('fadi_standby')"
# Sur l'ancienne machine, base ARRÊTÉE, le fichier pgpass rempli pour l'adresse du nouveau primaire :
docker compose $F -f ops/standby/compose.standby.yml run --rm --no-deps --user postgres -e PGPASSFILE=/etc/fadi/replication/pgpass --entrypoint pg_rewind db \
  -D /var/lib/postgresql/18/docker --restore-target-wal -R -P \
  --source-server="host=<ip-nouveau-primaire> port=5432 user=fadi_replication dbname=postgres sslmode=verify-full sslrootcert=/etc/fadi/replication/ca.crt"
docker compose $F -f ops/standby/compose.standby.yml up -d db
```

- `--restore-target-wal` va chercher dans l'archive (pgBackRest, `restore_command` du § 2) les WAL de l'ancien primaire
  déjà recyclés : **sans archive, la répétition a échoué** (« could not open file … 000000010000000000000009 »).
- `pg_rewind` recopie aussi les fichiers de configuration du nouveau primaire (`pg_hba.conf`, `postgresql.auto.conf`),
  d'où l'intérêt de règles symétriques ; il écrit `standby.signal` et `primary_conninfo` (`-R`). Si `primary_slot_name`
  n'y est pas, l'ajouter dans `postgresql.auto.conf` avant le démarrage.
- `pg_rewind` exige `wal_log_hints = on` (ou les sommes de contrôle) depuis **avant** la divergence.
- Si `pg_rewind` échoue ou si l'état est douteux : vider le volume et refaire l'amorçage (§ 3) depuis le nouveau primaire.
- Sur la machine qui redevient standby : `--profile bascule` arrêté (`docker compose … stop app proxy migrate backup`),
  timers de sauvegarde désactivés, sonde sans `SONDE_STANDBYS`.

## pgBackRest et le standby

- Les sauvegardes se font sur le primaire (configuration actuelle de `docs/sauvegarde-pitr.md`). Les faire depuis le
  standby (`backup-standby=y`) demande un hôte pgBackRest qui joint les deux serveurs (SSH ou serveur TLS de pgBackRest) :
  option possible, non retenue ici.
- Les deux machines portent la même configuration de dépôt ; une seule archive à la fois. Si l'ancien primaire n'est pas
  clôturé et pousse encore des WAL, pgBackRest refuse un segment déjà archivé avec un autre contenu : c'est un signal de
  double primaire, à traiter par la clôture.
- Le standby lit l'archive (`restore_command`) quand le streaming ne suffit pas (slot invalidé, longue coupure).
- Après chaque bascule : `pgbackrest check` et une sauvegarde complète sur le nouveau primaire, puis l'exercice de
  restauration (`ops/restore-drill.sh`) pour mesurer le RTO de restauration.

## Répétition locale du 2026-11-02

Clusters PostgreSQL 16.15 jetables (`/usr/lib/postgresql/16/bin`) sous `/home/pgscratch/bd9d`, primaire sur le port
54340 et standby sur 54341, sur la même machine (le réseau entre deux machines, TLS et Docker ne sont pas couverts).
Primaire : `wal_level=replica`, `max_wal_senders=10`, `max_slot_wal_keep_size=1GB` (valeur d'essai), `wal_log_hints=on`,
`hot_standby_feedback=on`, archivage dans un répertoire local (à la place de pgBackRest). Rôle et slot créés par
`ops/standby/role-replication.sql` (refus sans mot de passe vérifié), mots de passe SCRAM, connexion de réplication par
TCP avec un fichier de mots de passe. Clusters arrêtés et supprimés à la fin. Durées en secondes, horloge du script
(boucle de sondage `psql` comprise).

| Mesure | Résultat |
| --- | --- |
| `pg_basebackup -R -S fadi_standby -X stream` (base vide) | 3,4 à 5,7 s ; `primary_conninfo` sans mot de passe (chemin du `passfile`) |
| Démarrage du standby | 2,7 à 4,1 s ; `pg_stat_replication` : `streaming`, `async` |
| Schéma Fadi par `migrate.ts` sur le primaire pendant le streaming | 16,6 à 19,4 s, 69 Mo de WAL ; standby à jour 0,08 à 0,22 s après ; 154 tables et 10 migrations des deux côtés |
| 200 000 lignes insérées (≈ 4 s) | rejouées sur le standby 0,14 à 0,20 s après la fin ; `write_lag` ≈ 0,10 s, `flush_lag` ≈ 0,12 s, `replay_lag` ≈ 0,17 à 0,22 s |
| 20 écritures unitaires | 0,22 à 0,34 s en moyenne entre l'écriture et sa lecture sur le standby |
| Écriture sur le standby | refusée (`cannot execute INSERT in a read-only transaction`) |
| Sonde, état nominal | primaire et standby : code 0, `alertes: []` |
| Standby arrêté | primaire : code 1, `standby-absent`, `slot-inactif` ; 20 Mo de WAL retenus par le slot ; rattrapage 0,5 s au redémarrage |
| Rejeu en pause 3 s, seuil abaissé à 2 s | standby : code 1, `replication-en-retard` (`retard_s` = 9, majorant) |
| Promotion `pg_promote(wait => true)` | 0,34 à 0,48 s ; ligne de temps 2 |
| Écriture sur l'ancien primaire non clôturé | acceptée (double primaire), puis **perdue** après `pg_rewind` : la clôture est indispensable |
| `pg_rewind -R` avec `fadi_replication` (non super-utilisateur) | sans archive : échec, WAL recyclé introuvable ; avec `--restore-target-wal` et l'archive : réussi en 13,3 à 15,2 s (≈ 278 Mo recopiés) |
| Ancien primaire redémarré en standby | 10 s ; `streaming` ; comptes identiques des deux côtés (250 024 lignes) ; slot de l'ancien primaire non recopié |
| Sonde après bascule | nouveau primaire (`SONDE_STANDBYS=1`) et nouveau standby : code 0 |
| `ops/pg18/verifier.sh comparer` primaire / standby | `COMPARAISON_OK` |
| Script du service `amorcage` (extrait de `compose.standby.yml`, lancé hors conteneur, `sslmode=disable`) | amorçage réussi, `standby.signal` écrit ; refus d'un volume déjà initialisé ; refus sans `FADI_PRIMAIRE_HOTE` |

Constats retenus dans la procédure : `pg_rewind` recopie la configuration de la source (le port du nouveau primaire
s'est retrouvé dans celle de l'ancien) ; il lui faut l'archive des WAL ; le `passfile` évite le mot de passe dans
`postgresql.auto.conf`.

## Reste à faire par l'administrateur

1. Seconde machine, réseau privé, pare-feu, certificats ; consigner le choix TLS ou WireGuard.
2. Montée en 18 de la production d'abord (BD-9.2).
3. Mise en place en préproduction (ou sur un couple de machines jetables), puis exercice de bascule A et B chronométré,
   pour remplir le budget du RTO ci-dessus ; puis production sur accord.
4. Timers de sonde sur les deux machines, Healthchecks ; `max_slot_wal_keep_size` fixé d'après le disque.
5. Exercice de bascule au moins une fois par an et après tout changement de version ou d'hébergeur (proposition).
