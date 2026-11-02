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
  python3 docs/ai-team/tableau_registre.py --corrections C.json [--ecrire]   # corrections de preuves (corrections-registre-v1)

États (PR-07, `docs/continuity/README.md`) : À définir, À faire, En cours, Implémenté (code produit sans preuve de succès
suffisante), Bloqué, Vérifié, Accepté. « Implémenté » n'est jamais compté dans P630.
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
STATUTS_OUVERTS = ('À définir', 'À faire', 'En cours', 'Implémenté')
STATUTS = (*STATUTS_OUVERTS, 'Bloqué', 'Vérifié', 'Accepté')
# Un delta ne peut ni accepter (décision humaine) ni cocher une case source.
STATUTS_DELTA = STATUTS[:-1]
COMPTEURS = re.compile(r'(\d+) À définir / (?:(\d+) À faire / )?(\d+) En cours / (?:(\d+) Implémenté / )?(\d+) Bloqué / (\d+) Vérifié[^/]*/ (\d+) Accepté')
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
        trouves = {tuple(int(x or 0) for x in m) for m in COMPTEURS.findall(texte)}
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
            if t['statut'] in STATUTS_OUVERTS and t['description'].startswith(VERBES_LECTURE)]


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


# Corrections de preuves (X.5-02, G2-04) : n'ajoutent que des champs absents d'une preuve identifiée par son empreinte,
# ne font que retirer « Vérifié » (jamais promouvoir), et recalculent P630.
CHAMPS_CORRECTION = ('etiquette', 'commit', 'url_execution', 'date', 'environnement', 'methode', 'trace')
STATUTS_CORRECTION = ('Implémenté', 'En cours')


def empreinte_preuve(p: dict) -> str:
    return sha256(json.dumps(p, ensure_ascii=False, sort_keys=True).encode('utf-8'))


def rang_preuve(t: dict, c: dict) -> int | None:
    """Rang de la preuve visée : au rang indiqué si son empreinte concorde, sinon l'unique preuve de même empreinte
    (des preuves ont pu être ajoutées entre-temps) ; None si elle a changé ou est ambiguë."""
    preuves = t.get('preuves', [])
    k = c.get('index')
    if isinstance(k, int) and 0 <= k < len(preuves) and empreinte_preuve(preuves[k]) == c.get('empreinte_preuve'):
        return k
    rangs = [j for j, p in enumerate(preuves) if empreinte_preuve(p) == c.get('empreinte_preuve')]
    return rangs[0] if len(rangs) == 1 else None


def valider_corrections(registre: dict, corr: dict, contenu_registre: bytes) -> list[str]:
    if corr.get('schema') != 'corrections-registre-v1':
        return ['schema attendu : corrections-registre-v1']
    # Le registre a pu recevoir d'autres changements depuis la préparation : chaque correction reste contrôlée sur sa
    # cible (empreinte de la preuve, statut ou état de tests d'avant) ; la base n'est qu'un avertissement (main()).
    erreurs = []
    taches = {t['id']: t for t in registre['tasks']}
    vus = set()
    for c in corr.get('preuves', []):
        i, k = c.get('id'), c.get('index')
        t = taches.get(i)
        k = rang_preuve(t, c) if t is not None else None
        if k is None:
            erreurs.append(f"{i} preuves[{c.get('index')}] : preuve inconnue, ou changée depuis la préparation (empreinte)")
            continue
        if (i, k) in vus:
            erreurs.append(f'{i} preuves[{k}] : corrigée deux fois')
        vus.add((i, k))
        p = t['preuves'][k]
        for cle in c.get('ajouts', {}):
            if cle not in CHAMPS_CORRECTION:
                erreurs.append(f'{i} preuves[{k}] : champ {cle!r} non admis par une correction')
            elif cle in p:
                erreurs.append(f'{i} preuves[{k}] : {cle!r} existe déjà (une correction ne remplace jamais une valeur)')
    for c in corr.get('statuts', []):
        t = taches.get(c.get('id'))
        if t is None:
            erreurs.append(f"{c.get('id')} : ID inconnu")
            continue
        if c.get('statut_avant') != t['statut']:
            erreurs.append(f"{t['id']} : statut_avant {c.get('statut_avant')!r} ≠ actuel {t['statut']!r}")
        if c.get('statut') not in STATUTS_CORRECTION or t['statut'] != 'Vérifié':
            erreurs.append(f"{t['id']} : une correction ne fait que retirer « Vérifié » (vers {' ou '.join(STATUTS_CORRECTION)})")
        if not c.get('raison') or not c.get('suite'):
            erreurs.append(f"{t['id']} : descente sans raison ni suite")
    for c in corr.get('tests', []):
        t = taches.get(c.get('id'))
        if t is None:
            erreurs.append(f"{c.get('id')} : ID inconnu")
        elif c.get('tests_avant') != t.get('tests') or not isinstance(c.get('tests'), dict) or not c['tests'].get('portee'):
            erreurs.append(f"{t['id']} : tests_avant différent de l'état actuel, ou nouvel état sans portée")
    return erreurs


