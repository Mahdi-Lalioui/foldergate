"""Internal, dependency-free helpers shared by scanner rules."""

import json
from pathlib import Path
from typing import Any


def relative_name(path: Path, root: Path) -> str:
    """Return stable POSIX-style paths for the API contract on every OS."""
    return path.relative_to(root).as_posix()


def _strip_json_comments(source: str) -> str:
    """Remove JSONC comments without treating comment markers in strings as syntax."""
    output: list[str] = []
    index = 0
    in_string = False
    escaped = False

    while index < len(source):
        char = source[index]
        following = source[index + 1] if index + 1 < len(source) else ""

        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            index += 1
        elif char == "/" and following == "/":
            index += 2
            while index < len(source) and source[index] not in "\r\n":
                index += 1
        elif char == "/" and following == "*":
            index += 2
            while index + 1 < len(source) and source[index : index + 2] != "*/":
                # Preserve newlines so parse errors still point to useful lines.
                if source[index] in "\r\n":
                    output.append(source[index])
                index += 1
            index = min(index + 2, len(source))
        else:
            output.append(char)
            index += 1

    # VS Code and devcontainer files commonly permit trailing commas.  Remove them
    # with another string-aware pass so punctuation inside a command is untouched.
    uncommented = "".join(output)
    output = []
    index = 0
    in_string = False
    escaped = False
    while index < len(uncommented):
        char = uncommented[index]
        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
            output.append(char)
        elif char == ",":
            following = index + 1
            while following < len(uncommented) and uncommented[following].isspace():
                following += 1
            if following >= len(uncommented) or uncommented[following] not in "}]":
                output.append(char)
        else:
            output.append(char)
        index += 1
    return "".join(output)


def load_json(path: Path) -> Any | None:
    """Load JSON or JSONC, returning ``None`` for unreadable/malformed input."""
    try:
        source = path.read_text(encoding="utf-8", errors="replace")
        return json.loads(_strip_json_comments(source))
    except (OSError, json.JSONDecodeError):
        return None


def compact_json(value: Any) -> str:
    """Serialize evidence deterministically without whitespace noise."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
