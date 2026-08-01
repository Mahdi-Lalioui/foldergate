"""Extract the commands an IDE would execute on folder open.

This is the heart of the difference between FolderGate and "we ran it in a container".
We do not clone a repo and run arbitrary things -- Cursor is not running inside our
sandbox, so that would reproduce nothing. Instead we parse the very config files the
IDE reads on open, pull out the exact command lines it would execute, and run only
those under tracing.

Pure parsing: no network, no Modal, no side effects. That makes it trivially testable
and means it still works when the sandbox is cut.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path

# Config files an editor reads -- and acts on -- when you open a folder.
TASKS_FILES = [".vscode/tasks.json"]
MCP_FILES = [
    ".mcp.json",
    ".cursor/mcp.json",
    ".cursor/rules/mcp.json",
    ".vscode/mcp.json",
]
CLAUDE_SETTINGS = [".claude/settings.json", ".claude/settings.local.json"]


# Launchers that fetch and run a *published* package. Ordinary in a real project.
# A repo-local script is a different thing entirely -- see points_into_repo().
KNOWN_LAUNCHERS = {"npx", "uvx", "node", "python", "python3", "docker", "bash", "sh"}


@dataclass(frozen=True)
class Trigger:
    """One command the IDE would run, and what made it run."""

    command: str
    source: str  # the file that would cause it
    reason: str  # why it fires

    def __str__(self) -> str:
        return f"{self.command}  [{self.source}: {self.reason}]"


def _read_json(path: Path) -> dict | None:
    """Hostile repos contain malformed JSON. Never raise on their input."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _join(command: str, args: object) -> str:
    if isinstance(args, list) and args:
        return " ".join([command, *(str(a) for a in args)])
    return command


def _from_tasks(root: Path) -> list[Trigger]:
    """VS Code tasks with runOn: folderOpen execute with zero user interaction."""
    out: list[Trigger] = []
    for rel in TASKS_FILES:
        data = _read_json(root / rel)
        if not isinstance(data, dict):
            continue
        for task in data.get("tasks", []) or []:
            if not isinstance(task, dict):
                continue
            run_on = (task.get("runOptions") or {}).get("runOn")
            if run_on != "folderOpen":
                continue
            command = task.get("command")
            if not command:
                continue
            out.append(
                Trigger(
                    command=_join(str(command), task.get("args")),
                    source=rel,
                    reason="runOn: folderOpen",
                )
            )
    return out


def _from_mcp(root: Path) -> list[Trigger]:
    """MCP servers are launched by the agent; the command is whatever the file says."""
    out: list[Trigger] = []
    for rel in MCP_FILES:
        data = _read_json(root / rel)
        if not isinstance(data, dict):
            continue
        servers = data.get("mcpServers") or data.get("servers") or {}
        if not isinstance(servers, dict):
            continue
        for name, spec in servers.items():
            if not isinstance(spec, dict):
                continue
            command = spec.get("command")
            if not command:
                continue
            out.append(
                Trigger(
                    command=_join(str(command), spec.get("args")),
                    source=rel,
                    reason=f"MCP server {name!r} launch command",
                )
            )
    return out


def _from_claude_hooks(root: Path) -> list[Trigger]:
    """Claude Code hooks fire on session start / tool use, without a prompt."""
    out: list[Trigger] = []
    for rel in CLAUDE_SETTINGS:
        data = _read_json(root / rel)
        if not isinstance(data, dict):
            continue
        hooks = data.get("hooks")
        if not isinstance(hooks, dict):
            continue
        for event, entries in hooks.items():
            for entry in entries if isinstance(entries, list) else []:
                if not isinstance(entry, dict):
                    continue
                for hook in entry.get("hooks", []) or []:
                    command = isinstance(hook, dict) and hook.get("command")
                    if command:
                        out.append(
                            Trigger(
                                command=str(command),
                                source=rel,
                                reason=f"hook on {event}",
                            )
                        )
    return out


def points_into_repo(command: str, repo_path: str | os.PathLike) -> bool:
    """Does this command execute a file that ships *inside* the repo?

    This is the line between "launches a published package" and "runs code the repo
    author put there". `npx -y @some/server ./src` is ordinary. `bash ./tools/collect.sh`
    is the repo executing itself the moment you open the folder.
    """
    root = Path(repo_path).resolve()
    for token in command.split():
        if "/" not in token:
            continue
        candidate = (root / token).resolve()
        # Must stay inside the repo, and must be a file -- a directory argument
        # (like ./src) is data being passed, not code being run.
        if root in candidate.parents and candidate.is_file():
            return True
    return False


def is_worth_emulating(trigger: Trigger, repo_path: str | os.PathLike) -> bool:
    """Only detonate what we would flag.

    A clean repo must produce a quiet trace. Emulating its legitimate `npx` server
    would just time out reaching the network and render as a scary-looking
    "network attempt" on a repo we are telling the user is safe.
    """
    if points_into_repo(trigger.command, repo_path):
        return True
    launcher = trigger.command.split()[0] if trigger.command.split() else ""
    return Path(launcher).name not in KNOWN_LAUNCHERS


def extract_triggers(repo_path: str | os.PathLike) -> list[Trigger]:
    """Every command the IDE would run on open, in the order we would execute them."""
    root = Path(repo_path)
    triggers = _from_tasks(root) + _from_mcp(root) + _from_claude_hooks(root)

    # Same command can appear in several files (that is the point of the kill chain --
    # tasks.json and mcp.json both reach the same script). Keep the first occurrence so
    # the trace stays readable, but preserve order.
    seen: set[str] = set()
    unique: list[Trigger] = []
    for t in triggers:
        if t.command not in seen:
            seen.add(t.command)
            unique.append(t)
    return unique
