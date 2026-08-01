"""Turn a list of findings into one kill chain.

Four flags in a list is a linter. One chain is a story -- and cross-artifact reasoning
is the thing no competing tool does: they are all siloed by artifact type.

So this is **one** LLM call over all the findings jointly, asking how they combine,
not four independent per-finding classifications. Same token budget, far better output.

The model is advisory only. It writes prose; it never decides what is dangerous (the
scanner already did) and it never touches a file (defang is deterministic). If it is
slow, rate-limited, unavailable or returns nonsense, we fall back to a deterministic
narrative and the demo continues. That is a deliberate design property, not a hedge.
"""

import json
import os
from collections import defaultdict

from foldergate.contract import Finding, ScanReport

MODEL = os.environ.get("FOLDERGATE_MODEL", "gpt-4o-mini")
TIMEOUT_SECONDS = 10.0

# Ordered so the narrative reads as an attack path: the agent is instructed, the tool
# config is hijacked, something makes it run, and a planted binary keeps it running.
_VECTOR_ORDER = ("rules_file", "mcp_json", "tasks_json", "planted_binary")

_VECTOR_ROLE = {
    "rules_file": "instructs the agent through text a human reviewer cannot see",
    "mcp_json": "redirects the agent's tools at code the repository controls",
    "tasks_json": "runs it the moment the folder is opened, with no click",
    "planted_binary": "shadows a real command so the payload survives",
}

_SYSTEM = """You are a security analyst writing the summary a developer reads before \
deciding whether to open an untrusted repository.

You are given findings a static scanner has ALREADY confirmed. Do not re-judge whether \
they are dangerous and do not invent findings. Your job is to explain how they COMBINE \
into a single attack path, in plain English.

Return strict JSON:
{"kill_chain": "<3-5 sentences, concrete, no marketing language>",
 "explanations": {"<file path>": "<one sentence on this file's role in the chain>"}}

Write for someone technical who is in a hurry. No bullet points, no preamble."""


def _ordered(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (_VECTOR_ORDER.index(f.vector), f.file))


def deterministic_chain(findings: list[Finding]) -> str:
    """The fallback narrative. Never fails, needs no network, and is always truthful.

    Built from the findings themselves, so it stays accurate even when it is standing
    in for the model.
    """
    if not findings:
        return "No autorun, tool-config or hidden-instruction vectors found."

    by_vector: dict[str, list[Finding]] = defaultdict(list)
    for finding in findings:
        by_vector[finding.vector].append(finding)

    steps = [
        f"{', '.join(sorted({f.file for f in by_vector[vector]}))} {_VECTOR_ROLE[vector]}"
        for vector in _VECTOR_ORDER
        if vector in by_vector
    ]
    files = len({f.file for f in findings})
    narrative = ". ".join(steps)
    # Not .capitalize() -- that lowercases the rest, turning CLAUDE.md into claude.md.
    narrative = narrative[:1].upper() + narrative[1:]
    return (
        f"{narrative}. "
        f"{files} file{'s' if files != 1 else ''}, individually mild. "
        "Together: code execution when the folder is opened, with zero clicks."
    )


def _fallback(report: ScanReport, reason: str) -> ScanReport:
    report.kill_chain = deterministic_chain(report.findings)
    for finding in report.findings:
        if not finding.explanation:
            finding.explanation = _VECTOR_ROLE[finding.vector].capitalize() + "."
    if reason:
        report.kill_chain += f"  [{reason}]"
    return report


def _prompt(findings: list[Finding]) -> str:
    payload = [
        {
            "file": f.file,
            "vector": f.vector,
            "blast_radius": f.blast_radius,
            # The DECODED text -- what the model would actually have obeyed.
            "hidden_or_evidence": (f.decoded or f.evidence)[:600],
        }
        for f in _ordered(findings)
    ]
    return json.dumps({"findings": payload}, indent=2)


def analyse(report: ScanReport, *, use_ai: bool = True) -> ScanReport:
    """Fill in verdict, kill_chain and per-finding explanations.

    Always returns a usable report. Never raises.
    """
    report.verdict = "quarantined" if report.findings else "clean"

    if not report.findings:
        report.kill_chain = deterministic_chain([])
        return report

    if not use_ai:
        return _fallback(report, "")
    if not os.environ.get("OPENAI_API_KEY"):
        return _fallback(report, "no OPENAI_API_KEY; deterministic summary")

    try:
        from openai import OpenAI

        client = OpenAI(timeout=TIMEOUT_SECONDS, max_retries=1)
        completion = client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _prompt(report.findings)},
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
    except Exception as exc:  # noqa: BLE001 -- the demo must never die on a network call
        return _fallback(report, f"{type(exc).__name__}; deterministic summary")

    chain = data.get("kill_chain")
    if not isinstance(chain, str) or not chain.strip():
        return _fallback(report, "model returned no chain; deterministic summary")
    report.kill_chain = chain.strip()

    explanations = data.get("explanations")
    if isinstance(explanations, dict):
        for finding in report.findings:
            text = explanations.get(finding.file)
            if isinstance(text, str) and text.strip():
                finding.explanation = text.strip()

    # A model that skipped a file must not leave a blank cell in the UI.
    for finding in report.findings:
        if not finding.explanation:
            finding.explanation = _VECTOR_ROLE[finding.vector].capitalize() + "."
    return report
