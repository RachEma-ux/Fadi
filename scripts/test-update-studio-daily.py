"""Tests hors réseau du suivi HTML Studio."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("studio_daily", ROOT / "scripts/update-studio-daily.py")
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)

class DailyChecklistTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=daily.HTML_PATH.read_text(encoding="utf-8")
        cls.ids=daily.task_ids(cls.source)

    def test_630_ids_and_three_reviews(self):
        self.assertEqual(len(self.ids),630)
        for field in ("codeDone","chatgptReviewed","adminReviewed","localStorage"):
            self.assertIn(field,self.source)

    def test_progress_report_is_not_proof(self):
        comments=[{"created_at":"2026-10-18T09:30:00Z","html_url":daily.ISSUE,
            "body":"[CODEX-ACK]\n[CODEX-PROGRESS]\nPDEV : N/D ; P630 :6/630=1,0 %"},
            {"created_at":"2026-10-18T09:35:00Z","html_url":daily.ISSUE,
            "body":"[CODEX-QUESTION][Q-TEST][OPEN] demande"}]
        p={"comments":comments,"main_sha":"a"*40,"pr_sha":"b"*40,"github_status":"ok"}
        s=daily.parse_data(p,self.ids,"2026-10-18T10:00:00Z")
        self.assertEqual(s["progress"]["p630_reported_by_codex"],6)
        self.assertIsNone(s["progress"]["p630_verified"])
        self.assertIsNone(s["progress"]["pdev_verified"])
        self.assertEqual(s["questions"]["unanswered"],["Q-TEST"])

    def test_answer_does_not_close_owner_decision(self):
        comments=[
            {"created_at":"2026-10-18T09:00:00Z","html_url":daily.ISSUE,
             "body":"[CODEX-QUESTION][Q-D07][OPEN] accord de l'administrateur ?"},
            {"created_at":"2026-10-18T09:10:00Z","html_url":daily.ISSUE,
             "body":"[CHATGPT-ANSWER][Q-D07] Recommandation documentée. [NEEDS-USER-DECISION] pour l'accord."}
        ]
        p={"comments":comments,"main_sha":None,"pr_sha":None,"github_status":"ok"}
        state=daily.parse_data(p,self.ids,"2026-10-18T10:00:00Z")
        self.assertEqual(state["questions"]["unanswered_count"],0)
        self.assertEqual(state["questions"]["answered_count"],1)
        self.assertEqual(state["questions"]["owner_decision_pending"],["Q-D07"])
        self.assertEqual(state["questions"]["owner_decision_pending_count"],1)
        self.assertIn("Décisions utilisateur encore nécessaires",daily.update_html(self.source,state))

    def test_chatgpt_delegated_decision_is_answered_but_not_proof(self):
        comments=[
            {"created_at":"2026-10-18T09:00:00Z","html_url":daily.ISSUE,
             "body":"[CODEX-QUESTION][Q-D03][OPEN] demande de lot DB"},
            {"created_at":"2026-10-18T09:10:00Z","html_url":daily.ISSUE,
             "body":"[CHATGPT-DECISION][Q-D03] Lot borné, sans DB réelle."}
        ]
        p={"comments":comments,"main_sha":None,"pr_sha":None,"github_status":"ok"}
        state=daily.parse_data(p,self.ids,"2026-10-18T10:00:00Z")
        self.assertEqual(state["questions"]["unanswered_count"],0)
        self.assertEqual(state["questions"]["delegated_decision_count"],1)
        self.assertEqual(state["questions"]["delegated_decision_ids"],["Q-D03"])
        self.assertIsNone(state["progress"]["pdev_verified"])
        self.assertIsNone(state["progress"]["p630_verified"])

    def test_untrusted_link_rejected(self):
        test_id=sorted(self.ids)[0]
        p={"comments":[{"created_at":"2026-10-18T09:30:00Z","html_url":daily.ISSUE,
            "body":'[STUDIO-TASK-STATUS] {"id":"'+test_id+'","stage":"code","proof_url":"javascript:alert(1)"}'}],
            "main_sha":None,"pr_sha":None,"github_status":"ok"}
        s=daily.parse_data(p,self.ids,"2026-10-18T10:00:00Z")
        self.assertEqual(s["task_signals"],[])
        self.assertNotIn("javascript:alert(1)",daily.update_html(self.source,s))

    def test_idempotence_and_local_data_preserved(self):
        s=daily.parse_data(daily.collect(offline=True),self.ids,"2026-10-18T10:00:00Z")
        once=daily.update_html(self.source,s)
        twice=daily.update_html(once,s)
        self.assertEqual(once.count(daily.START),1)
        self.assertEqual(twice.count(daily.START),1)
        self.assertEqual(len(daily.task_ids(twice)),630)
        for t in ("const STORE=","chatgptReviewed","adminReviewed","codeDone"):
            self.assertEqual(once.count(t),self.source.count(t))

if __name__=="__main__":
    unittest.main()
