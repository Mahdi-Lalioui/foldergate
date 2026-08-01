"""Emulation must degrade, never crash.

Every test here runs without Modal and without network -- the offline path is the
demo fallback, so it is the path that has to be provably reliable.
"""

from foldergate.contract import Emulation
from foldergate.emulate import _looks_like_blocked_egress, emulate, replay

TRAPPED = "fixtures/demo-trapped"
CLEAN = "fixtures/demo-clean"


def test_offline_replay_reports_the_payload():
    result = emulate(TRAPPED, offline=True)
    assert result.ran is True
    assert "PWNED.txt" in result.files_written
    assert result.processes


def test_offline_replay_shape_matches_contract():
    """--offline must return an identically-shaped payload to a live run."""
    result = emulate(TRAPPED, offline=True)
    assert set(result.model_dump()) == set(Emulation().model_dump())


def test_offline_clean_repo_is_quiet():
    result = emulate(CLEAN, offline=True)
    assert result.files_written == []
    assert result.network_attempts == []


def test_unknown_repo_degrades_instead_of_raising():
    result = replay("fixtures/no-such-repo")
    assert result.ran is False
    assert "no recorded trace" in result.reason


def test_repo_with_no_triggers_still_reports_ran(tmp_path):
    """An empty repo is a successful emulation with nothing to do, not a failure."""
    result = emulate(tmp_path)
    assert result.ran is True
    assert result.files_written == []


def test_sandbox_failure_degrades_instead_of_raising(monkeypatch):
    """A dead sandbox must never take the page down with it.

    The UI's TracePanel has an explicit "unavailable" state; an exception here would
    break the whole scan result instead of just the trace.
    """
    import sys
    import types

    fake = types.ModuleType("modal")

    def boom(*a, **kw):
        raise RuntimeError("modal is having a bad day")

    fake.App = types.SimpleNamespace(lookup=boom)
    monkeypatch.setitem(sys.modules, "modal", fake)

    result = emulate(TRAPPED)
    assert result.ran is False
    assert "bad day" in result.reason
    # Even on failure we still report what we WOULD have run.
    assert result.triggers_extracted


def test_missing_modal_points_at_the_fix(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def no_modal(name, *args, **kwargs):
        if name == "modal":
            raise ImportError("No module named 'modal'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_modal)

    result = emulate(TRAPPED)
    assert result.ran is False
    assert "--offline" in result.reason


def test_blocked_egress_detection():
    assert _looks_like_blocked_egress("curl: (6) Could not resolve host: evil.com")
    assert _looks_like_blocked_egress("connect: Network is unreachable")
    assert not _looks_like_blocked_egress("[collect.sh] ran")
