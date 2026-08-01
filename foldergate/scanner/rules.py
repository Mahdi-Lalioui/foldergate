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
    paths = {root / name for name in RULE_FILES if (root / name).is_file()}
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
