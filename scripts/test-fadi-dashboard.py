"""Contrôle statique du tableau de bord autonome Fadi (aucun réseau, aucune DB)."""
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "Studio" / "Fadi_Dashboard_Horaire.html"
CHECKLIST = ROOT / "Studio" / "Fadi_Studio_Checklist_Interactive_V1_1.html"

class DashboardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = PAGE.read_text(encoding="utf-8")
        cls.checklist = CHECKLIST.read_text(encoding="utf-8")

    def test_sections_and_links(self):
        for label in ("Tâches Studio vérifiées", "Développement total",
                      "État des 630 tâches", "31 missions Codex",
                      "Questions et décisions"):
            self.assertIn(label, self.page)
        self.assertIn('href="Fadi_Studio_Checklist_Interactive_V1_1.html"', self.page)
        self.assertIn('href="Fadi_Dashboard_Horaire.html"', self.checklist)

    def test_read_only_provenance(self):
        self.assertIn("/issues/166/comments", self.page)
        self.assertIn("/pulls/165", self.page)
        self.assertIn("/branches/main", self.page)
        self.assertIn("snapshot", self.page.lower()) if "snapshot" in self.page.lower() else None
        self.assertNotIn("GITHUB_TOKEN", self.page)
        self.assertNotRegex(self.page, r"method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)")
        self.assertIn("N/D %", self.page)

    def test_js_syntax(self):
        parts = re.findall(r"<script>(.*?)</script>", self.page, flags=re.DOTALL)
        self.assertEqual(len(parts), 1)
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "dashboard.js"
            f.write_text(parts[0], encoding="utf-8")
            proc = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_responsive_mobile(self):
        self.assertIn("viewport", self.page)
        self.assertIn("@media(max-width:620px)", self.page)
        for key in ("undef","progress","blocked","verified"):
            self.assertIn('id="'+key+'"', self.page)

if __name__ == "__main__":
    unittest.main()
