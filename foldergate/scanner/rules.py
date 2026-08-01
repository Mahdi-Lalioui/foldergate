"""Detect invisible instructions and case-collisions across agent rule files."""

from collections import Counter
from pathlib import Path

from foldergate.contract import Finding
from foldergate.scanner._shared import relative_name

RULE_FILES = (
    ".cursorrules",
    ".Cursorrules",
    "CLAUDE.md",
    "AGENTS.md",
    ".windsurfrules",
    ".clinerules",
    ".github/copilot-instructions.md",
)

INVISIBLE_RANGES = (
    (0x200B, 0x200F),
    (0x202A, 0x202E),
    (0x2060, 0x2064),
    (0xFEFF, 0xFEFF),
    (0xE0000, 0xE007F),
)


def _is_invisible(char: str) -> bool:
    codepoint = ord(char)
    return any(start <= codepoint <= end for start, end in INVISIBLE_RANGES)


def _rule_paths(root: Path) -> list[Path]:
    """Resolve rule files from real directory entries, not by probing candidate names.

    Probing `(root / name).is_file()` is wrong on a case-insensitive filesystem --
    which is what macOS and Windows demo machines are. There, `.Cursorrules` reports
    True when only `.cursorrules` exists, so the same inode gets scanned twice and
    `_case_collisions` then invents a collision between a file and itself.

    Listing the directory and matching case-insensitively returns only names that
    genuinely exist on disk.
    """
    paths: set[Path] = set()

    flat = {name.casefold() for name in RULE_FILES if "/" not in name}
    try:
        for entry in root.iterdir():
            if entry.name.casefold() in flat and entry.is_file():
                paths.add(entry)
    except OSError:
        pass

    # Nested candidates (e.g. .github/copilot-instructions.md) are unambiguous.
    for name in RULE_FILES:
        if "/" in name and (root / name).is_file():
            paths.add(root / name)

    cursor_rules = root / ".cursor" / "rules"
    if cursor_rules.is_dir():
        paths.update(path for path in cursor_rules.rglob("*") if path.is_file())
    return sorted(paths, key=lambda path: relative_name(path, root))


def _decoded_text(text: str) -> tuple[str, int]:
    """Decode ASCII tag characters and strip all other invisible controls."""
    decoded: list[str] = []
    visible_chars = 0

    for char in text:
        codepoint = ord(char)
        if 0xE0000 <= codepoint <= 0xE007F:
            tagged = codepoint - 0xE0000
            # Tag payloads encode ASCII by offset.  Ignore tag controls rather than
            # introducing another invisible/control character into the evidence.
            if tagged in {9, 10, 13} or 0x20 <= tagged <= 0x7E:
                decoded.append(chr(tagged))
        elif _is_invisible(char):
            continue
        else:
            decoded.append(char)
            visible_chars += 1

    return "".join(decoded), visible_chars


def _blast_radius(decoded: str, file_name: str) -> str:
    lowered = decoded.casefold()
    if ".env" in lowered and ("secret" in lowered or "token" in lowered):
        return "directs the agent to read .env and disclose a repository secret"
    if "command" in lowered or "execute" in lowered or " run " in lowered:
        return f"injects hidden command instructions through {file_name}"
    return f"injects instructions into the agent through {file_name}"


def _invisible_finding(path: Path, root: Path) -> Finding | None:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    invisible = [char for char in text if _is_invisible(char)]
    if not invisible:
        return None

    decoded, visible_chars = _decoded_text(text)
    counts = Counter(ord(char) for char in invisible)
    codepoints = ", ".join(f"U+{codepoint:04X} x{count}" for codepoint, count in counts.items())
    name = relative_name(path, root)
    return Finding(
        vector="rules_file",
        file=name,
        blast_radius=_blast_radius(decoded, name),
        evidence=f"{len(invisible)} invisible characters: {codepoints}",
        decoded=decoded,
        visible_chars=visible_chars,
        model_chars=len(text),
        explanation=(
            "The editor renders these codepoints as invisible, while an agent still receives "
            "them as part of its instruction context. Unicode tag characters are decoded above."
        ),
    )


def _case_collisions(paths: list[Path], root: Path) -> list[Finding]:
    grouped: dict[str, list[str]] = {}
    for path in paths:
        name = relative_name(path, root)
        grouped.setdefault(name.casefold(), []).append(name)

    findings: list[Finding] = []
    for names in grouped.values():
        unique = sorted(set(names))
        if len(unique) < 2:
            continue
        # Two names are only a real collision if they are two real files. On a
        # case-insensitive checkout they can alias to one inode, and reporting that
        # as an attack is a false positive on the machine we demo from.
        inodes = set()
        for name in unique:
            try:
                stat = (root / name).stat()
                inodes.add((stat.st_dev, stat.st_ino))
            except OSError:
                continue
        if len(inodes) < 2:
            continue
        findings.append(
            Finding(
                vector="rules_file",
                file=unique[0],
                blast_radius="lets an agent load a rules file under a casing the reviewer missed",
                evidence=f"case-colliding paths: {', '.join(unique)}",
                explanation=(
                    "These paths are distinct on a case-sensitive checkout but alias on common "
                    "case-insensitive filesystems."
                ),
            )
        )
    return findings


def scan_rules(root: Path) -> list[Finding]:
    paths = _rule_paths(root)
    findings = [finding for path in paths if (finding := _invisible_finding(path, root))]
    findings.extend(_case_collisions(paths, root))
    return findings
