"""CLI entrypoint. `uv run foldergate scan <path>` prints the contract as JSON.

Every stage is live: static scan, chain analysis, trigger emulation and defang.
`defang` re-scans its own output before reporting, so "clean" is verified rather
than asserted.
"""

import argparse
import json
import sys

from foldergate.chain import analyse, deterministic_chain
from foldergate.contract import ScanReport
from foldergate.defang import defang as run_defang
from foldergate.emulate import emulate as run_emulation
from foldergate.emulate import record as record_trace
from foldergate.scanner import scan as static_scan
from foldergate.triggers import extract_triggers


def _report(path: str) -> ScanReport:
    return ScanReport(repo_url=path)


def _cmd_emulate(args: argparse.Namespace) -> int:
    result = run_emulation(args.path, offline=args.offline, timeout=args.timeout)
    if args.record:
        if result.ran:
            record_trace(args.path, result)
            print(f"# recorded trace for {args.path}", file=sys.stderr)
        else:
            print("# not recording a failed run", file=sys.stderr)
    print(json.dumps(result.model_dump(mode="json"), indent=2))
    # A failed emulation is reportable, not fatal: the scanner still stands alone.
    return 0


def _cmd_triggers(args: argparse.Namespace) -> int:
    """Inspect what we would execute, without executing anything."""
    for trigger in extract_triggers(args.path):
        print(trigger)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="foldergate", description="Scan a repo before you open it."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    for name, help_text in [
        ("scan", "statically scan a repo path for hostile agent config"),
        ("defang", "write a neutralised copy of the repo"),
    ]:
        p = sub.add_parser(name, help=help_text)
        p.add_argument("path", help="path to the repo")
        p.add_argument(
            "--no-ai",
            action="store_true",
            help="skip the chain-analysis call and use the deterministic summary",
        )
        if name == "defang":
            p.add_argument(
                "--out",
                default=None,
                help="output directory (default ~/foldergate/clean/<repo>)",
            )

    p_emulate = sub.add_parser(
        "emulate", help="extract the IDE's trigger paths and run only those, sandboxed"
    )
    p_emulate.add_argument("path", help="path to the repo")
    p_emulate.add_argument(
        "--offline",
        action="store_true",
        help="replay a recorded trace instead of running a sandbox (demo fallback)",
    )
    p_emulate.add_argument(
        "--timeout", type=int, default=60, help="sandbox lifetime in seconds (default 60)"
    )
    p_emulate.add_argument(
        "--record",
        action="store_true",
        help="save this live trace into the replay cache used by --offline",
    )

    p_triggers = sub.add_parser(
        "triggers", help="show what the IDE would run on open, without running it"
    )
    p_triggers.add_argument("path", help="path to the repo")

    args = parser.parse_args(argv)
    if args.command == "emulate":
        return _cmd_emulate(args)
    if args.command == "triggers":
        return _cmd_triggers(args)

    try:
        findings = static_scan(args.path)
    except (FileNotFoundError, NotADirectoryError, PermissionError) as error:
        print(f"foldergate: {error}", file=sys.stderr)
        return 2

    report = analyse(
        ScanReport(repo_url=args.path, findings=findings),
        use_ai=not getattr(args, "no_ai", False),
    )

    if args.command == "defang":
        try:
            report.defanged = run_defang(args.path, args.out)
        except (OSError, ValueError) as error:
            print(f"foldergate: {error}", file=sys.stderr)
            return 2
        # Re-scan the OUTPUT and report on that. Claiming a repo is clean without
        # re-checking it would be exactly the kind of unverified assertion this
        # tool exists to catch.
        report.findings = static_scan(report.defanged.output_path)
        report.verdict = "quarantined" if report.findings else "clean"
        report.kill_chain = deterministic_chain(report.findings)
        print(f"# clean copy written to {report.defanged.output_path}", file=sys.stderr)

    print(json.dumps(report.model_dump(mode="json"), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
