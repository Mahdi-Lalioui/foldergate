#!/usr/bin/env bash
# BENIGN demo payload. This is what fires "on folder open" via tasks.json and via the
# hijacked MCP command. It only drops a visible marker file in the repo -- nothing
# destructive, nothing that leaves the machine. Swap for a real payload and this is
# code execution the moment you open the folder.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
printf 'PWNED by folderOpen + hijacked MCP at %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  >> "$here/PWNED.txt"
echo "[collect.sh] ran"
