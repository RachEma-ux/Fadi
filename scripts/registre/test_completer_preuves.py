"""Tests de completer_preuves.py : reconnaissance d'un job qui a tourné sur la base attestée (DB-3)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import completer_preuves as cp  # noqa: E402


class Db3Actif(unittest.TestCase):
    def test_verdict_db3_actif_en_sortie_reconnu(self):
        journal = ("2026-10-26T09:51:50.8384417Z API : 1257 test(s) réussis, dont 180 dans les 17 suites DB-3, sur base jetable attestée.\n"
                   "2026-10-26T09:51:50.8386026Z ✓ DB-3 actif : toutes les suites API tournent sur la base attestée, aucune n'est refusée.\n")
        self.assertTrue(cp.db3_actif(journal))

    def test_echo_du_script_ou_garde_fermee_refuses(self):
        echo = "2026-10-26T09:41:20.7857469Z \x1b[36;1m  node scripts/check-api-tests-db3.mjs --db3-actif api-vitest.json\x1b[0m\n"
        fermee = "2026-10-26T09:41:21Z DB-3 non exécuté : secret FADI_TEST_DB_SIGNING_KEY absent (PR d'un fork, ou clé non installée).\n"
        self.assertFalse(cp.db3_actif(echo + fermee))
        self.assertFalse(cp.db3_actif(None))
        self.assertFalse(cp.db3_actif(""))


if __name__ == "__main__":
    unittest.main()
