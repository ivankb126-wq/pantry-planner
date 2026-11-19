"""The official-site fallback: a chain missing from cijene.dev is crawled
with the cijene-api crawler. Here a tiny stand-in crawler with the same
command line copies fixture files, so we test our side of the contract."""

import shutil
import sys
import textwrap
from pathlib import Path

from pantry_pipeline.build import run
from pantry_pipeline.sources import LocalArchiveSet

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures" / "archives"


def make_fake_crawler(tmp_path: Path, source_chain_dir: Path) -> Path:
    crawler = tmp_path / "fake-cijene-api"
    (crawler / "crawler" / "cli").mkdir(parents=True)
    (crawler / "crawler" / "__init__.py").write_text("")
    (crawler / "crawler" / "cli" / "__init__.py").write_text("")
    (crawler / "crawler" / "cli" / "crawl.py").write_text(
        textwrap.dedent(
            f"""
            import argparse, shutil, pathlib
            p = argparse.ArgumentParser()
            p.add_argument("out"); p.add_argument("-d"); p.add_argument("-c")
            p.add_argument("-z"); p.add_argument("-v")
            a = p.parse_args()
            dest = pathlib.Path(a.out) / a.d / a.c
            shutil.copytree(r"{source_chain_dir}", dest)
            print("crawled", a.c, a.d)
            """
        )
    )
    return crawler


def test_missing_chain_is_crawled_from_official_site(tmp_path, monkeypatch):
    # Plodine is missing from the archive; the "official site" has Spar-like files for it.
    archives = tmp_path / "archives"
    shutil.copytree(FIXTURE / "2026-11-19" / "lidl", archives / "2026-11-19" / "lidl")
    crawler = make_fake_crawler(tmp_path, FIXTURE / "2026-11-19" / "spar")
    monkeypatch.setenv("CIJENE_CRAWLER_DIR", str(crawler))
    monkeypatch.setenv("CIJENE_CRAWLER_PYTHON", sys.executable)

    meta = run(
        tmp_path / "out",
        ROOT / "data" / "ingredients.yml",
        ["lidl", "plodine"],
        LocalArchiveSet(archives),
        "2026-11-20",
        None,
        None,
        use_crawler=True,
    )
    plodine = meta["chains"]["plodine"]
    assert plodine["source"] == "official site"
    assert plodine["date"] == "2026-11-20"
    assert (tmp_path / "out" / "prices" / "plodine" / "87005.json").exists()
