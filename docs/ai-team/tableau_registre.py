#!/usr/bin/env python3
"""Tableau et contrôles du registre Studio 630, sans réseau, base de données ni modification applicative.

But : réduire le coût de chaque checkpoint A0 (compteurs recalculés au lieu d'être recopiés à la main,
écarts STATUS/HANDOFF/registre/index M08 détectés, delta de registre proposé par un autre agent validé
puis intégré en une commande). L'outil ne décide rien : il ne coche aucune case source, n'accepte aucune
fonctionnalité et refuse tout delta qui le prétendrait.

Usages :
  python3 docs/ai-team/tableau_registre.py                  # compteurs, P630, répartition par mission
  python3 docs/ai-team/tableau_registre.py --controle       # code 1 si registre, checkpoints ou index M08 divergent
  python3 docs/ai-team/tableau_registre.py --candidats      # tâches ouvertes à intitulé de lecture/consignation
  python3 docs/ai-team/tableau_registre.py --delta D.json   # valider un delta proposé (aucune écriture)
  python3 docs/ai-team/tableau_registre.py --delta D.json --ecrire   # l'intégrer au registre (A0 seulement)
  python3 docs/ai-team/tableau_registre.py --delta D1.json --delta D2.json --ecrire   # plusieurs deltas préparés sur le même registre
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sys

REGISTRE = 'docs/workstreams/studio/task-register.json'
INDEX_M08 = 'docs/ai-team/reports/reprise-496dcfc/M08-INDEX-A0.json'
CHECKPOINTS = ('docs/workstreams/ai-team/STATUS.md', 'docs/workstreams/ai-team/HANDOFF.md',
               'docs/workstreams/studio/STATUS.md', 'docs/workstreams/studio/HANDOFF.md')
STATUTS = ('À définir', 'En cours', 'Bloqué', 'Vérifié', 'Accepté')
# Un delta ne peut ni accepter (décision humaine) ni cocher une case source.
STATUTS_DELTA = ('À définir', 'En cours', 'Bloqué', 'Vérifié')
COMPTEURS = re.compile(r'(\d+) À définir / (\d+) En cours / (\d+) Bloqué / (\d+) Vérifié[^/]*/ (\d+) Accepté')
P630_TEXTE = re.compile(r'P630=(\d+)/630')
REVUES_M08 = re.compile(r'(\d+)/125 avec revue')
VERBES_LECTURE = ('Examiner', 'Relever', 'Conserver', 'Requalifier', 'Consigner', 'Documenter', 'Identifier',
                  'Vérifier', 'Inventorier', 'Lister', 'Rattacher', 'Distinguer')


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compteurs(registre: dict) -> collections.Counter:
    return collections.Counter(t['statut'] for t in registre['tasks'])


def ids_p630(registre: dict) -> list[str]:
    return [t['id'] for t in registre['tasks']
            if t['statut'] in ('Vérifié', 'Accepté') and t.get('cloture', {}).get('condition_verifiee') is True]


def pourcentage(n: int) -> float:
    return round(100 * n / 630, 1)


def resume(registre: dict) -> str:
    c = compteurs(registre)
    p = ids_p630(registre)
    lignes = [f"Registre : {len(registre['tasks'])} IDs ; " + ' / '.join(f'{c[s]} {s}' for s in STATUTS),
              f'P630 recalculé = {len(p)}/630 = {pourcentage(len(p))} % (statut Vérifié/Accepté et condition vérifiée)',
              'PDEV : non calculé par cet outil (dénominateur non établi).', '', '| Mission | ' + ' | '.join(STATUTS) + ' |',
              '|---|' + '---:|' * len(STATUTS)]
    par_mission = collections.defaultdict(collections.Counter)
    for t in registre['tasks']:
        par_mission[t['mission']][t['statut']] += 1
    for m in sorted(par_mission):
        lignes.append(f'| {m} | ' + ' | '.join(str(par_mission[m][s]) for s in STATUTS) + ' |')
    return '\n'.join(lignes)


def controler(racine: Path, registre: dict) -> list[str]:
    ecarts = []
    ids = [t['id'] for t in registre['tasks']]
    if len(ids) != 630 or len(set(ids)) != 630:
        ecarts.append(f'{len(ids)} entrées, {len(set(ids))} IDs distincts ; 630 attendus')
    inconnus = sorted({t['statut'] for t in registre['tasks']} - set(STATUTS))
    if inconnus:
        ecarts.append(f'statuts inconnus : {inconnus}')
    for t in registre['tasks']:
        cl = t.get('cloture', {})
        if cl.get('case_source_modifiee') or t.get('source_checked'):
            ecarts.append(f"{t['id']} : case source déclarée cochée ; vérifier la décision humaine correspondante")
        if t['statut'] == 'Accepté' and not t.get('preuves'):
            ecarts.append(f"{t['id']} : Accepté sans preuve")
    c = compteurs(registre)
    attendu = tuple(c[s] for s in STATUTS)
    p = ids_p630(registre)
    declare = registre.get('progress', {}).get('P630', {})
    if declare.get('V630') != len(p) or sorted(declare.get('IDs', [])) != sorted(p):
        manquants = sorted(set(p) - set(declare.get('IDs', [])))
        en_trop = sorted(set(declare.get('IDs', [])) - set(p))
        ecarts.append(f"progress.P630 déclaré {declare.get('V630')} ≠ recalculé {len(p)} ; manquants {manquants}, en trop {en_trop}")
    if declare.get('pourcentage') != pourcentage(len(p)):
        ecarts.append(f"progress.P630.pourcentage {declare.get('pourcentage')} ≠ {pourcentage(len(p))}")
    index = None
    chemin_index = racine / INDEX_M08
    if chemin_index.exists():
        index = json.loads(chemin_index.read_text(encoding='utf-8'))
        entrees = index.get('entries', [])
        revues = sum(1 for e in entrees if e.get('revue_independante') or e.get('historique_checkpoint496'))
        cpt = index.get('compteurs', {})
        if cpt.get('total') != len(entrees):
            ecarts.append(f"index M08 : total {cpt.get('total')} ≠ {len(entrees)} entrées")
        if cpt.get('revues_avec_historiques') != revues:
            ecarts.append(f"index M08 : revues_avec_historiques {cpt.get('revues_avec_historiques')} ≠ {revues} recalculées")
        base = chemin_index.parent
        for e in entrees:
            for cle in ('analyse', 'revue_independante'):
                if e.get(cle) and not (base / e[cle]).exists():
                    ecarts.append(f"index M08 {e['id']} : {cle} absent ({e[cle]})")
    for nom in CHECKPOINTS:
        chemin = racine / nom
        if not chemin.exists():
            ecarts.append(f'{nom} absent')
            continue
        texte = chemin.read_text(encoding='utf-8')
        trouves = {tuple(int(x) for x in m) for m in COMPTEURS.findall(texte)}
        if not trouves:
            ecarts.append(f'{nom} : phrase de compteurs « N À définir / … / N Accepté » introuvable')
        for t in sorted(trouves - {attendu}):
            ecarts.append(f'{nom} : compteurs {t} ≠ registre {attendu}')
        for v in {int(x) for x in P630_TEXTE.findall(texte)} - {len(p)}:
            ecarts.append(f'{nom} : P630={v} ≠ registre {len(p)}')
        if index is not None:
            for v in {int(x) for x in REVUES_M08.findall(texte)} - {index.get('compteurs', {}).get('revues_avec_historiques')}:
                ecarts.append(f'{nom} : {v}/125 revues ≠ index M08')
    return ecarts


def candidats(registre: dict) -> list[dict]:
    return [t for t in registre['tasks']
            if t['statut'] in ('À définir', 'En cours') and t['description'].startswith(VERBES_LECTURE)]


def valider_delta(registre: dict, delta: dict, contenu_registre: bytes) -> list[str]:
    erreurs = []
    if delta.get('schema') != 'delta-registre-v1':
        return ['schema attendu : delta-registre-v1']
    if delta.get('base_register_sha256') not in (None, sha256(contenu_registre)):
        erreurs.append('registre modifié depuis la préparation du delta : rebaser le delta, ne pas forcer')
    taches = {t['id']: t for t in registre['tasks']}
    vus = set()
    for ch in delta.get('changements', []):
        i = ch.get('id')
        if i not in taches:
            erreurs.append(f'{i} : ID inconnu (aucune création ni renumérotation par delta)')
            continue
        if i in vus:
            erreurs.append(f'{i} : présent deux fois dans le delta')
        vus.add(i)
        t = taches[i]
        if ch.get('statut_avant') != t['statut']:
            erreurs.append(f"{i} : statut_avant {ch.get('statut_avant')!r} ≠ actuel {t['statut']!r}")
        if ch.get('statut') not in STATUTS_DELTA:
            erreurs.append(f"{i} : statut {ch.get('statut')!r} refusé par delta (Accepté = décision humaine)")
        cl = ch.get('cloture', {})
        if cl.get('case_source_modifiee') or cl.get('acceptation_metier'):
            erreurs.append(f'{i} : un delta ne coche pas de case source et n’accepte pas le métier')
        if ch.get('statut') == 'Vérifié':
            if cl.get('condition_verifiee') is not True:
                erreurs.append(f'{i} : Vérifié exige cloture.condition_verifiee = true')
            if not ch.get('preuves_ajoutees'):
                erreurs.append(f'{i} : Vérifié sans preuve ajoutée')
        for p in ch.get('preuves_ajoutees', []):
            if not isinstance(p, dict) or not p.get('type') or not (p.get('fichier') or p.get('url')):
                erreurs.append(f'{i} : preuve sans type ni fichier/url')
            elif not p.get('limite'):
                erreurs.append(f'{i} : preuve sans limite déclarée')
    return erreurs


def appliquer_delta(registre: dict, delta: dict) -> dict:
    taches = {t['id']: t for t in registre['tasks']}
    for ch in delta['changements']:
        t = taches[ch['id']]
        t['historique'] = t.get('historique', []) + [{
            'origine': delta.get('origine', 'delta-registre-v1'), 'statut_precedent': t['statut'], 'statut': ch['statut'],
            'preuve': delta.get('rapport'), 'limite': ch.get('limite', 'Aucune case source cochée ; aucune acceptation produit.')}]
        t['statut'] = ch['statut']
        t['preuves'] = t.get('preuves', []) + ch.get('preuves_ajoutees', [])
        for cle in ('suite', 'conformite', 'tests', 'blocage'):
            if cle in ch:
                t[cle] = ch[cle]
        t.setdefault('cloture', {})['condition_verifiee'] = ch.get('cloture', {}).get('condition_verifiee', False)
    p = ids_p630(registre)
    p630 = registre.setdefault('progress', {}).setdefault('P630', {})
    p630.update({'V630': len(p), 'pourcentage': pourcentage(len(p)), 'IDs': p})
    c = compteurs(registre)
    if 'mapping_barre' in p630:
        p630['mapping_barre'] = {'Vérifié documentaire': c['Vérifié'], 'Accepté cadrage documentaire G0': c['Accepté']}
    return registre


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--controle', action='store_true')
    parser.add_argument('--candidats', action='store_true')
    parser.add_argument('--delta', type=Path, action='append', help='répétable : deltas appliqués dans l’ordre, tous préparés sur le registre actuel')
    parser.add_argument('--ecrire', action='store_true', help='avec --delta : écrire le registre (propriétaire A0)')
    args = parser.parse_args()
    chemin = args.root / REGISTRE
    try:
        contenu = chemin.read_bytes()
        registre = json.loads(contenu.decode('utf-8'))
        if args.delta:
            n = 0
            for fichier in args.delta:
                delta = json.loads(fichier.read_text(encoding='utf-8'))
                # Chaque delta est validé sur l'état issu des précédents ; l'empreinte reste celle du registre lu.
                erreurs = valider_delta(registre, delta, contenu)
                if erreurs:
                    print(f'DELTA_REFUSE ({fichier}) :\n- ' + '\n- '.join(erreurs), file=sys.stderr)
                    return 1
                appliquer_delta(registre, delta)
                n += len(delta['changements'])
            if not args.ecrire:
                print(f'DELTA_VALIDE : {len(args.delta)} delta(s), {n} changement(s) applicables ; rien écrit (ajouter --ecrire).')
                return 0
            chemin.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f'DELTA_APPLIQUE : {n} changement(s). Actualiser `note`, STATUS et HANDOFF puis relancer --controle.')
            print(resume(registre))
            return 0
        if args.candidats:
            for t in candidats(registre):
                print(f"{t['id']}\t{t['mission']}\t{t['agent']}\t{t['statut']}\t{t['description']}")
            print('Candidats à qualifier, pas des tâches READY : vérifier autorisation, dépendances et propriétaire.')
            return 0
        if args.controle:
            ecarts = controler(args.root, registre)
            if ecarts:
                print(f'REGISTRE_ECARTS : {len(ecarts)}\n- ' + '\n- '.join(ecarts), file=sys.stderr)
                return 1
            print('REGISTRE_COHERENT : registre, P630, index M08 et quatre checkpoints concordent.')
            return 0
        print(resume(registre))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as erreur:
        print(f'REGISTRE_ILLISIBLE : {erreur}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
