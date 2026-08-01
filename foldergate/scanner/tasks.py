"""Detect commands configured to run automatically when a workspace is opened."""

from pathlib import Path
from typing import Any

from foldergate.contract import Finding
from foldergate.scanner._shared import compact_json, load_json, relative_name


def _commands(value: Any) -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "command" and isinstance(nested, (str, list)):
                if isinstance(nested, str):
                    found.append(nested)
                else:
                    found.append(" ".join(str(item) for item in nested))
            else:
                found.extend(_commands(nested))
    elif isinstance(value, list):
        for nested in value:
            found.extend(_commands(nested))
    return found


def _scan_vscode(root: Path) -> list[Finding]:
    path = root / ".vscode" / "tasks.json"
    document = load_json(path) if path.is_file() else None
    if not isinstance(document, dict) or not isinstance(document.get("tasks"), list):
        return []

    findings: list[Finding] = []
    for index, task in enumerate(document["tasks"]):
        if not isinstance(task, dict):
            continue
        run_options = task.get("runOptions")
        if not isinstance(run_options, dict) or run_options.get("runOn") != "folderOpen":
            continue
        command = task.get("command", "<unspecified command>")
        label = task.get("label", f"task #{index + 1}")
        findings.append(
            Finding(
                vector="tasks_json",
                file=relative_name(path, root),
                blast_radius=f"executes {command} on folder open",
                evidence=f"task {label!r}: runOptions.runOn='folderOpen', command={command!r}",
                explanation="VS Code starts this task as soon as the workspace is opened.",
            )
        )
    return findings


def _scan_claude(root: Path) -> list[Finding]:
    path = root / ".claude" / "settings.json"
    document = load_json(path) if path.is_file() else None
    if not isinstance(document, dict) or not document.get("hooks"):
        return []

    hooks = document["hooks"]
    commands = _commands(hooks)
    reach = ", ".join(commands) if commands else "repository-defined hook actions"
    return [
        Finding(
            vector="tasks_json",
            file=relative_name(path, root),
            blast_radius=f"executes {reach} through Claude hooks",
            evidence=f"hooks={compact_json(hooks)}",
            explanation="Claude hook configuration can run commands during agent lifecycle events.",
        )
    ]


def _scan_devcontainer(root: Path) -> list[Finding]:
    path = root / ".devcontainer" / "devcontainer.json"
    document = load_json(path) if path.is_file() else None
    if not isinstance(document, dict):
        return []

    findings: list[Finding] = []
    for key in ("postCreateCommand", "postAttachCommand"):
        if key not in document or document[key] in (None, "", [], {}):
            continue
        command = compact_json(document[key])
        moment = "container creation" if key == "postCreateCommand" else "container attach"
        findings.append(
            Finding(
                vector="tasks_json",
                file=relative_name(path, root),
                blast_radius=f"executes {command} after {moment}",
                evidence=f"{key}={command}",
                explanation="Dev Containers execute this repository-controlled lifecycle command.",
            )
        )
    return findings


def scan_tasks(root: Path) -> list[Finding]:
    return [*_scan_vscode(root), *_scan_claude(root), *_scan_devcontainer(root)]
