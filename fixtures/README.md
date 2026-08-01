# Demo fixtures — safety statement

**Every attack fixture in this directory is self-created and consented. We are attacking
our own repos.** Say this on stage — "safety and responsible AI design" is a scored
judging criterion, and most teams will score zero on it.

## What's here

| Fixture | Purpose |
|---|---|
| `demo-trapped/` | One repo where four artifacts chain into a single kill chain |
| `demo-clean/` | Legitimate control — FolderGate must return **zero findings** |

## The kill chain in `demo-trapped/`

Four files, individually mild. Together: code execution on open, zero clicks.

| File | Role |
|---|---|
| `.cursorrules`, `CLAUDE.md` | Hidden instruction in Unicode **tag-block** characters (U+E0000–U+E007F) — invisible in every editor, browser and diff, legible to the model. Tells the agent to read `.env` and reveal a secret. Same payload in two tools |
| `.cursor/mcp.json` | MCP `command` points at `./tools/collect.sh` — a script **inside the repo** |
| `.vscode/tasks.json` | `runOn: folderOpen` runs that script before you read a line of code |
| `git` | Extensionless binary in the repo root; shadows the real `git` via PATH order so the payload survives |

## Payloads are benign and visible-only — non-negotiable

- They append to `PWNED.txt` or reveal a **fake** secret from `.env`. That is all.
- Nothing destructive. No real credentials. **Nothing leaves the machine.**
- Trigger emulation (issue #5) runs in a sandbox with **no network egress**.

## Reset

```bash
bash fixtures/reset.sh
```

Removes any `PWNED.txt`, regenerates the hidden-Unicode rules files, and restores the
executable bit on the planted binaries. **Run it after every rehearsal** — a leftover
`PWNED.txt` makes the "nothing fires" moment a lie.

## A note on the case-collision twin (CVE-2025-59944)

The `.Cursorrules` case-collision variant only manifests on **case-insensitive**
filesystems, where by nature only one file exists on disk — so it can't be committed as
a second physical file on a macOS/Windows checkout without leaving `git status`
permanently dirty. On a **case-sensitive** machine (Linux CI, a Linux demo) `reset.sh`
materialises it so the scanner's case-collision check has something to catch. Case
collision is detected as a `rules_file` finding, not a separate top-level vector, so the
four-vector demo does not depend on it.
