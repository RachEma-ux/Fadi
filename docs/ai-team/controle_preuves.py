#!/usr/bin/env python3
"""Règles de preuve du registre Studio 630, contrôlées en CI (aucun réseau, aucune base, aucune écriture).

Règles (Checklist Studio V1.0 ; protocole `docs/continuity/README.md`, « États contrôlés ») :

- **X.5-02** — « Vérifié » (et « Accepté ») n'est attribué qu'à un résultat daté, versionné et accompagné d'une preuve
  conforme : au moins une preuve probante qui est soit un **scénario exécuté** complet (commit, URL d'exécution GitHub
  Actions ou trace versionnée, date, environnement), soit une **lecture statique justifiée** complète (fichier ou URL,
  justification, commit, date, environnement). Une tâche dont les tests sont déclarés « Exécuté » exige au moins un
  scénario exécuté complet. Ne sont jamais probants : le pointeur vers le texte de l'obligation (`source`) et toute preuve
  qui déclare elle-même ne pas démontrer la clôture (« ne démontre pas », « pas un verdict individuel » : préparations
  et qualifications de groupe des missions 002 / 003).
- **G2-04** — chaque preuve porte une étiquette `etiquette` : « lecture statique », « test prescrit » ou « scénario
  exécuté », cohérente avec ce qu'elle cite (un test ou une recette cités par libellé ne sont jamais une lecture statique ;
  « scénario exécuté » exige l'exécution complète ; « test prescrit » exige un fichier de test ou de recette).
- **PR-07** — états admis : À définir, À faire, En cours, Implémenté, Vérifié, Bloqué, Accepté. « Implémenté » = code
  produit sans preuve de succès suffisante : au moins une preuve qui cite un fichier, jamais la condition de clôture
  vérifiée, jamais compté dans P630.
- **PR-08** — statut, conformité et état des tests restent trois champs distincts et cohérents : `statut`, `conformite`,
  `tests.etat` présents ; `tests.etat` « Exécuté » ⇒ un scénario exécuté complet ; « Non exécuté » ⇒ aucun scénario
  exécuté étiqueté ; « Vérifié » ⇒ tests « Exécuté » ou « Non applicable ».
- **BLOC-07** — une non-applicabilité est motivée (`tests.portee`) et ne retire jamais une exigence essentielle du
  périmètre : jamais pour une obligation de produit (TR-*, TEST-*, NAV-*) ; une exclusion (« exclu », « hors
  pilote », « hors périmètre ») cite sa décision (DEC-, P-, ADR-) et une preuve `decision_deleguee`.

Usages :
  python3 docs/ai-team/controle_preuves.py                      # contrôle du registre ; code 1 si écart
  python3 docs/ai-team/controle_preuves.py --registre COPIE.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sys

REGISTRE = 'docs/workstreams/studio/task-register.json'
ETIQUETTES = ('lecture statique', 'test prescrit', 'scénario exécuté')
STATUTS = ('À définir', 'À faire', 'En cours', 'Implémenté', 'Bloqué', 'Vérifié', 'Accepté')
ETATS_TESTS = ('Exécuté', 'Non exécuté', 'Non applicable', 'Partiel')
# Pointeur vers le texte de l'obligation : jamais une preuve de sa clôture.
NON_PROBANTS = ('source',)
# Preuve qui déclare elle-même ne pas démontrer la clôture de l'ID (préparations et qualifications de groupe).
LIMITE_NON_PROBANTE = re.compile(r'ne démontre pas|pas un verdict individuel')
# Types qui relatent une exécution (et non une lecture) même sans fichier de test.
TYPES_EXECUTION = ('ci_non_regression', 'essais_executes')
CHAMPS_JUSTIFICATION = ('limite', 'constat', 'portee', 'nature', 'section', 'controle', 'controles', 'revue', 'decision_comment')
URL_EXECUTION = re.compile(r'^https://github\.com/[\w.-]+/[\w.-]+/actions/runs/\d+(?:/job/\d+)?$')
SHA = re.compile(r'^[0-9a-f]{40}$')
OBLIGATIONS_PRODUIT = re.compile(r'^(?:TR|TEST|NAV)-')
EXCLUSION = re.compile(r'\bexclu|hors pilote|hors périmètre', re.I)
DECISION = re.compile(r'\b(?:DEC-\d{2}|P-\d{2}|ADR-[A-Z0-9-]+)')


def est_test_ou_recette(chemin: str) -> bool:
    """Même règle que `estTestOuRecette` (apps/api/src/testing/libelles-sources.ts)."""
    return bool(re.search(r'\.test\.(?:tsx?|mjs)$', chemin) or re.match(r'^apps/web/e2e/.+\.mjs$', chemin)
                or re.match(r'^scripts/(?:.+/)?recette-[^/]+\.mjs$', chemin))


def libelles(p: dict) -> list[str]:
    out = []
    if isinstance(p.get('controle'), str):
        out.append(p['controle'])
    out += [x for x in p.get('controles', []) if isinstance(x, str)]
    if isinstance(p.get('libelle'), str):
        out.append(p['libelle'])
    return out


def cite_un_test(p: dict) -> bool:
    return bool(p.get('fichier')) and est_test_ou_recette(p['fichier'])


def url_execution(p: dict) -> str | None:
    for cle in ('url_execution', 'url'):
        if isinstance(p.get(cle), str) and URL_EXECUTION.match(p[cle]):
            return p[cle]
    return None


def etiquette_attendue(p: dict) -> str:
    """Catégorie d'une preuve avant complétion : « scénario exécuté » ne vient que d'une exécution retrouvée."""
    if p.get('type') in TYPES_EXECUTION or url_execution(p):
        return 'scénario exécuté'
    if cite_un_test(p):
        return 'test prescrit'
    return 'lecture statique'


def date_valide(v) -> bool:
    if not isinstance(v, str):
        return False
    try:
        d = dt.datetime.fromisoformat(v)
    except ValueError:
        return False
    return d.tzinfo is not None


def manques_execution(p: dict) -> list[str]:
    m = []
    if not (isinstance(p.get('commit'), str) and SHA.match(p['commit'])):
        m.append('commit (40 caractères hexadécimaux)')
    if not (url_execution(p) or (isinstance(p.get('trace'), str) and p['trace'])):
        m.append("URL d'exécution GitHub Actions ou trace versionnée")
    if not date_valide(p.get('date')):
        m.append('date ISO 8601 avec fuseau')
    if not (isinstance(p.get('environnement'), str) and p['environnement'].strip()):
        m.append('environnement')
    return m


def manques_lecture(p: dict) -> list[str]:
    m = []
    if not (p.get('fichier') or p.get('url')):
        m.append('fichier ou URL')
    if not any(p.get(c) for c in CHAMPS_JUSTIFICATION):
        m.append('justification (limite, constat, portée…)')
    if not (isinstance(p.get('commit'), str) and SHA.match(p['commit'])):
        m.append('commit (40 caractères hexadécimaux)')
    if not date_valide(p.get('date')):
        m.append('date ISO 8601 avec fuseau')
    if not (isinstance(p.get('environnement'), str) and p['environnement'].strip()):
        m.append('environnement')
    return m


def ecarts_etiquette(p: dict) -> list[str]:
    """G2-04 : étiquette présente et cohérente avec ce que la preuve cite."""
    e = p.get('etiquette')
    if e not in ETIQUETTES:
        return [f"étiquette absente ou inconnue ({e!r}) ; attendue parmi {', '.join(ETIQUETTES)}"]
    if e == 'scénario exécuté':
        m = manques_execution(p)
        return [f"« scénario exécuté » sans {', '.join(m)}"] if m else []
    if e == 'test prescrit' and not cite_un_test(p):
        return ['« test prescrit » sans fichier de test ou de recette']
    if e == 'lecture statique' and cite_un_test(p) and libelles(p):
        return ['« lecture statique » pour un test ou une recette cités par libellé (au moins « test prescrit »)']
    if e == 'lecture statique' and (p.get('type') in TYPES_EXECUTION or url_execution(p)):
        return ['« lecture statique » pour une exécution citée']
    return []


def est_probante(p: dict) -> bool:
    return p.get('type') not in NON_PROBANTS and not LIMITE_NON_PROBANTE.search(str(p.get('limite') or ''))


def preuve_conforme(p: dict) -> bool:
    if not est_probante(p):
        return False
    e = p.get('etiquette')
    if e == 'scénario exécuté':
        return not manques_execution(p)
    if e == 'lecture statique':
        return not manques_lecture(p)
    return False


def manques_verifie(t: dict) -> list[str]:
    """X.5-02 : ce qui manque à une tâche « Vérifié » / « Accepté » pour l'être (liste vide : conforme)."""
    preuves = t.get('preuves', [])
    m = []
    if not any(preuve_conforme(p) for p in preuves):
        m.append('aucune preuve conforme (scénario exécuté complet ou lecture statique justifiée, datée et versionnée)')
    if (t.get('tests') or {}).get('etat') == 'Exécuté' and not any(
            p.get('etiquette') == 'scénario exécuté' and not manques_execution(p) for p in preuves):
        m.append('tests déclarés « Exécuté » sans scénario exécuté complet')
    return m


