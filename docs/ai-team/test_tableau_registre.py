import copy
import json
from pathlib import Path
import tempfile
import unittest
import tableau_registre as tr


def tache(i, statut='À définir', verifiee=False, description='Examiner un fichier.'):
    return {'id': i, 'mission': 'M13', 'agent': 'A2', 'description': description, 'statut': statut,
            'preuves': [{'type': 'source'}] if statut in ('Vérifié', 'Accepté') else [],
            'cloture': {'condition_verifiee': verifiee, 'case_source_modifiee': False, 'acceptation_metier': False}}


class RegistreTests(unittest.TestCase):
    def setUp(self):
        taches = [tache(f'T-{n:03d}') for n in range(630)]
        taches[0] = tache('T-000', 'Vérifié', True)
        taches[1] = tache('T-001', 'Accepté', True)
        taches[2] = tache('T-002', 'Bloqué', description='Implémenter un lot.')
        self.registre = {'tasks': taches, 'progress': {'P630': {'V630': 2, 'pourcentage': 0.3, 'IDs': ['T-000', 'T-001'],
                         'mapping_barre': {'Vérifié documentaire': 1, 'Accepté cadrage documentaire G0': 1}}}}
        self.dossier = tempfile.TemporaryDirectory()
        self.racine = Path(self.dossier.name)
        phrase = '627 À définir / 0 En cours / 1 Bloqué / 1 Vérifié documentaire / 1 Accepté cadrage, P630=2/630\n'
        for nom in tr.CHECKPOINTS:
            (self.racine / nom).parent.mkdir(parents=True, exist_ok=True)
            (self.racine / nom).write_text(phrase, encoding='utf-8')

    def tearDown(self):
        self.dossier.cleanup()

    def delta(self, **champ):
        ch = {'id': 'T-003', 'statut_avant': 'À définir', 'statut': 'Vérifié', 'cloture': {'condition_verifiee': True},
              'preuves_ajoutees': [{'type': 'lecture_statique', 'fichier': 'r.md', 'limite': 'Lecture seule'}]}
        ch.update(champ)
        return {'schema': 'delta-registre-v1', 'changements': [ch]}

    def test_controle_coherent(self):
        self.assertEqual(tr.controler(self.racine, self.registre), [])

    def test_a_faire_est_un_statut_de_continuite_sans_promouvoir_la_tache(self):
        self.registre['tasks'][3]['statut'] = 'À faire'
        phrase = '626 À définir / 1 À faire / 0 En cours / 1 Bloqué / 1 Vérifié / 1 Accepté, P630=2/630\n'
        for nom in tr.CHECKPOINTS:
            (self.racine / nom).write_text(phrase, encoding='utf-8')
        self.assertEqual(tr.controler(self.racine, self.registre), [])
        self.assertEqual(tr.ids_p630(self.registre), ['T-000', 'T-001'])

    def test_candidats_inclut_les_taches_a_faire(self):
        self.registre['tasks'][3]['statut'] = 'À faire'
        self.assertIn('T-003', [t['id'] for t in tr.candidats(self.registre)])

    def test_delta_peut_assigner_a_faire_sans_cloture(self):
        delta = self.delta(statut='À faire', cloture={'condition_verifiee': False})
        self.assertEqual(tr.valider_delta(self.registre, delta, b''), [])
        tr.appliquer_delta(self.registre, delta)
        self.assertEqual(self.registre['tasks'][3]['statut'], 'À faire')
        self.assertEqual(self.registre['progress']['P630']['V630'], 2)

    def test_checkpoint_divergent(self):
        (self.racine / tr.CHECKPOINTS[1]).write_text('628 À définir / 0 En cours / 0 Bloqué / 1 Vérifié / 1 Accepté, P630=3/630', encoding='utf-8')
        ecarts = tr.controler(self.racine, self.registre)
        self.assertTrue(any('compteurs' in e for e in ecarts))
        self.assertTrue(any('P630=3' in e for e in ecarts))

    def test_p630_declare_divergent(self):
        self.registre['progress']['P630']['IDs'] = ['T-000']
        self.assertTrue(any('manquants' in e for e in tr.controler(self.racine, self.registre)))

    def test_verifie_sans_condition_hors_p630(self):
        self.registre['tasks'][0]['cloture']['condition_verifiee'] = False
        self.assertEqual(tr.ids_p630(self.registre), ['T-001'])

    def test_case_source_cochee_signalee(self):
        self.registre['tasks'][5]['cloture']['case_source_modifiee'] = True
        self.assertTrue(any('case source' in e for e in tr.controler(self.racine, self.registre)))

    def test_candidats_lecture(self):
        ids = [t['id'] for t in tr.candidats(self.registre)]
        self.assertNotIn('T-002', ids)
        self.assertNotIn('T-000', ids)
        self.assertIn('T-003', ids)

    def test_delta_valide_et_applique(self):
        self.assertEqual(tr.valider_delta(self.registre, self.delta(), b''), [])
        r = tr.appliquer_delta(copy.deepcopy(self.registre), self.delta())
        t = next(x for x in r['tasks'] if x['id'] == 'T-003')
        self.assertEqual(t['statut'], 'Vérifié')
        self.assertEqual(t['historique'][-1]['statut_precedent'], 'À définir')
        self.assertEqual(r['progress']['P630']['V630'], 3)
        self.assertEqual(r['progress']['P630']['mapping_barre']['Vérifié documentaire'], 2)
        self.assertFalse(t['cloture']['case_source_modifiee'])

    def test_delta_refuse_acceptation(self):
        self.assertTrue(tr.valider_delta(self.registre, self.delta(statut='Accepté'), b''))
        self.assertTrue(tr.valider_delta(self.registre, self.delta(cloture={'condition_verifiee': True, 'acceptation_metier': True}), b''))

    def test_delta_refuse_concurrence(self):
        self.assertTrue(tr.valider_delta(self.registre, self.delta(statut_avant='En cours'), b''))
        d = self.delta()
        d['base_register_sha256'] = '0' * 64
        self.assertTrue(any('rebaser' in e for e in tr.valider_delta(self.registre, d, b'x')))

    def test_delta_refuse_id_inconnu_et_preuve_sans_limite(self):
        self.assertTrue(tr.valider_delta(self.registre, self.delta(id='NOUVEAU-01'), b''))
        self.assertTrue(tr.valider_delta(self.registre, self.delta(preuves_ajoutees=[{'type': 'x', 'fichier': 'r.md'}]), b''))
        self.assertTrue(tr.valider_delta(self.registre, self.delta(preuves_ajoutees=[]), b''))

    def test_deux_deltas_disjoints_enchaines(self):
        d1, d2 = self.delta(), self.delta(id='T-004')
        r = copy.deepcopy(self.registre)
        for d in (d1, d2):
            self.assertEqual(tr.valider_delta(r, d, b''), [])
            tr.appliquer_delta(r, d)
        self.assertEqual(r['progress']['P630']['V630'], 4)
        self.assertTrue(tr.valider_delta(r, self.delta(), b''))  # même ID rejoué : statut_avant périmé

    def test_index_m08(self):
        dossier = self.racine / Path(tr.INDEX_M08).parent
        dossier.mkdir(parents=True)
        (dossier / 'a.json').write_text('{}', encoding='utf-8')
        index = {'compteurs': {'total': 2, 'revues_avec_historiques': 1},
                 'entries': [{'id': 'E1', 'analyse': 'a.json', 'revue_independante': 'a.json'},
                             {'id': 'E2', 'analyse': 'absent.json', 'revue_independante': None}]}
        (self.racine / tr.INDEX_M08).write_text(json.dumps(index), encoding='utf-8')
        ecarts = tr.controler(self.racine, self.registre)
        self.assertEqual([e for e in ecarts if 'M08' in e], ['index M08 E2 : analyse absent (absent.json)'])


if __name__ == '__main__':
    unittest.main()
