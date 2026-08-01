"""Modal deployment wrapper -- the CD half.

This gives the submission a public URL. The live demo still runs on localhost: we do
not want a cold start sitting between "click Defang" and the reveal.

Modal's image API moves fast. If `uv_sync` is not available in the installed modal
version, fall back to `.uv_pip_install(...)` or `.pip_install(...)` -- but keep it
uv-based so the deployed image resolves the same dependency set as local and CI.
"""

import modal

from foldergate.api import app as fastapi_app

image = (
    modal.Image.debian_slim(python_version="3.11")
    .add_local_dir("web/dist", remote_path="/root/web/dist", ignore=modal.FilePatternMatcher())
    .add_local_python_source("foldergate")
)

app = modal.App("foldergate")


@app.function(image=image)
@modal.asgi_app()
def serve():
    return fastapi_app
