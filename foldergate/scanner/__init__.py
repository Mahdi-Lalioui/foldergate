"""Pure static scanner public entry point."""

from pathlib import Path

from foldergate.allowlist import is_allowlisted
from foldergate.contract import Finding
from foldergate.scanner.binaries import scan_binaries
from foldergate.scanner.mcp import scan_mcp
from foldergate.scanner.rules import scan_rules
from foldergate.scanner.tasks import scan_tasks


def scan(path: str | Path) -> list[Finding]:
    """Scan one repository directory without network, config, or global state."""
    root = Path(path)
    if not root.exists():
        raise FileNotFoundError(f"repository path does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"repository path is not a directory: {root}")

    findings = [
        *scan_rules(root),
        *scan_mcp(root),
        *scan_tasks(root),
        *scan_binaries(root),
    ]
    findings = [finding for finding in findings if not is_allowlisted(finding)]
    return sorted(findings, key=lambda finding: (finding.file, finding.vector, finding.evidence))


__all__ = ["scan"]
