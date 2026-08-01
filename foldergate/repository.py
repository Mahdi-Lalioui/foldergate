"""Turn a local path or GitHub URL into a directory that can be scanned safely."""

from __future__ import annotations

import os
import subprocess
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import unquote, urlsplit


class RepositoryError(ValueError):
    """The supplied repository could not be materialized for scanning."""


def _github_clone_url(value: str) -> str:
    parsed = urlsplit(value)
    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or len(parts) != 2
        or any(part in {".", ".."} for part in parts)
    ):
        raise RepositoryError(
            "Enter a local directory or an HTTPS GitHub repository URL "
            "such as https://github.com/org/repo"
        )
    owner, repository = parts
    repository = repository.removesuffix(".git")
    if not owner or not repository:
        raise RepositoryError("Enter a complete GitHub repository URL")
    return f"https://github.com/{owner}/{repository}.git"


@contextmanager
def materialize_repository(source: str) -> Iterator[Path]:
    """Yield a scan-ready directory for a local path or HTTPS GitHub URL.

    Remote repositories are shallow-cloned without credentials, hooks, global Git
    configuration, tags, or submodules, then deleted immediately after the caller exits.
    """

    value = source.strip()
    if not value:
        raise RepositoryError("Enter a repository URL or local directory")

    looks_remote = "://" in value or value.startswith("git@")
    if not looks_remote:
        path = Path(value).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"repository path does not exist: {path}")
        if not path.is_dir():
            raise NotADirectoryError(f"repository path is not a directory: {path}")
        yield path
        return

    clone_url = _github_clone_url(value)
    with tempfile.TemporaryDirectory(prefix="foldergate-") as temporary:
        destination = Path(temporary) / "repository"
        environment = os.environ.copy()
        environment.update(
            {
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0",
            }
        )
        command = [
            "git",
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--no-tags",
            "--config",
            "core.hooksPath=/dev/null",
            "--config",
            "submodule.recurse=false",
            "--",
            clone_url,
            str(destination),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
                env=environment,
            )
        except FileNotFoundError as error:
            raise RepositoryError("Git is required to scan a repository URL") from error
        except subprocess.TimeoutExpired as error:
            raise RepositoryError("The repository clone timed out after 60 seconds") from error
        except subprocess.CalledProcessError as error:
            detail = (error.stderr or "").strip().splitlines()
            reason = detail[-1] if detail else "Git could not clone the repository"
            raise RepositoryError(reason) from error

        yield destination
