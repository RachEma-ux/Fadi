import tempfile
from pathlib import Path
import unittest
import check_missions as cm


class MissionCoverageTests(unittest.TestCase):
    def setUp(self):
        self.source = '# Fixture\n- [ ] **SRC-01** — Lire la source.\n- [ ] **TEST-001** — Tester sans base réelle.\n'
        self.catalog = '## M00 — Coordination\n## M01 — Test\n'
        self.registry = {'schema_version': 1, 'source_blob_sha': cm.git_blob(self.source.encode()),
            'expected_missions': 2, 'expected_source_tasks': 2, 'repository': 'example/repo',
            'baseline_commit': 'a'*40, 'source_path': 'fixture.md',
            'missions': [{'id':'M00','owner':'A0','issue':1,'title':'Coordination','priority':'P1','source_ranges':[[2,2]],'inputs':[]},
                         {'id':'M01','owner':'A5','issue':2,'title':'Test','priority':'P1','source_ranges':[[3,3]],'inputs':['M00:source']} ]}

    def test_complete(self):
        self.assertEqual([x['task_id'] for x in cm.validate(self.registry, self.source, self.catalog)], ['SRC-01','TEST-001'])

    def test_missing_owner(self):
        self.registry['missions'][1]['source_ranges']=[]
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_double_owner(self):
        self.registry['missions'][0]['source_ranges']=[[2,3]]
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_source_drift(self):
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source.replace('source.','autre.'),self.catalog)

    def test_checked_does_not_change_identity(self):
        rows=cm.validate(self.registry,self.source.replace('[ ]','[x]',1),self.catalog)
        self.assertTrue(rows[0]['source_checked'])

    def test_duplicate_mission(self):
        self.registry['missions'][1]['id']='M00'
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_missing_catalog_contract(self):
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,'## M00 — Seul\n')

    def test_invalid_range(self):
        self.registry['missions'][1]['source_ranges']=[[3,200]]
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_invalid_role(self):
        self.registry['missions'][1]['owner']='A99'
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_count(self):
        self.registry['expected_source_tasks']=3
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_unknown_dependency(self):
        self.registry['missions'][1]['inputs']=['M99:absent']
        with self.assertRaises(ValueError): cm.validate(self.registry,self.source,self.catalog)

    def test_duplicate_source_id(self):
        source=self.source.replace('TEST-001','SRC-01')
        self.registry['source_blob_sha']=cm.git_blob(source.encode())
        with self.assertRaises(ValueError): cm.validate(self.registry,source,self.catalog)

    def test_export_refuses_overwrite(self):
        rows=cm.validate(self.registry,self.source,self.catalog)
        with tempfile.TemporaryDirectory() as tmp:
            cm.export_map(Path(tmp),self.registry,rows)
            with self.assertRaises(ValueError): cm.export_map(Path(tmp),self.registry,rows)

    def test_malformed_task(self):
        source=self.source.replace('**TEST-001**','TEST-001')
        self.registry['source_blob_sha']=cm.git_blob(source.encode())
        with self.assertRaises(ValueError): cm.validate(self.registry,source,self.catalog)


if __name__ == '__main__':
    unittest.main()
