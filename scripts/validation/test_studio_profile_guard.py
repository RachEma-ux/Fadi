import unittest
from studio_profile_guard import validate_database_url


class EndpointGuardTests(unittest.TestCase):
    def setUp(self):
        self.manifest = {'host': '127.0.0.1', 'port': 54321, 'database': 'fadi_studio_v1_fixture', 'role': 'studio_app'}
        self.url = 'postgresql://studio_app:fixture-only@127.0.0.1:54321/fadi_studio_v1_fixture'

    def test_exact_endpoint_accepted(self):
        self.assertEqual(validate_database_url(self.url, self.manifest), self.url)
        self.assertEqual(validate_database_url(self.url.replace('postgresql:', 'postgres:'), self.manifest), self.url.replace('postgresql:', 'postgres:'))

    def test_mismatched_or_ambiguous_target_refused_without_disclosure(self):
        candidates = [None, '', self.url.replace('127.0.0.1', '192.0.2.1'), self.url.replace('127.0.0.1', 'localhost'), self.url.replace(':54321/', ':54322/'), self.url.replace('studio_app:', 'postgres:'), self.url.replace('/fadi_studio_v1_fixture', '/other'), self.url + '?sslmode=disable', self.url + '?', self.url + '#fragment', self.url.replace('fixture-only@', '@'), self.url.replace('postgresql:', 'https:'), self.url + '\n']
        for candidate in candidates:
            with self.subTest(candidate_type=type(candidate).__name__):
                with self.assertRaisesRegex(ValueError, '^Disposable database endpoint refused$'):
                    validate_database_url(candidate, self.manifest)

    def test_manifest_role_or_host_mismatch_refused(self):
        for field, value in [('host', '192.0.2.1'), ('role', 'postgres'), ('port', 54322), ('database', 'production')]:
            with self.assertRaises(ValueError):
                validate_database_url(self.url, {**self.manifest, field: value})


if __name__ == '__main__':
    unittest.main()
