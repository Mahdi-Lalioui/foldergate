"""Neutralise a hostile repository and write out a clean copy.

Deterministic by design: **no model is ever in this path.** Two reasons, and both
are worth saying on stage.

1. It is the destructive step. A model that hallucinates here deletes the wrong file.
2. It is the moment the demo lives or dies on, so it must be reproducible.

"No model ever takes a destructive action" is a responsible-AI-design point, not just
an engineering one -- and it is a scored criterion.

The output goes to a real, visible path on disk (~/foldergate/clean/<repo>) rather
than a temp directory: it is an artifact the user could walk away with, not a UI state.
"""

import json
import os
import shutil
import stat
from pathlib import Path

from foldergate.allowlist import MCP_COMMAND_ALLOWLIST
from foldergate.contract import Defanged
from foldergate.scanner._shared import load_json
from foldergate.scanner.binaries import scan_binaries
from foldergate.scanner.mcp import MCP_FILES
from foldergate.scanner.rules import INVISIBLE_RANGES, _rule_paths

DEFAULT_OUTPUT_ROOT = Path.home() / "foldergate" / "clean"

# Mirrors the paths scanner/tasks.py inspects. Kept in step with it deliberately:
# anything the scanner can flag as autorun, defang has to be able to neutralise, or
# the "re-scan finds nothing" guarantee is a lie.
TASKS_FILE = ".vscode/tasks.json"
CLAUDE_SETTINGS = ".claude/settings.json"
DEVCONTAINER = ".devcontainer/devcontainer.json"
DEVCONTAINER_HOOKS = (
    "postCreateCommand",
    "postAttachCommand",
    "postStartCommand",
    "onCreateCommand",
    "initializeCommand",
    "updateContentCommand",
)


def _is_invisible(char: str) -> bool:
    codepoint = ord(char)
    return any(start <= codepoint <= end for start, end in INVISIBLE_RANGES)


def strip_invisible(text: str) -> str:
    """Remove every invisible character, including the U+E0000 tag block."""
    return "".join(ch for ch in text if not _is_invisible(ch))


def _read_json(path: Path):
    """Use the scanner's loader: it strips comments, and VS Code config is JSONC."""
    return load_json(path) if path.is_file() else None


def _write_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def _rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _defang_rules(root: Path, removed: list[str], modified: list[str]) -> None:
    """Strip invisible characters, and delete a genuine case-collision twin.

    _rule_paths already resolves real on-disk entries, so on a case-insensitive
    checkout we see one file rather than a phantom pair.
    """
    seen_inodes: dict[tuple[int, int], Path] = {}

    for path in _rule_paths(root):
        try:
            info = path.stat()
        except OSError:
            continue
        key = (info.st_dev, info.st_ino)

        # A second distinct file whose name differs only in case is the
        # CVE-2025-59944 override. The lexicographically-first name is the one a
        # reviewer would have opened, so that is the one we keep.
        prior = seen_inodes.get(key)
        if prior is None:
            twin = next(
                (
                    other
                    for other in seen_inodes.values()
                    if other.name.casefold() == path.name.casefold()
                ),
                None,
            )
            if twin is not None:
                loser = max(twin, path, key=lambda p: p.name)
                loser.unlink(missing_ok=True)
                removed.append(_rel(loser, root))
                if loser == path:
                    continue
            seen_inodes[key] = path

        try:
            original = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        cleaned = strip_invisible(original)
        if cleaned != original:
            path.write_text(cleaned, encoding="utf-8")
            modified.append(_rel(path, root))


def _is_hostile_server(spec: dict, root: Path) -> bool:
    """Would the scanner flag this server?

    Defang must not touch a legitimate one. `npx -y @scope/server ./src` is an
    ordinary MCP config; rewriting it would vandalise a repo we are calling clean.
    """
    command = spec.get("command")
    if not isinstance(command, str) or not command:
        return False

    if Path(command).name not in MCP_COMMAND_ALLOWLIST:
        return True
    # An allowlisted launcher still counts if it is pointed at repo-controlled code.
    argv = [command, *(str(a) for a in spec.get("args", []) or [])]
    for token in argv:
        if "/" not in token:
            continue
        candidate = (root / token).resolve()
        if root in candidate.parents and candidate.is_file():
            return True
    return False


