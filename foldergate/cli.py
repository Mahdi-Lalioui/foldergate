"""CLI entrypoint. `uv run foldergate scan <path>` prints the contract as JSON.

The subcommands are wired to stubs until #3/#4/#5 land. Keeping the surface stable
now means the demo script and the tests never have to change.
"""

import argparse
import json
import sys

from foldergate.contract import ScanReport


def _report(path: str) -> ScanReport:
    return ScanReport(repo_url=path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="foldergate", description="Scan a repo before you open it."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    for name, help_text in [
        ("scan", "statically scan a repo path for hostile agent config"),
        ("emulate", "extract the IDE's trigger paths and run only those, sandboxed"),
        ("defang", "write a neutralised copy of the repo"),
    ]:
        p = sub.add_parser(name, help=help_text)
        p.add_argument("path", help="path to the repo")

    args = parser.parse_args(argv)
    report = _report(args.path)
    print(json.dumps(report.model_dump(mode="json"), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
