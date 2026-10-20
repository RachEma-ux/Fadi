# Fadi — livraison automatique en préproduction (CI → VPS)

**État initial : désactivé par défaut.** Cette proposition ne déploie rien avant revue indépendante, configuration du VPS, secrets GitHub, approbation du commit de base et activation de `FADI_PREPROD_CI_ENABLED=true`.

## Chemin de livraison

1. Une PR est revue et fusionnée dans la branche protégée `main`.
2. GitHub Actions `CI` s'exécute sur le `push` de `main`. Seul un résultat **success** déclenche la livraison.
3. `.github/workflows/preprod-deploy.yml` refuse une révision périmée, une PR ou une CI défaillante.
4. GitHub Actions se connecte en SSH au compte dédié **`fadi-deploy`**, à l'aide d'une clé **distincte** de celles de Claude, d'Ubuntu et des anciennes deploy keys.
5. La clé SSH doit être assortie d'une commande forcée : `/usr/local/libexec/fadi-preprod-ci-ssh`. Tout autre ordre SSH est refusé. Son unique sudo autorisé appelle `/usr/local/sbin/fadi-preprod-ci-deploy`.
6. Le script privilégié vérifie lui-même le SHA exact de `main` **et le statut de la CI auprès de GitHub**, puis vérifie l'intégrité de la préproduction et refuse les changements de schéma ou d'infrastructure.
7. Il contrôle la mémoire et le disque disponibles, sauvegarde la base **de préproduction**, construit seulement l'image applicative, met à jour les conteneurs **fadi-preprod**, teste `127.0.0.1:3101` et revient à la version précédente si la livraison échoue.
8. **Aucune modification** de `www.fadimmo.com`, de son proxy, de ses conteneurs, de ses volumes ou de sa base n'est permise par ce mécanisme.

Une modification sous `apps/api/src/db/` ou `deploy/preprod/`, une révision sans parenté avec l'actuelle préproduction, une migration ou un premier déploiement requièrent une procédure **manuelle revue et sauvegardée**. Les changements du schéma PostGIS ne sont jamais automatiques. La restauration d'une base de données et la publication en production restent manuelles.

## Prérequis pour l'activation unique (administrateur du VPS)

À réaliser **uniquement après revue indépendante des scripts de la PR fusionnée**, sur le serveur par un administrateur autorisé, en conservant la production intacte :

- Vérifier que `fadi-preprod garde`, `fadi-preprod smoke`, `fadi-preprod backup` et la restauration de contrôle passent. Contrôler CPU, mémoire, disque et l'image précédente. Ne jamais lancer `docker compose up` dans la production pour préparer ceci.
- Mettre à jour le **script root** `/usr/local/sbin/fadi-preprod` vers la version revue avec `build-app` : `install -o root -g root -m 0755 deploy/preprod/fadi-preprod /usr/local/sbin/fadi-preprod`. Les deux nouveaux fichiers doivent aussi être copiés depuis le checkout **approuvé** avec `install -o root -g root -m 0755 deploy/preprod/ci-deploy /usr/local/sbin/fadi-preprod-ci-deploy` et `install -o root -g root -m 0755 -D deploy/preprod/ci-ssh /usr/local/libexec/fadi-preprod-ci-ssh`.
- Créer un compte système dédié `fadi-deploy`, sans droit Docker, sans appartenance au groupe sudo, sans authentification par mot de passe, avec sa propre paire SSH Ed25519. **La clé privée ne doit jamais être transférée dans le dépôt, un chat ou sur le VPS si elle est générée côté client.**
- Dans le seul `authorized_keys` du compte, installer la **clé publique** avec la restriction OpenSSH `restrict,command="/usr/local/libexec/fadi-preprod-ci-ssh"`, puis sécuriser `~/.ssh` en 0700 et `authorized_keys` en 0600. La restriction doit être testée : `ssh ... 'id'` doit échouer.
- Valider puis installer une règle sudoers dédiée, et **aucune autre autorisation sudo** pour ce compte :

  ```sudoers
  fadi-deploy ALL=(root) NOPASSWD: /usr/local/sbin/fadi-preprod-ci-deploy *
  ```

  Utiliser `visudo -cf` avant l'installation. Cette règle n'est acceptable **qu'en présence** du contrôle strict sur l'identité `SUDO_USER=fadi-deploy` et sur le SHA dans le script root.
- Définir une **version initiale de préproduction** approuvée par l'administrateur, après sauvegarde et revue du commit courant de `main` ; la mettre à niveau par la procédure manuelle `fadi-preprod sync`, `build`, `up`, `smoke`, si nécessaire. Cela établit la parenté Git attendue par les futurs déploiements. Ne pas activer l'automatisation tant que l'instance publique et privée n'est pas vérifiée.
- Vérifier l'empreinte Ed25519 **réelle du serveur SSH** depuis une console d'administration de confiance, avant d'enregistrer le `known_hosts`. Ne **pas** accepter automatiquement le résultat non vérifié de `ssh-keyscan`.

### Paramètres GitHub à créer (Settings → Secrets and variables → Actions)

| Catégorie | Nom | Contenu |
|---|---|---|
| Repository secret | `FADI_PREPROD_SSH_KEY` | **Clé privée** du compte `fadi-deploy`, créée hors dépôt |
| Repository variable | `FADI_PREPROD_SSH_HOST` | `179.237.121.241` (ou nom DNS de ce VPS) |
| Repository variable | `FADI_PREPROD_SSH_KNOWN_HOSTS` | Ligne `known_hosts` de la **clé d'hôte vérifiée** du VPS |
| Repository variable | `FADI_PREPROD_CI_ENABLED` | `false` pendant la préparation ; `true` **en dernier**, après validation |

Le job utilise l'environnement GitHub `preproduction`. Ses règles d'approbation doivent être configurées selon la politique de livraison du projet ; aucune règle d'environnement ne vaut autorisation de déployer en production.

La clé GitHub **Deploy key** `preprod2` utilisée auparavant pour pousser du code n'est pas cette clé SSH de livraison : ne jamais la réutiliser.

## Comportement en cas d'échec

- CI rouge, mauvaise branche, mauvais SHA, secrets absents, serveur SSH injoignable : **aucun changement sur le VPS** (le job échoue ou est ignoré).
- Schéma SQL, infrastructure de préproduction, SHA non descendant de la version installée : **arrêt avant tout changement** ; revue manuelle obligatoire.
- Ressources VPS insuffisantes : **arrêt avant compilation**, protection de la production contre la surcharge.
- Erreur lors du build, du démarrage ou du contrôle de santé : **tentative de retour à l'image précédente** ; vérification humaine indispensable si le retour arrière échoue.
- Aucun `migrate`, `down`, `edge on|off`, commande proxy ou commande de production n'est inclus.

## Vérification

Sur une PR de modification des scripts, le job **Validate deployment scripts** lance `bash -n` et `deploy/preprod/tests/test-ci-deploy.sh`, sans privilège et sans contacter le VPS. Après activation, fusionner une petite modification applicative sans migration : vérifier la CI verte, le job de déploiement vert et la réponse `/health` sur la préproduction.

**Remarque importante :** la présence de ces fichiers dans GitHub ne prouve **pas** que le serveur et les secrets ont été configurés. L'installation initiale privilégiée doit être revue et réalisée séparément, et jamais sous-entendue.
