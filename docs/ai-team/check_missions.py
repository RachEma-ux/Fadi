#!/usr/bin/env python3
"""Contrôle documentaire sans réseau, base de données ni modification applicative."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys

TASK = re.compile(r'^- \[([ xX])\] \*\*([A-Z][A-Z0-9.\-]*)\*\* — (.+)$')


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()


def normalize_checks(text: str) -> bytes:
    return re.sub(r'^(- \[)[xX](\] \*\*)', r'\1 \2', text, flags=re.M).encode('utf-8')


def validate(registry: dict, source: str, catalog: str) -> list[dict]:
    if registry.get('schema_version') != 1:
        raise ValueError('Version de registre non prise en charge')
    if git_blob(normalize_checks(source)) != registry.get('source_blob_sha'):
        raise ValueError('Source modifiée : migrer les affectations après revue ; ne pas ignorer cet écart')
    missions = registry.get('missions', [])
    count = registry.get('expected_missions')
    if not isinstance(count, int) or count < 1 or len(missions) != count:
        raise ValueError('Nombre de missions incohérent')
    ids = [m.get('id') for m in missions]
    if len(set(ids)) != count or set(ids) != {f'M{i:02d}' for i in range(count)}:
        raise ValueError('Mission manquante, dupliquée ou identifiant modifié')
    headings = re.findall(r'^## (M\d{2}) — ', catalog, flags=re.M)
    if sorted(headings) != sorted(ids):
        raise ValueError('Le catalogue ne contient pas exactement un contrat par mission')
    lines = source.split('\n')
    for mission in missions:
        if mission.get('owner') not in {f'A{i}' for i in range(7)}:
            raise ValueError(f"Responsable invalide : {mission['id']}")
        if not isinstance(mission.get('issue'), int) or mission['issue'] < 1:
            raise ValueError(f"Issue absente : {mission['id']}")
        if not mission.get('title') or not mission.get('priority'):
            raise ValueError(f"Contrat incomplet : {mission['id']}")
        for span in mission.get('source_ranges', []):
            if (not isinstance(span, list) or len(span) != 2
                or any(type(x) is not int for x in span)
                or not 1 <= span[0] <= span[1] <= len(lines)):
                raise ValueError(f"Plage invalide : {mission['id']} {span}")
        for entry in mission.get('inputs', []):
            if not isinstance(entry, str):
                raise ValueError('Entrée de mission non textuelle')
            if any(ref not in ids for ref in re.findall(r'\bM\d{2}\b', entry)):
                raise ValueError(f"Dépendance inconnue : {mission['id']}")
    mapped, seen = [], set()
    for line_no, line in enumerate(lines, 1):
        if not re.match(r'^- \[', line):
            continue
        match = TASK.fullmatch(line)
        if match is None:
            raise ValueError(f'Case non reconnue à la ligne {line_no}')
        checked, task_id, description = match.groups()
        if task_id in seen:
            raise ValueError(f'Identifiant source dupliqué : {task_id}')
        seen.add(task_id)
        owners = [m for m in missions if any(lo <= line_no <= hi for lo, hi in m.get('source_ranges', []))]
        if len(owners) != 1:
            raise ValueError(f'{task_id} : {len(owners)} missions propriétaires, exactement une requise')
        owner = owners[0]
        mapped.append({'task_id': task_id, 'mission_id': owner['id'], 'owner': owner['owner'],
                       'issue': owner['issue'], 'source_line': line_no, 'source_checked': checked.lower() == 'x',
                       'description': description,
                       'source_url': f"https://github.com/{registry['repository']}/blob/{registry['baseline_commit']}/{registry['source_path']}#L{line_no}"})
    if len(mapped) != registry.get('expected_source_tasks'):
        raise ValueError(f"{len(mapped)} tâches lues ; {registry.get('expected_source_tasks')} attendues")
    return mapped


def export_map(folder: Path, registry: dict, rows: list[dict]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    destinations = [folder / name for name in ('studio-task-map.json', 'studio-task-map.csv', 'coverage-report.md')]
    if any(p.exists() for p in destinations):
        raise ValueError('Export existant : choisir un nouveau dossier, ne pas écraser un registre enrichi')
    data = {'schema_version': 1, 'kind': 'affectation documentaire, pas état de réalisation',
            'baseline_commit': registry['baseline_commit'], 'source_blob_sha': registry['source_blob_sha'],
            'tasks': rows}
    with destinations[0].open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    with destinations[1].open('x', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ['task_id'])
        writer.writeheader()
        writer.writerows(rows)
    summary = ['# Couverture documentaire des missions', '',
               f"{len(registry['missions'])} missions ; {len(rows)} tâches source ; une affectation par tâche.",
               '', 'Ce résultat ne prouve ni exécution, ni conformité, ni acceptation métier.', '',
               '| Mission | Responsable | Issue | Tâches Studio |', '|---|---|---|---:|']
    for mission in registry['missions']:
        total = sum(row['mission_id'] == mission['id'] for row in rows)
        summary.append(f"| {mission['id']} | {mission['owner']} | #{mission['issue']} | {total} |")
    with destinations[2].open('x', encoding='utf-8') as stream:
        stream.write('\n'.join(summary) + '\n')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--check', action='store_true', help='Valider sans écriture (mode par défaut)')
    parser.add_argument('--export', type=Path, help='Exporter les affectations dans un dossier distinct')
    args = parser.parse_args()
    try:
        registry = json.loads((args.root / 'docs/ai-team/missions.json').read_text(encoding='utf-8'))
        if registry.get('expected_missions') != 31 or registry.get('expected_source_tasks') != 630:
            raise ValueError('Le périmètre initial 31/630 ne peut être réduit silencieusement')
        source = (args.root / registry['source_path']).read_bytes().decode('utf-8')
        catalog = (args.root / registry['catalog_path']).read_text(encoding='utf-8')
        rows = validate(registry, source, catalog)
        if args.export:
            export_map(args.export, registry, rows)
        print(f"CODEX_MISSIONS_COVERAGE_OK : {len(registry['missions'])} missions, {len(rows)}/630 tâches, aucune omission ni double affectation.")
        print('Affectation documentaire seulement ; aucune exécution métier déduite.')
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(f'CODEX_MISSIONS_COVERAGE_FAILED : {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
