"""Trigger extraction is pure parsing -- no Modal, no network, no side effects.

That is deliberate: it means the part that carries the "we execute the IDE's own
trigger paths" claim stays testable and keeps working even when the sandbox is cut.
"""

from foldergate.triggers import (
    Trigger,
    extract_triggers,
    is_worth_emulating,
    points_into_repo,
)

TRAPPED = "fixtures/demo-trapped"
CLEAN = "fixtures/demo-clean"


def test_extracts_folder_open_task():
    commands = [t.command for t in extract_triggers(TRAPPED)]
    assert "bash ./tools/collect.sh" in commands


def test_extracts_mcp_launch_command():
    triggers = extract_triggers(TRAPPED)
    mcp = [t for t in triggers if "mcp.json" in t.source]
    assert mcp, "expected a trigger sourced from an MCP config"
    assert mcp[0].command == "./tools/collect.sh"


def test_records_why_each_trigger_fires():
    reasons = {t.source: t.reason for t in extract_triggers(TRAPPED)}
    assert reasons[".vscode/tasks.json"] == "runOn: folderOpen"


def test_ignores_tasks_without_folder_open():
    # demo-clean has a build task with no runOptions -- it must not be extracted.
    sources = [t.source for t in extract_triggers(CLEAN)]
    assert ".vscode/tasks.json" not in sources


def test_clean_repo_has_nothing_worth_emulating():
    """A clean repo must produce a quiet trace.

    Its legitimate npx MCP server would otherwise time out reaching the network and
    render as a scary "network attempt" on a repo we call safe.
    """
    triggers = extract_triggers(CLEAN)
    assert triggers, "clean fixture should still expose its MCP command"
    assert not [t for t in triggers if is_worth_emulating(t, CLEAN)]


def test_trapped_repo_triggers_are_all_worth_emulating():
    triggers = extract_triggers(TRAPPED)
    assert len(triggers) == 2
    assert all(is_worth_emulating(t, TRAPPED) for t in triggers)


def test_points_into_repo_distinguishes_scripts_from_arguments():
    # An in-repo script is code the repo runs; a directory argument is just data.
    assert points_into_repo("bash ./tools/collect.sh", TRAPPED)
    assert not points_into_repo("npx -y @modelcontextprotocol/server-filesystem ./src", CLEAN)


def test_malformed_config_does_not_raise(tmp_path):
    """Hostile repos contain broken JSON. Never crash on their input."""
    (tmp_path / ".vscode").mkdir()
    (tmp_path / ".vscode" / "tasks.json").write_text("{ this is not json")
    (tmp_path / ".mcp.json").write_text("")
    assert extract_triggers(tmp_path) == []


def test_deduplicates_repeated_commands():
    t = Trigger(command="x", source="a", reason="r")
    assert t.command == "x"
    # The same script reached from two config files should appear once.
    commands = [x.command for x in extract_triggers(TRAPPED)]
    assert len(commands) == len(set(commands))
