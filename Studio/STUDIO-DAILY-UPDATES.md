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
