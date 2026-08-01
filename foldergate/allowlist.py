"""Small, code-reviewed exceptions used by the static scanner.

FolderGate deliberately does not read an ignore file from the repository it is
scanning: a hostile repository must not get to disable its own checks.  Exceptions
therefore live here, in trusted code, and match the vector, path, and (optionally)
the exact evidence emitted by a rule.
"""

from dataclasses import dataclass

from foldergate.contract import Finding, Vector

# Executables which are expected to launch MCP servers.  Paths that point back into
# the repository and dangerous argument shapes are still findings, even when the
# executable itself is on this list.
MCP_COMMAND_ALLOWLIST = frozenset({"npx", "uvx", "node", "python", "docker"})


@dataclass(frozen=True)
class AllowlistEntry:
    vector: Vector
    file: str
    evidence: str | None = None


# Keep exceptions exact and reviewable.  Add an entry only after inspecting the
# finding's evidence; a path-only exception intentionally suppresses every finding
# for that vector and path, while an evidence match suppresses just one signal.
FINDING_ALLOWLIST: tuple[AllowlistEntry, ...] = ()


def is_allowlisted(finding: Finding) -> bool:
    """Return whether a finding exactly matches a trusted exception."""
    return any(
        entry.vector == finding.vector
        and entry.file == finding.file
        and (entry.evidence is None or entry.evidence == finding.evidence)
        for entry in FINDING_ALLOWLIST
    )
