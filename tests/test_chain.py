"""The model is advisory. These tests prove the demo survives without it."""

from pathlib import Path

from foldergate.chain import analyse, deterministic_chain
from foldergate.contract import ScanReport
from foldergate.scanner import scan

TRAPPED = Path(__file__).parent.parent / "fixtures" / "demo-trapped"


def _report() -> ScanReport:
    return ScanReport(repo_url=str(TRAPPED), findings=scan(TRAPPED))


def test_verdict_follows_findings():
    assert analyse(_report(), use_ai=False).verdict == "quarantined"
    assert analyse(ScanReport(), use_ai=False).verdict == "clean"


def test_deterministic_chain_names_every_vector():
    chain = deterministic_chain(scan(TRAPPED))
    for fragment in ("cannot see", "tools", "opened", "shadows"):
        assert fragment in chain, chain
    assert "zero clicks" in chain


def test_deterministic_chain_cites_real_files():
    chain = deterministic_chain(scan(TRAPPED))
    assert ".cursorrules" in chain
    assert ".vscode/tasks.json" in chain


def test_chain_preserves_filename_casing():
    """CLAUDE.md must not render as claude.md -- str.capitalize() lowercases the rest."""
    assert "CLAUDE.md" in deterministic_chain(scan(TRAPPED))


def test_every_finding_gets_an_explanation():
    """A blank cell in the findings table looks broken on stage."""
    report = analyse(_report(), use_ai=False)
    assert all(f.explanation for f in report.findings)


def test_clean_report_says_so():
    assert "No autorun" in analyse(ScanReport(), use_ai=False).kill_chain


def test_missing_api_key_falls_back(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    report = analyse(_report(), use_ai=True)
    assert report.kill_chain
    assert "deterministic summary" in report.kill_chain


def test_llm_failure_falls_back(monkeypatch):
    """A rate limit or dead network must degrade to prose, not an exception."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-not-a-real-key")

    import openai

    def boom(*args, **kwargs):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(openai, "OpenAI", boom)
    report = analyse(_report(), use_ai=True)
    assert report.verdict == "quarantined"
    assert "zero clicks" in report.kill_chain


def test_garbage_model_output_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-not-a-real-key")

    class FakeClient:
        def __init__(self, *a, **k):
            self.chat = self

        @property
        def completions(self):
            return self

        def create(self, **kwargs):
            class Msg:
                content = '{"kill_chain": ""}'

            class Choice:
                message = Msg()

            class Result:
                choices = [Choice()]

            return Result()

    import openai

    monkeypatch.setattr(openai, "OpenAI", FakeClient)
    report = analyse(_report(), use_ai=True)
    assert "zero clicks" in report.kill_chain
