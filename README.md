# FolderGate

**A folder shouldn't be able to attack you. FolderGate is the gate it has to pass through first.**

Paste a repo URL *before* you open it. FolderGate scans it, extracts and emulates the
trigger paths your IDE would execute on folder open, explains the kill chain, and hands
back a defanged copy.

> Every other tool scans the agent tooling you have already installed. FolderGate scans
> the repo before it reaches your machine.

Cursor Cybersecurity London Hackathon · Sat 1 Aug 2026 · Track: **AI Security**

---

## Quickstart

```bash
uv sync
```

```bash
uv run uvicorn foldergate.api:app --reload
```

```bash
cd web && npm ci && npm run dev
```

Vite serves the UI on `:5173` and proxies `/api` to `:8000` — **no CORS config anywhere**.

For the demo, build the UI once and run a single process on one port:

```bash
cd web && npm run build && cd .. && uv run uvicorn foldergate.api:app
```

## CLI

```bash
uv run foldergate scan fixtures/demo-trapped
```

## Tooling rules

- **uv only.** No `requirements.txt`, no `pip install`. Add dependencies with `uv add`;
  `uv.lock` is committed and CI runs `uv sync --frozen`.
- **Ruff only** for lint and format. `fixtures/` is excluded — it deliberately contains
  hostile and malformed content.

## Safety

Every attack fixture in this repo is **self-created and consented**, with benign,
visible-only payloads: they write `PWNED.txt` or print a fake environment variable, and
nothing else. Nothing destructive, no real credentials, nothing leaves the machine.
Emulation runs in an isolated sandbox with **no network egress**.

FolderGate is a defensive tool. **No model ever takes a destructive action** — defang is
deterministic by design.
