"""Trigger emulation: run only what the IDE would run, inside an isolated sandbox.

Not "clone the repo and run it in a container" -- Cursor is not running inside our
sandbox, so that reproduces nothing and invites the question "so, Docker?". We parse
the IDE's own config, extract the exact commands it would execute on folder open, and
run *those*, traced, with egress denied.

Three execution modes:
  offline  -- replay a recorded trace. No network, no Modal, never fails. This is the
              demo fallback and it exists from day one, not as a 13:30 scramble.
  local    -- upload the repo into a Modal Sandbox with block_network=True.
  remote   -- clone the URL inside the sandbox, allowing only github.com, so the
              hostile repo never touches the host filesystem.

Modal is an optional dependency (`uv sync --group modal`). Importing this module must
work without it -- offline mode has to run on a machine that has never seen Modal.
"""

import json
import os
from pathlib import Path

from foldergate.contract import Emulation
from foldergate.triggers import Trigger, extract_triggers, is_worth_emulating

SANDBOX_APP = "foldergate-sandbox"
CACHE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "emulation-cache.json"

# Egress is denied, so anything reaching for the network fails with one of these.
# We record those failures: a blocked exfiltration attempt is evidence, not an error.
_NETWORK_ERRORS = (
    "could not resolve",
    "connection refused",
    "network is unreachable",
    "temporary failure in name resolution",
    "no address associated",
    "operation timed out",
    "failed to connect",
)


def _looks_like_blocked_egress(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _NETWORK_ERRORS)


def replay(repo_path: str | os.PathLike) -> Emulation:
    """Replay a recorded trace. The demo fallback -- must never fail."""
    key = Path(repo_path).name
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError) as exc:
        return Emulation(ran=False, reason=f"no replay cache available ({exc})")

    entry = cache.get(key)
    if entry is None:
        return Emulation(ran=False, reason=f"no recorded trace for {key!r}")
    return Emulation(**entry)


def record(repo_path: str | os.PathLike, result: Emulation) -> None:
    """Persist a live trace into the replay cache, keyed by fixture name.

    Re-record after changing the fixtures, so --offline never drifts from reality.
    """
    key = Path(repo_path).name
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}

    entry = result.model_dump(mode="json")
    entry["reason"] = entry["reason"] or "replayed from recorded trace"
    cache[key] = entry

    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)
        f.write("\n")


def _build_image(modal, repo_path: str | os.PathLike | None):
    """Deliberately NOT uv_sync() of the whole project.

    uv_sync would install fastapi, uvicorn and openai into a sandbox that needs none
    of them -- cold-start seconds we would pay for on stage. pydantic plus the local
    package is everything the sandbox actually uses.
    """
    image = (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install("git", "curl")
        .uv_pip_install("pydantic")
        .add_local_python_source("foldergate")
    )
    if repo_path is not None:
        image = image.add_local_dir(str(repo_path), remote_path="/repo")
    return image


def _run_triggers(sb, triggers: list[Trigger], per_command_timeout: int):
    """Execute each trigger and record what it did. Returns (processes, network)."""
    processes: list[str] = []
    network: list[str] = []

    for trigger in triggers:
        proc = sb.exec(
            "bash",
            "-c",
            trigger.command,
            workdir="/repo",
            timeout=per_command_timeout,
        )
        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        proc.wait()

        processes.append(f"{trigger.command}  (exit {proc.returncode}, via {trigger.source})")
        combined = f"{stdout}\n{stderr}"
        if _looks_like_blocked_egress(combined):
            network.append(f"{trigger.command}: egress denied -- {stderr.strip()[:160]}")

    return processes, network


def _snapshot(sb) -> set[str]:
    """Recursive file listing. A plain find-diff is deterministic and synchronous.

    Sandbox.watch() exists in the SDK but is an async iterator and still undocumented
    upstream; it is not going on the critical path of a live demo.
    """
    proc = sb.exec("find", ".", "-type", "f", workdir="/repo", timeout=20)
    out = proc.stdout.read()
    proc.wait()
    return set(out.split())


def _prove_egress_blocked(sb) -> str | None:
    """Actively demonstrate the sandbox cannot phone home. This is demo evidence."""
    proc = sb.exec(
        "bash", "-c", "curl -sS --max-time 4 https://example.com > /dev/null", timeout=15
    )
    stderr = proc.stderr.read().strip()
    proc.wait()
    if proc.returncode != 0:
        detail = f" -- {stderr[:120]}" if stderr else ""
        return f"egress probe to example.com denied (exit {proc.returncode}){detail}"
    return None


def emulate(
    repo_path: str | os.PathLike,
    *,
    offline: bool = False,
    timeout: int = 60,
    per_command_timeout: int = 20,
) -> Emulation:
    """Emulate folder-open for a local repo path.

    Never raises. Any failure returns ran=False with a reason so the UI degrades
    instead of crashing -- TracePanel has an explicit "unavailable" state.
    """
    if offline:
        return replay(repo_path)

    all_triggers = extract_triggers(repo_path)
    triggers = [t for t in all_triggers if is_worth_emulating(t, repo_path)]
    if not triggers:
        return Emulation(
            ran=True,
            reason="no autorun triggers worth emulating",
            triggers_extracted=[t.command for t in all_triggers],
        )

    try:
        import modal
    except ImportError:
        return Emulation(
            ran=False,
            reason="modal not installed -- run `uv sync --group modal`, or use --offline",
            triggers_extracted=[t.command for t in triggers],
        )

    sb = None
    try:
        sb_app = modal.App.lookup(SANDBOX_APP, create_if_missing=True)
        sb = modal.Sandbox.create(
            app=sb_app,  # required when creating from outside a Modal container
            image=_build_image(modal, repo_path),
            block_network=True,  # gVisor isolation, and nothing gets out
            timeout=timeout,
            workdir="/repo",
        )

        before = _snapshot(sb)
        processes, network = _run_triggers(sb, triggers, per_command_timeout)
        probe = _prove_egress_blocked(sb)
        if probe:
            network.append(probe)
        files_written = sorted(f.lstrip("./") for f in _snapshot(sb) - before)

        return Emulation(
            ran=True,
            triggers_extracted=[t.command for t in triggers],
            processes=processes,
            files_written=files_written,
            network_attempts=network,
        )
    except Exception as exc:  # noqa: BLE001 -- the demo must degrade, never crash
        return Emulation(
            ran=False,
            reason=f"{type(exc).__name__}: {exc}",
            triggers_extracted=[t.command for t in triggers],
        )
    finally:
        if sb is not None:
            try:
                sb.terminate()
            except Exception:  # noqa: BLE001 -- cleanup must not mask the real result
                pass
