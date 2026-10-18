# M09 — canevas CI pur proposé, non appliqué

Cette proposition est **du texte de préparation**, aucun fichier `.github/workflows/` modifié. L’exemple ne démarre ni service, niAPI/DB, ne lance npm/pip/lifecycle, n’exécute aucun code du projet et ne consulte pasd’advisories réseau. Il inventorie les métadonnées du lock : son succès ne peut pas être nommé « aucunevulnérabilité ».

SHAcheckout repris de l’observation PR152f277723… pour éviter un nouveauchoixflottant, **à revalider avant application**. Nomdecheck candidate distinct, non ajouté auxprotectionsGitHub. L’application exige accordSCAN-A et revueA0/A6. Le contenuHTMLCSP/runtime et les jobsPR169sansDB restent indépendants.

```yaml
name: M09 — inventaire hors réseau (pas verdict CVE)
on:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: m09-inventory-${{ github.ref }}
  cancel-in-progress: true
jobs:
  inventory-only:
    name: M09 — métadonnées uniquement, vulnérabilités non évaluées
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
      - name: Lire le verrou sans installer ni exécuter ses dépendances
        shell: bash
        run: |
          python3 - <<'PY'
          from pathlib import Path
          import hashlib, json, os
          lock_path = Path('package-lock.json')
          raw = lock_path.read_bytes()
          lock = json.loads(raw)
          packages = lock.get('packages')
          if not isinstance(packages, dict):
              raise SystemExit('INVENTORY_INCOMPLETE: package lock schema absent')
          rows = []
          for path, item in sorted(packages.items()):
              if not isinstance(item, dict):
                  raise SystemExit('INVENTORY_INCOMPLETE: package entry malformed')
              if not path or item.get('link'):
                  continue
              name = item.get('name') or path.rsplit('node_modules/', 1)[-1]
              rows.append({
                  'lock_path': path, 'name': name,
                  'version': item.get('version'),
                  'license_declared': item.get('license'),
                  'dev_declared': bool(item.get('dev')),
                  'integrity_present': bool(item.get('integrity')),
              })
          report = {
              'kind': 'lock metadata inventory; NOT a vulnerability assessment',
              'schema_version': 1,
              'github_workflow_sha': os.environ.get('GITHUB_SHA'),
              'lock_sha256': hashlib.sha256(raw).hexdigest(),
              'packages': rows,
              'advisory_status': 'NOT_SCANNED',
              'advisory_snapshot': None,
              'vulnerability_findings': None,
              'license_status': 'DECLARATIONS_ONLY_NOT_LEGAL_REVIEW',
              'not_covered': ['OCCT binary license', 'embedded vendors/fonts',
                              'Python packages', 'container OS packages',
                              'reachability', 'runtime image'],
          }
          folder = Path('m09-inventory')
          folder.mkdir(exist_ok=True)
          output = folder / 'inventory.json'
          output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
          digest = hashlib.sha256(output.read_bytes()).hexdigest()
          print('M09_INVENTORY_ONLY:', len(rows), 'entries; advisory_status=NOT_SCANNED')
          print('inventory_sha256=' + digest)
          summary = os.environ.get('GITHUB_STEP_SUMMARY')
          if summary:
              with open(summary, 'a') as stream:
                  stream.write('## M09: inventaire uniquement\n\n')
                  stream.write(f'{len(rows)} entrées; empreinte `{digest}`.\n\n')
                  stream.write('Advisories non consultées, vulnérabilités non évaluées. '
                               'Ce succès ne démontre aucune absence de vulnérabilité.\n')
          PY
```

Le numéro `schema_version:1` ci-dessus concerne seulement ce rapportproposé, **pas un nouveau contrat métierFadi**. Le rapport ne reproduit paslesURLresolved, tokens, contenuenv ou donnéesclient. Une revueanti-secrets reste obligatoire avant publication de l’artefact complet. L’upload/retention et l’épinglage exact de l’action choisie doivent être ajoutés explicitement après cette revue ; le canevas ne configure aucunstockage externe ni politique de rétention.

## Extension future, hors de ce canevas pur

Après accordSCAN-B : fournir un snapshotadvisories approuvé avecsource/licence/outillage/version/date/empreinte et l’image/SBOMduSHAexact. Un joboffline peut comparer ces entrées, produire findingssourcés puis triage. **Ne pas substituer `[]` à une sourceadvisoryabsente** ; l’état reste INCOMPLETE/NOT_SCANNED. Les seuils et exceptions datées sont à décider ; succèsinventaire et succèsanalyserisque sont deuxpreuves.

CSP-A aura son propre checkpurs sansDB, par exemple testsd’un constructeurpolicy/header avec doubles complets ; ne pas app.createApp nonmocké ni healthDB réelle. CSP-B browserfixtures nécessitera un lotlocalisolé explicitementautorisé, pas une réactivationE2Eglobale. Lescontenus du présentcanevas n’ont pas été exécutés ni validés comme workflowopérationnel.
