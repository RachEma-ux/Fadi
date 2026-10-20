# Studio — actualisation quotidienne de la checklist HTML

## Fonctionnement

L'automatisation met à jour la **checklist HTML interactive existante** :
[Studio/Fadi_Studio_Checklist_Interactive_V1_1.html](Fadi_Studio_Checklist_Interactive_V1_1.html).

Sources :
- [Issue #166](https://github.com/RachEma-ux/Fadi/issues/166) : commentaires horaires `[CODEX-ACK]`, `[CODEX-PROGRESS]`, `[CHATGPT-HOURLY]`, `[CODEX-QUESTION]` et réponses ;
- [Programme #156](https://github.com/RachEma-ux/Fadi/issues/156) : 31 missions et 630 affectations ;
- le référentiel `Fadi_Studio_Checklist_Execution_V1_0.md`, qui contient **630 tâches**.

Livrables : `Fadi_Studio_Daily_Status.json` (dernier snapshot daté) et un panneau de synthèse **dans le même HTML**, avec SHA, questions, dernier rapport, liens et éventuels signalements par ID.

## Trois cases conservées

Le HTML possède déjà, pour chaque tâche : **Code**, **Review ChatGPT** et **Review Admin**. Les coches personnelles et les métadonnées sont conservées dans `localStorage` et exportables en JSON. **Le dispositif quotidien n'écrit jamais dans leur état** : un commentaire d'agent ne vaut pas validation humaine, ni automatiquement vérification de code.

Un signal informatif par ID peut être posté dans #166 :
```text
[STUDIO-TASK-STATUS] {"id":"SRC-01","stage":"code","proof_url":"https://github.com/RachEma-ux/Fadi/pull/123"}
```
`stage` : `code`, `chatgpt-review` ou `admin-review`. L'interface montre un lien non validant vers la preuve ; **aucune coche n'est effectuée**.

## Pourcentages

`P630` rapporté par Codex (exemple « 6/630 ») est affiché **comme déclaré**, pas comme un contrôle individuel confirmé. Une affectation 630/630 ne vaut jamais 100 % de réalisation. `PDEV`, développement fonctionnel total, reste **N/D %** tant que son périmètre/denominateur et les preuves ne sont pas qualifiés.

Le snapshot comporte une provenance temporelle et des SHA. En absence de réponse GitHub, le générateur échoue sans écraser le dernier état, plutôt que présenter des données périmées comme fraîches.

## Mise à jour automatique

[Workflow](../.github/workflows/studio-checklist-daily.yml) : `Studio — snapshot quotidien de la checklist`.

- Tests hors réseau en PR.
- **Tous les jours à 05:17 UTC**, après fusion du workflow sur la branche par défaut (07:17 heure suisse d'été / 06:17 d'hiver).
- Déclenchement manuel possible dans GitHub Actions → workflow → Run workflow.
- Le job quotidien lit #166 et crée/met à jour une **PR dédiée** `automation/studio-checklist-daily`. Il ne pousse pas directement dans `main` et ne fusionne aucune PR.
- Nécessite l'option d'administration GitHub permettant à Actions de créer des PR ; si elle n'est pas active, l'étape de création de PR échoue et demande intervention.

**La simple ouverture de la PR d'installation ne déclenche pas le cron.** Une fusion distincte et approuvée est nécessaire.

## Contrôle local

```sh
python3 scripts/test-update-studio-daily.py -v
python3 scripts/update-studio-daily.py --offline --dry-run
GITHUB_TOKEN=... python3 scripts/update-studio-daily.py
```

Respecter les restrictions : dépôt public, aucun secret, aucune base ni test destructif. Ce workflow n'active **pas** Codex Cloud ; l'exécution de Codex est vérifiée à partir de ses ACK et preuves GitHub. Suivi : [Issue #167](https://github.com/RachEma-ux/Fadi/issues/167).

## Tableau de bord autonome (sans ouvrir les paramètres ChatGPT)

Accès au fichier : [Fadi_Dashboard_Horaire.html](Fadi_Dashboard_Horaire.html). Il s'agit d'une page HTML autonome, adaptée à l'écran mobile, qui lit **en lecture seule** les commentaires du canal GitHub #166, l'état de la PR #165, le SHA de `main` et les exécutions CI publiques à chaque ouverture ou clic **Actualiser**.

Cette page est distincte de la checklist interactive. Elle affiche deux indicateurs, les statuts des 630 tâches, les 31 missions, les questions/décisions, la CI et des liens directs. La baseline du développement fonctionnel reste `N/D %` tant que `DEV_SCOPE` n'est pas ratifié. Les nombres tirés de rapports Codex sont **attribués à leur source**, pas homologués.

**Publication :** un fichier HTML `blob` dans GitHub montre du code, **pas une page web navigable**. La PR #168 doit d'abord être fusionnée si l'on veut activer le workflow quotidien. Pour obtenir une URL HTTPS publique qui rende le tableau de bord, il faut en outre publier ce fichier sur un hébergement statique **explicitement autorisé** (GitHub Pages si disponible et configuré, ou service existant approuvé). Aucune adresse GitHub Pages, ni URL de production `fadimmo.com`, n'est présumée active. Le fichier peut aussi s'ouvrir localement comme document HTML, auquel cas les appels GitHub dépendent des permissions réseau du navigateur.

Le rapport horaire ChatGPT continue à paraître dans sa conversation. Le lien de tâche « Hourly » ouvre ses **paramètres** dans l'interface native ; cette page autonome n'en modifie pas le comportement.
