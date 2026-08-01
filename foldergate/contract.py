"""The shared contract.

Every workstream codes against these models and nobody blocks. FastAPI derives its
OpenAPI schema from them, so the UI generates its TypeScript types from the same
source -- the frontend can never drift from the backend.

`ScanReport.model_dump(mode="json")` emits exactly the agreed JSON shape.
"""

from typing import Literal

from pydantic import BaseModel, Field

Vector = Literal["rules_file", "mcp_json", "tasks_json", "planted_binary"]
Verdict = Literal["quarantined", "clean"]


class Finding(BaseModel):
    """One hostile artifact found in the repo.

    Note there is deliberately no `severity` field. Severity is what every scanner
    emits and it means nothing to a reader. `blast_radius` -- what this payload would
    actually reach -- is the useful thing, and tracing already produces it.
    """

    vector: Vector
    file: str
    blast_radius: str = ""
    evidence: str = ""
    decoded: str = ""
    # The gap between these two numbers IS the vulnerability: what a human sees
    # versus what the model actually reads.
    visible_chars: int = 0
    model_chars: int = 0
    explanation: str = ""


class Emulation(BaseModel):
    """Result of extracting the IDE's own trigger paths and executing only those.

    Not "we ran the repo in a sandbox" -- Cursor is not running in our container, so
    that would reproduce nothing. We parse tasks.json / mcp.json, extract the exact
    commands the IDE would execute on folder open, and run those under tracing.
    """

    ran: bool = False
    # Populated when a run is skipped or fails, so the UI can degrade rather than crash.
    reason: str = ""
    triggers_extracted: list[str] = Field(default_factory=list)
    processes: list[str] = Field(default_factory=list)
    files_written: list[str] = Field(default_factory=list)
    network_attempts: list[str] = Field(default_factory=list)


class Defanged(BaseModel):
    files_removed: list[str] = Field(default_factory=list)
    files_modified: list[str] = Field(default_factory=list)
    # A real path on disk -- an artifact you could walk away with, not a UI state.
    output_path: str = ""


class ScanReport(BaseModel):
    repo_url: str = ""
    verdict: Verdict = "clean"
    # The plain-English narrative joining the findings. Four flags in a list is a
    # linter; one chain is a story.
    kill_chain: str = ""
    findings: list[Finding] = Field(default_factory=list)
    emulation: Emulation = Field(default_factory=Emulation)
    defanged: Defanged = Field(default_factory=Defanged)