def controler(registre: dict) -> list[str]:
    ecarts = []
    for t in registre['tasks']:
        i, s = t['id'], t.get('statut')
        tests = t.get('tests') or {}
        # PR-07 : états admis.
        if s not in STATUTS:
            ecarts.append(f'{i} : statut {s!r} hors des états {", ".join(STATUTS)} (PR-07)')
        # G2-04 : chaque preuve étiquetée.
        for k, p in enumerate(t.get('preuves', [])):
            for e in ecarts_etiquette(p):
                ecarts.append(f'{i} preuves[{k}] ({p.get("type")}) : {e} (G2-04)')
        # X.5-02.
        if s in ('Vérifié', 'Accepté'):
            for e in manques_verifie(t):
                ecarts.append(f'{i} : « {s} » — {e} (X.5-02)')
        # PR-07 : Implémenté.
        if s == 'Implémenté':
            if not any(p.get('fichier') for p in t.get('preuves', [])):
                ecarts.append(f'{i} : « Implémenté » sans preuve qui cite un fichier produit (PR-07)')
            if (t.get('cloture') or {}).get('condition_verifiee'):
                ecarts.append(f'{i} : « Implémenté » avec condition de clôture vérifiée (PR-07)')
        # PR-08 : trois champs distincts et cohérents.
        if not t.get('conformite') or 'etat' not in tests:
            ecarts.append(f'{i} : statut, conformité et état des tests doivent rester trois champs distincts (PR-08)')
        elif tests['etat'] not in ETATS_TESTS:
            ecarts.append(f"{i} : état des tests {tests['etat']!r} inconnu (PR-08)")
        executes = [p for p in t.get('preuves', []) if p.get('etiquette') == 'scénario exécuté']
        if tests.get('etat') == 'Non exécuté' and executes:
            ecarts.append(f'{i} : tests « Non exécuté » alors qu’une preuve est un scénario exécuté (PR-08)')
        if s == 'Vérifié' and tests.get('etat') not in ('Exécuté', 'Non applicable'):
            ecarts.append(f"{i} : « Vérifié » avec tests « {tests.get('etat')} » (PR-08)")
        # BLOC-07 : non-applicabilité motivée, jamais pour une obligation de produit ; exclusion décidée.
        if tests.get('etat') == 'Non applicable':
            if len((tests.get('portee') or '').strip()) < 12:
                ecarts.append(f'{i} : « Non applicable » sans motivation (tests.portee) (BLOC-07)')
            if OBLIGATIONS_PRODUIT.match(i):
                ecarts.append(f'{i} : obligation de produit déclarée « Non applicable » (BLOC-07)')
        texte = ' '.join([i] + [str(t.get(c) or '') for c in ('conformite', 'suite')])
        if s in ('Vérifié', 'Accepté') and EXCLUSION.search(texte):
            if not DECISION.search(texte) or not any(p.get('type') == 'decision_deleguee' for p in t.get('preuves', [])):
                ecarts.append(f'{i} : exclusion sans décision citée (DEC-, P-, ADR-) ni preuve decision_deleguee (BLOC-07)')
    return ecarts


def main() -> int:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    a.add_argument('--registre', type=Path)
    args = a.parse_args()
    chemin = args.registre or args.root / REGISTRE
    try:
        registre = json.loads(chemin.read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(f'REGISTRE_ILLISIBLE : {e}', file=sys.stderr)
        return 1
    ecarts = controler(registre)
    if ecarts:
        print(f'PREUVES_NON_CONFORMES : {len(ecarts)}\n- ' + '\n- '.join(ecarts[:400]), file=sys.stderr)
        if len(ecarts) > 400:
            print(f'… et {len(ecarts) - 400} autre(s).', file=sys.stderr)
        return 1
    n = sum(len(t.get('preuves', [])) for t in registre['tasks'])
    print(f'PREUVES_CONFORMES : {n} preuves étiquetées (G2-04), chaque « Vérifié » / « Accepté » a une preuve datée et versionnée (X.5-02), états PR-07 / PR-08 et non-applicabilités BLOC-07 cohérents.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
