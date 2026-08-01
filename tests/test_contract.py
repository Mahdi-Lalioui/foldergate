"""The contract is what stops three parallel workstreams from drifting.

If this test fails, someone changed a field name and two other people's code just
broke. That is exactly what it is here to catch.
"""

from foldergate.contract import Finding, ScanReport

EXPECTED_TOP_LEVEL = {"repo_url", "verdict", "kill_chain", "findings", "emulation", "defanged"}
EXPECTED_FINDING = {
    "vector",
    "file",
    "blast_radius",
    "evidence",
    "decoded",
    "visible_chars",
    "model_chars",
    "explanation",
}


def test_report_serializes_to_the_agreed_shape():
    payload = ScanReport(repo_url="https://example.com/repo").model_dump(mode="json")
    assert set(payload) == EXPECTED_TOP_LEVEL


def test_finding_serializes_to_the_agreed_shape():
    payload = Finding(vector="rules_file", file=".cursorrules").model_dump(mode="json")
    assert set(payload) == EXPECTED_FINDING


def test_defaults_are_clean_and_empty():
    report = ScanReport()
    assert report.verdict == "clean"
    assert report.findings == []
    assert report.emulation.ran is False
    assert report.defanged.output_path == ""


def test_round_trips_through_json():
    original = ScanReport(
        repo_url="https://example.com/repo",
        verdict="quarantined",
        kill_chain="rules -> mcp -> tasks -> planted binary",
        findings=[
            Finding(
                vector="planted_binary",
                file="git",
                blast_radius="shadows the real git via PATH order",
                visible_chars=40,
                model_chars=312,
            )
        ],
    )
    assert ScanReport.model_validate(original.model_dump(mode="json")) == original
