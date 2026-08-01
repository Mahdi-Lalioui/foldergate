"""Detect PATH-shadowing names and executable-looking files planted in a repo."""

import os
import stat
from pathlib import Path

from foldergate.contract import Finding
from foldergate.scanner._shared import relative_name

SHADOWED_COMMANDS = frozenset({"git", "node", "npm", "python"})
EXECUTABLE_EXTENSIONS = frozenset({".exe", ".bat", ".cmd", ".sh", ".ps1"})
IGNORED_DIRECTORIES = frozenset({".git", ".venv", "node_modules", "__pycache__"})


def _repo_files(root: Path):
    for directory, child_directories, files in os.walk(root, followlinks=False):
        child_directories[:] = [
            name for name in child_directories if name not in IGNORED_DIRECTORIES
        ]
        base = Path(directory)
        for name in files:
            yield base / name


def _mode(path: Path) -> str:
    try:
        return oct(stat.S_IMODE(path.stat().st_mode))
    except OSError:
        return "unknown"


def scan_binaries(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    primary_paths: set[Path] = set()

    for name in sorted(SHADOWED_COMMANDS):
        path = root / name
        if not (path.is_file() or path.is_symlink()) or not os.access(path, os.X_OK):
            continue
        primary_paths.add(path)
        findings.append(
            Finding(
                vector="planted_binary",
                file=relative_name(path, root),
                blast_radius=f"shadows the real {name} when the repository precedes it on PATH",
                evidence=f"executable repo-root file named {name!r}, mode {_mode(path)}",
                explanation=(
                    "A same-named executable in the repository can intercept routine tool calls."
                ),
            )
        )

    for path in _repo_files(root):
        if path in primary_paths or path.suffix.casefold() not in EXECUTABLE_EXTENSIONS:
            continue
        name = relative_name(path, root)
        findings.append(
            Finding(
                vector="planted_binary",
                file=name,
                blast_radius=f"adds a repository-controlled executable at {name}",
                evidence=(
                    f"executable file extension {path.suffix.casefold()!r}, mode {_mode(path)}"
                ),
                explanation="Executable file types are secondary planted-payload indicators.",
            )
        )

    return findings
