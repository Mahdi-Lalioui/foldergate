from pathlib import Path
from subprocess import CompletedProcess

import pytest

from foldergate.repository import materialize_repository


def test_local_repository_is_used_without_cloning(tmp_path):
    with materialize_repository(str(tmp_path)) as repository:
        assert repository == tmp_path


def test_github_url_is_cloned_to_a_temporary_directory(monkeypatch):
    calls: list[tuple[list[str], dict[str, str]]] = []

    def fake_run(command, *, check, capture_output, text, timeout, env):
        calls.append((command, env))
        Path(command[-1]).mkdir()
        Path(command[-1], ".cursorrules").write_text("safe", encoding="utf-8")
        return CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("foldergate.repository.subprocess.run", fake_run)

    with materialize_repository("https://github.com/example/project") as repository:
        assert (repository / ".cursorrules").read_text(encoding="utf-8") == "safe"
        assert repository.is_dir()

    assert not repository.exists()
    command, environment = calls[0]
    assert command[:2] == ["git", "clone"]
    assert "--depth" in command
    assert command[-2] == "https://github.com/example/project.git"
    assert environment["GIT_CONFIG_GLOBAL"] == "/dev/null"
    assert environment["GIT_CONFIG_NOSYSTEM"] == "1"


@pytest.mark.parametrize(
    "url",
    [
        "https://gitlab.com/example/project",
        "https://github.com/example",
        "https://user@github.com/example/project",
        "git@github.com:example/project.git",
    ],
)
def test_remote_repository_rejects_unsupported_or_unsafe_urls(url):
    with pytest.raises(ValueError, match="GitHub repository URL"):
        with materialize_repository(url):
            pass