def appliquer_corrections(registre: dict, corr: dict) -> dict:
    taches = {t['id']: t for t in registre['tasks']}
    for c in corr.get('preuves', []):
        t = taches[c['id']]
        t['preuves'][rang_preuve(t, c)].update(c['ajouts'])
    for c in corr.get('tests', []):
        t = taches[c['id']]
        t['historique'] = t.get('historique', []) + [{'origine': corr.get('origine', 'corrections-registre-v1'),
                                                      'tests_precedent': t.get('tests'), 'tests': c['tests'], 'limite': c.get('raison', '')}]
        t['tests'] = c['tests']
    for c in corr.get('statuts', []):
        t = taches[c['id']]
        t['historique'] = t.get('historique', []) + [{
            'origine': corr.get('origine', 'corrections-registre-v1'), 'statut_precedent': t['statut'], 'statut': c['statut'],
            'limite': c['raison']}]
        t['statut'] = c['statut']
        t['suite'] = c['suite']
        t.setdefault('cloture', {})['condition_verifiee'] = False
        if 'tests' in c:
            t['tests'] = c['tests']
    p = ids_p630(registre)
    p630 = registre.setdefault('progress', {}).setdefault('P630', {})
    p630.update({'V630': len(p), 'pourcentage': pourcentage(len(p)), 'IDs': p})
    cpt = compteurs(registre)
    if 'mapping_barre' in p630:
        p630['mapping_barre'] = {'Vérifié documentaire': cpt['Vérifié'], 'Accepté cadrage documentaire G0': cpt['Accepté']}
    return registre


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--controle', action='store_true')
    parser.add_argument('--candidats', action='store_true')
    parser.add_argument('--delta', type=Path, action='append', help='répétable : deltas appliqués dans l’ordre, tous préparés sur le registre actuel')
    parser.add_argument('--corrections', type=Path, help='corrections de preuves (corrections-registre-v1) à valider, ou à écrire avec --ecrire')
    parser.add_argument('--ecrire', action='store_true', help='avec --delta ou --corrections : écrire le registre (propriétaire A0)')
    args = parser.parse_args()
    chemin = args.root / REGISTRE
    try:
        contenu = chemin.read_bytes()
        registre = json.loads(contenu.decode('utf-8'))
        if args.corrections:
            corr = json.loads(args.corrections.read_text(encoding='utf-8'))
            if corr.get('base_register_sha256') != sha256(contenu):
                print('AVERTISSEMENT : registre modifié depuis la préparation des corrections ; chaque correction est contrôlée sur sa cible.', file=sys.stderr)
            erreurs = valider_corrections(registre, corr, contenu)
            if erreurs:
                print(f'CORRECTIONS_REFUSEES ({args.corrections}) :\n- ' + '\n- '.join(erreurs[:200]), file=sys.stderr)
                return 1
            appliquer_corrections(registre, corr)
            n = (len(corr.get('preuves', [])), len(corr.get('statuts', [])), len(corr.get('tests', [])))
            if not args.ecrire:
                print(f'CORRECTIONS_VALIDES : {n[0]} preuve(s), {n[1]} statut(s), {n[2]} état(s) de tests ; rien écrit (ajouter --ecrire).')
                return 0
            chemin.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f'CORRECTIONS_APPLIQUEES : {n[0]} preuve(s), {n[1]} statut(s), {n[2]} état(s) de tests. Actualiser `note`, STATUS et HANDOFF puis relancer --controle.')
            print(resume(registre))
            return 0
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
