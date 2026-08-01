"""Detect repository-controlled and dangerous MCP server definitions."""

import re
import shlex
from pathlib import Path
from typing import Any

from foldergate.allowlist import MCP_COMMAND_ALLOWLIST
from foldergate.contract import Finding
from foldergate.scanner._shared import load_json, relative_name

MCP_FILES = (
    ".mcp.json",
    ".cursor/mcp.json",
    ".cursor/rules/mcp.json",
    ".vscode/mcp.json",
)

SECRET_NAME = re.compile(r"(?:credential|secret|token|password|api[_-]?key|private[_-]?key)", re.I)
CURL_TO_SHELL = re.compile(r"\bcurl\b[^\n|]*\|\s*(?:ba)?sh\b", re.I)
BASH_COMMAND = re.compile(r"\bbash\s+-c\b", re.I)


def _servers(document: Any) -> dict[str, Any]:
    if not isinstance(document, dict):
        return {}
    for key in ("mcpServers", "servers"):
        value = document.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _command_parts(command: Any) -> tuple[str, str]:
    if not isinstance(command, str) or not command.strip():
        return "", ""
    try:
        parts = shlex.split(command)
    except ValueError:
        parts = command.split()
    return (parts[0] if parts else ""), command


def _inside_repo(executable: str, root: Path) -> bool:
    if not executable or ("/" not in executable and "\\" not in executable):
        return False
    candidate = Path(executable)
    if not candidate.is_absolute():
        candidate = root / candidate
    try:
        candidate.resolve(strict=False).relative_to(root.resolve(strict=True))
    except (OSError, ValueError):
        return False
    return True


def _argument_text(command: str, args: Any) -> str:
    if isinstance(args, list):
        rendered = " ".join(shlex.quote(str(item)) for item in args)
    elif isinstance(args, str):
        rendered = args
    else:
        rendered = ""
    return " ".join(part for part in (command, rendered) if part)


def _secret_references(env: Any) -> list[str]:
    if not isinstance(env, dict):
        return []
    references: list[str] = []
    for key, value in env.items():
        rendered = str(value)
        variable_references = re.findall(r"\$\{([^}]+)}", rendered)
        if SECRET_NAME.search(str(key)) or any(
            SECRET_NAME.search(ref) for ref in variable_references
        ):
            if variable_references:
                rendered_references = ", ".join(f"${{{ref}}}" for ref in variable_references)
                references.append(f"{key} -> {rendered_references}")
            else:
                references.append(f"{key} -> <literal secret redacted>")
    return references


def _scan_server(root: Path, file_name: str, server_name: str, config: Any) -> list[Finding]:
    if not isinstance(config, dict):
        return []
    findings: list[Finding] = []
    executable, command = _command_parts(config.get("command"))
    evidence_prefix = f"server {server_name!r}"

    if executable and Path(executable).name.casefold() not in MCP_COMMAND_ALLOWLIST:
        findings.append(
            Finding(
                vector="mcp_json",
                file=file_name,
                blast_radius=f"launches the unapproved MCP command {executable}",
                evidence=f"{evidence_prefix} command={command!r}",
                explanation="Only npx, uvx, node, python, and docker are trusted MCP launchers.",
            )
        )

    if _inside_repo(executable, root):
        findings.append(
            Finding(
                vector="mcp_json",
                file=file_name,
                blast_radius=f"executes {executable} from inside the repository",
                evidence=f"{evidence_prefix} command={command!r}",
                explanation=(
                    "Repository-owned MCP executables can change after configuration review."
                ),
            )
        )

    invocation = _argument_text(command, config.get("args"))
    if CURL_TO_SHELL.search(invocation) or BASH_COMMAND.search(invocation):
        findings.append(
            Finding(
                vector="mcp_json",
                file=file_name,
                blast_radius="passes an MCP launch command directly to a shell",
                evidence=f"{evidence_prefix} invocation={invocation!r}",
                explanation=(
                    "Pipe-to-shell and bash -c shapes execute text rather than a reviewed program."
                ),
            )
        )

    secret_references = _secret_references(config.get("env"))
    if secret_references:
        findings.append(
            Finding(
                vector="mcp_json",
                file=file_name,
                blast_radius="passes secret-bearing environment variables to an MCP server",
                evidence=f"{evidence_prefix} env references: {', '.join(secret_references)}",
                explanation=(
                    "An MCP process receives every environment value assigned to its server."
                ),
            )
        )

    return findings


def scan_mcp(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for relative in MCP_FILES:
        path = root / relative
        if not path.is_file():
            continue
        document = load_json(path)
        for server_name, config in _servers(document).items():
            findings.extend(_scan_server(root, relative_name(path, root), server_name, config))
    return findings