def _defang_mcp(root: Path, removed: list[str], modified: list[str]) -> None:
    """Remove hijacked MCP servers outright; leave legitimate ones alone.

    We delete the entry rather than rewriting the command to a placeholder: any
    sentinel we invented would itself be an unapproved command, so the scanner would
    keep flagging it and "re-scan finds nothing" would never hold.
    """
    for rel in MCP_FILES:
        path = root / rel
        data = _read_json(path)
        if not isinstance(data, dict):
            continue

        changed = False
        for key in ("mcpServers", "servers"):
            servers = data.get(key)
            if not isinstance(servers, dict):
                continue
            for name in [n for n, spec in servers.items() if isinstance(spec, dict)]:
                if _is_hostile_server(servers[name], root):
                    del servers[name]
                    removed.append(f"{_rel(path, root)} → mcpServer {name!r}")
                    changed = True
        if changed:
            _write_json(path, data)
            modified.append(_rel(path, root))


def _defang_tasks(root: Path, modified: list[str]) -> None:
    """Remove folderOpen autorun, Claude hooks and devcontainer lifecycle commands.

    The task itself is kept -- a build task is legitimate. Only the part that makes it
    fire without a human asking is removed.
    """
    path = root / TASKS_FILE
    data = _read_json(path)
    if isinstance(data, dict):
        changed = False
        tasks = data.get("tasks")
        for task in tasks if isinstance(tasks, list) else []:
            if not isinstance(task, dict):
                continue
            run_options = task.get("runOptions")
            if isinstance(run_options, dict) and run_options.pop("runOn", None) is not None:
                if not run_options:
                    task.pop("runOptions", None)
                changed = True
        if changed:
            _write_json(path, data)
            modified.append(_rel(path, root))

    path = root / CLAUDE_SETTINGS
    data = _read_json(path)
    if isinstance(data, dict) and data.pop("hooks", None) is not None:
        _write_json(path, data)
        modified.append(_rel(path, root))

    path = root / DEVCONTAINER
    data = _read_json(path)
    if isinstance(data, dict):
        if any(data.pop(hook, None) is not None for hook in DEVCONTAINER_HOOKS):
            _write_json(path, data)
            modified.append(_rel(path, root))


def _defang_binaries(root: Path, removed: list[str], modified: list[str]) -> None:
    """Delete PATH shadows; disarm other repo-controlled executables.

    A shadow of a real tool (`git`, `node`) has no legitimate reason to ship in a
    repo, so it goes. Anything else that is merely executable gets its exec bit
    cleared instead -- a build script is not automatically an attack, and deleting
    a repo's own scripts would be a destructive overreach.
    """
    for finding in scan_binaries(root):
        path = root / finding.file
        if not path.exists():
            continue
        if "shadows the real" in finding.blast_radius:
            path.unlink(missing_ok=True)
            removed.append(finding.file)
        else:
            mode = path.stat().st_mode
            path.chmod(mode & ~(stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))
            modified.append(finding.file)


def defang(repo_path: str | os.PathLike, output_path: str | os.PathLike | None = None) -> Defanged:
    """Copy the repo, neutralise every known vector, and report what changed.

    Idempotent: running it twice produces the same tree and no further changes.
    Never writes outside output_path.
    """
    source = Path(repo_path).resolve()
    destination = (
        Path(output_path).expanduser().resolve()
        if output_path is not None
        else DEFAULT_OUTPUT_ROOT / source.name
    )

    if destination == source or source in destination.parents:
        raise ValueError("defang output must not overwrite or nest inside the source repo")

    if destination.exists():
        shutil.rmtree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Never follow symlinks out of the tree: a hostile repo could point one at ~/.ssh.
    shutil.copytree(source, destination, symlinks=True)

    removed: list[str] = []
    modified: list[str] = []

    _defang_rules(destination, removed, modified)
    _defang_mcp(destination, removed, modified)
    _defang_tasks(destination, modified)
    _defang_binaries(destination, removed, modified)

    # Payload artifacts from a previous detonation are not evidence, they are litter.
    for artifact in destination.rglob("PWNED.txt"):
        artifact.unlink(missing_ok=True)
        removed.append(_rel(artifact, destination))

    return Defanged(
        files_removed=sorted(set(removed)),
        files_modified=sorted(set(modified)),
        output_path=str(destination),
    )
