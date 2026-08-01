"""FastAPI app: three routes plus the built UI, on one port with no CORS."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from foldergate.chain import analyse, deterministic_chain
from foldergate.contract import Emulation, ScanReport
from foldergate.defang import defang as run_defang
from foldergate.emulate import emulate as run_emulation
from foldergate.scanner import scan as static_scan

app = FastAPI(title="FolderGate", version="0.1.0")

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

_NO_BUILD = """<!doctype html><meta charset=utf-8><title>FolderGate</title>
<body style="font:16px ui-monospace,monospace;background:#0b0f14;color:#e6edf3;padding:3rem">
<h1>FolderGate</h1>
<p>The UI has not been built yet.</p>
<pre style="background:#161b22;padding:1rem;border-radius:6px">cd web
npm ci &amp;&amp; npm run build</pre>
<p>Or run the Vite dev server on :5173 -- it proxies /api here automatically.</p>
<p>The API is live regardless: <a style="color:#58a6ff" href="/docs">/docs</a></p>
</body>"""


class ScanRequest(BaseModel):
    repo_url: str
    # The UI can turn off the chain-analysis call; the deterministic summary stands in.
    use_ai: bool = True


class DefangRequest(BaseModel):
    repo_url: str


@app.post("/api/scan", response_model=ScanReport)
async def scan(req: ScanRequest) -> ScanReport:
    try:
        findings = static_scan(req.repo_url)
    except (FileNotFoundError, NotADirectoryError, PermissionError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    # analyse() sets the verdict, writes the kill chain and never raises -- on any
    # LLM failure it falls back to the deterministic narrative.
    return await run_in_threadpool(
        analyse,
        ScanReport(repo_url=req.repo_url, findings=findings),
        use_ai=req.use_ai,
    )


class EmulateRequest(BaseModel):
    repo_url: str
    # The UI flips this on when the sandbox is unavailable or we are demoing offline.
    offline: bool = False


@app.post("/api/emulate", response_model=Emulation)
async def emulate(req: EmulateRequest) -> Emulation:
    # run_emulation never raises: on any failure it returns ran=False with a reason,
    # so TracePanel renders its "unavailable" state instead of the page breaking.
    return await run_in_threadpool(run_emulation, req.repo_url, offline=req.offline)


def _defang_and_verify(repo_url: str) -> ScanReport:
    """Defang, then re-scan the OUTPUT and report on that.

    The button says the repo is now clean, so we check. Asserting it without
    re-scanning would be precisely the kind of unverified claim this tool exists
    to catch.
    """
    defanged = run_defang(repo_url)
    findings = static_scan(defanged.output_path)
    return ScanReport(
        repo_url=repo_url,
        verdict="quarantined" if findings else "clean",
        kill_chain=deterministic_chain(findings),
        findings=findings,
        defanged=defanged,
    )


@app.post("/api/defang", response_model=ScanReport)
async def defang(req: DefangRequest) -> ScanReport:
    try:
        return await run_in_threadpool(_defang_and_verify, req.repo_url)
    except (FileNotFoundError, NotADirectoryError, PermissionError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
else:

    @app.get("/", response_class=HTMLResponse)
    async def _no_build() -> str:
        """Keep the backend usable on a fresh clone, before anyone has run npm."""
        return _NO_BUILD
