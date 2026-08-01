import asyncio
from contextlib import contextmanager
from pathlib import Path
from typing import get_type_hints

from foldergate import api


def test_scan_helper_type_hints_resolve():
    assert get_type_hints(api._scan_materialized)["return"] == list[api.Finding]


def test_scan_materializes_url_before_static_scan(monkeypatch, tmp_path):
    seen: dict[str, object] = {}

    @contextmanager
    def fake_materialize(source: str):
        seen["source"] = source
        yield tmp_path

    def fake_scan(path: str | Path):
        seen["path"] = path
        return []

    monkeypatch.setattr(api, "materialize_repository", fake_materialize, raising=False)
    monkeypatch.setattr(api, "static_scan", fake_scan)

    report = asyncio.run(api.scan(api.ScanRequest(repo_url="https://github.com/example/project")))

    assert report.verdict == "clean"
    assert seen == {
        "source": "https://github.com/example/project",
        "path": tmp_path,
    }
