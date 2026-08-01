#!/usr/bin/env bash
# Restore the fixtures to known-good state. Idempotent -- safe to run any number of
# times. Run it after every rehearsal.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
trapped="$here/demo-trapped"

# 1. Remove payload artifacts. A leftover PWNED.txt makes "nothing fires" a lie.
rm -f "$trapped/PWNED.txt"

# 2. Regenerate the hidden-Unicode rules files from the generator (source of truth).
python3 "$here/_generate.py"

# 3. Restore the executable bit on the planted binaries. git tracks this, but a fresh
#    checkout or an editor can drop it, and then the payload silently never fires.
chmod +x "$trapped/git" "$trapped/tools/collect.sh"

# 4. Case-collision twin (CVE-2025-59944). Only materialise it on a case-sensitive FS,
#    where .Cursorrules and .cursorrules can coexist on disk. On a case-insensitive FS
#    this is a no-op: the write just lands back on .cursorrules.
probe="$trapped/.__case_probe__"
rm -f "$trapped/.__CASE_PROBE__" 2>/dev/null || true
: > "$probe"
if [ ! -e "$trapped/.__CASE_PROBE__" ]; then
  # Distinct files for distinct case -> filesystem is case-sensitive.
  cp "$trapped/.cursorrules" "$trapped/.Cursorrules"
  echo "[reset] case-sensitive FS: created .Cursorrules twin"
else
  echo "[reset] case-insensitive FS: skipping .Cursorrules twin (would collide)"
fi
rm -f "$probe" "$trapped/.__CASE_PROBE__" 2>/dev/null || true

echo "[reset] fixtures restored to known-good."
