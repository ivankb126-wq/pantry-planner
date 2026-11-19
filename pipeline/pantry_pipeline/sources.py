"""Where price files come from: the cijene.dev archive, the official sites
(through the cijene-api crawler), a local folder (tests), or the previous
deployment of our own site."""

from __future__ import annotations

import csv
import gzip
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import urllib.error
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Protocol

from .remote_zip import http_get, open_remote_zip

log = logging.getLogger(__name__)

ARCHIVE_LIST_URL = "https://api.cijene.dev/v0/list"

# Big CSVs (Konzum prices are ~200 MB unpacked) have long fields sometimes.
csv.field_size_limit(10_000_000)


class ChainFiles(Protocol):
    """The three CSV files cijene.dev publishes per chain."""

    def rows(self, name: str) -> Iterator[dict[str, str]]: ...


class ZipChainFiles:
    def __init__(self, zf: zipfile.ZipFile, chain: str):
        self.zf, self.chain = zf, chain

    def rows(self, name: str) -> Iterator[dict[str, str]]:
        with self.zf.open(f"{self.chain}/{name}") as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""))


class DirChainFiles:
    def __init__(self, path: Path):
        self.path = path

    def rows(self, name: str) -> Iterator[dict[str, str]]:
        with open(self.path / name, encoding="utf-8-sig", errors="replace", newline="") as f:
            yield from csv.DictReader(f)


def chain_in_zip(zf: zipfile.ZipFile, chain: str) -> bool:
    names = set(zf.namelist())
    return all(f"{chain}/{n}" in names for n in ("stores.csv", "products.csv", "prices.csv"))


# ---------------------------------------------------------------------------
# cijene.dev archive


def list_archives() -> list[dict]:
    """Newest first: [{'date': '2026-11-19', 'url': ..., 'size': ..., 'updated': ...}]"""
    data = json.loads(http_get(ARCHIVE_LIST_URL))
    return sorted(data.get("archives", []), key=lambda a: a["date"], reverse=True)


class ArchiveSet:
    """Lazily opened cijene.dev archives, so we only touch older days when needed."""

    def __init__(self, archives: list[dict], cache_dir: Path | None = None):
        self.archives = archives
        self.cache_dir = cache_dir
        self._open: dict[str, zipfile.ZipFile] = {}

    def get(self, date: str) -> zipfile.ZipFile | None:
        if date in self._open:
            return self._open[date]
        entry = next((a for a in self.archives if a["date"] == date), None)
        if not entry:
            return None
        try:
            zf = open_remote_zip(entry["url"], self.cache_dir)
        except Exception as err:  # noqa: BLE001
            log.error("Could not open cijene.dev archive %s: %s", date, err)
            return None
        self._open[date] = zf
        return zf

    @property
    def dates(self) -> list[str]:
        return [a["date"] for a in self.archives]


class LocalArchiveSet(ArchiveSet):
    """A folder of <date>/<chain>/*.csv or <date>.zip files (tests, dry runs)."""

    def __init__(self, root: Path):
        self.root = root
        dates = sorted({p.stem if p.suffix == ".zip" else p.name for p in root.iterdir()}, reverse=True)
        super().__init__([{"date": d, "url": str(root / d)} for d in dates])

    def get(self, date: str):  # type: ignore[override]
        zpath = self.root / f"{date}.zip"
        if zpath.exists():
            return zipfile.ZipFile(zpath)
        dpath = self.root / date
        return dpath if dpath.is_dir() else None


def chain_files_from(container, chain: str) -> ChainFiles | None:
    if container is None:
        return None
    if isinstance(container, zipfile.ZipFile):
        return ZipChainFiles(container, chain) if chain_in_zip(container, chain) else None
    path = Path(container) / chain
    if all((path / n).exists() for n in ("stores.csv", "products.csv", "prices.csv")):
        return DirChainFiles(path)
    return None


# ---------------------------------------------------------------------------
# Official sites, through the cijene-api crawler (installed by the workflow)


def crawl_official(chain: str, date: str, workdir: Path) -> ChainFiles | None:
    """Run the cijene-api crawler for one chain. Needs CIJENE_CRAWLER_DIR (a
    checkout of github.com/senko/cijene-api) and optionally
    CIJENE_CRAWLER_PYTHON (a Python 3.13+ with its dependencies)."""
    crawler_dir = os.environ.get("CIJENE_CRAWLER_DIR")
    if not crawler_dir:
        log.warning("Official-site crawler not installed (CIJENE_CRAWLER_DIR not set); skipping")
        return None
    python = os.environ.get("CIJENE_CRAWLER_PYTHON", sys.executable)
    out = workdir / "crawl"
    out.mkdir(parents=True, exist_ok=True)
    cmd = [python, "-m", "crawler.cli.crawl", str(out), "-d", date, "-c", chain, "-z", "false", "-v", "info"]
    log.info("Running official-site crawler: %s", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, cwd=crawler_dir, timeout=45 * 60, capture_output=True, text=True)
    except (OSError, subprocess.TimeoutExpired) as err:
        log.error("Crawler for %s failed to run: %s", chain, err)
        return None
    tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-15:])
    if proc.returncode != 0:
        log.error("Crawler for %s exited with %s:\n%s", chain, proc.returncode, tail)
        return None
    log.info("Crawler output for %s:\n%s", chain, tail)
    return chain_files_from(out / date, chain)


# ---------------------------------------------------------------------------
# Previous deployment of our own site


def load_previous_bundle(site_url: str | None, local_dir: Path | None, chain: str) -> dict | None:
    """The last good processed data for a chain, from the live site (or a local folder)."""
    raw: bytes | None = None
    if local_dir:
        p = local_dir / "bundle" / f"{chain}.json.gz"
        if p.exists():
            raw = p.read_bytes()
    if raw is None and site_url:
        url = site_url.rstrip("/") + f"/data/bundle/{chain}.json.gz"
        try:
            raw = http_get(url, timeout=120)
        except urllib.error.HTTPError as err:
            log.warning("No previous data for %s on the live site (%s)", chain, err.code)
        except Exception as err:  # noqa: BLE001
            log.warning("Could not download previous data for %s: %s", chain, err)
    if raw is None:
        return None
    try:
        # GitHub Pages may serve the file already decompressed.
        data = gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw
        return json.loads(data)
    except (OSError, json.JSONDecodeError) as err:
        log.warning("Previous data for %s is unreadable: %s", chain, err)
        return None


def temp_workdir() -> Path:
    return Path(tempfile.mkdtemp(prefix="pantry-pipeline-"))
