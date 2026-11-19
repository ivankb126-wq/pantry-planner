"""Pipeline dry run on a small fixture, including the fallback rules."""

import json
import shutil
from pathlib import Path

import pytest

from pantry_pipeline.build import run
from pantry_pipeline.sources import LocalArchiveSet

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures" / "archives"
INGREDIENTS = ROOT / "data" / "ingredients.yml"
CHAINS = ["lidl", "kaufland", "konzum", "spar", "plodine"]


def build(out: Path, archives: Path, previous: Path | None = None, today: str = "2026-11-19"):
    return run(out, INGREDIENTS, CHAINS, LocalArchiveSet(archives), today, None, previous, use_crawler=False)


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture()
def first_run(tmp_path):
    out = tmp_path / "site1"
    meta = build(out, FIXTURE)
    return out, meta


def test_dry_run_outputs(first_run):
    out, meta = first_run
    chains = meta["chains"]
    # Present in the newest archive
    assert chains["spar"]["date"] == "2026-11-19" and chains["spar"]["source"] == "cijene.dev"
    assert chains["lidl"]["date"] == "2026-11-19"
    # Missing from the newest archive, found in an older one
    assert chains["kaufland"]["date"] == "2026-11-18"
    assert chains["kaufland"]["ageDays"] == 1
    # Missing everywhere: reported, never crashes
    assert chains["konzum"]["available"] is False
    assert chains["plodine"]["available"] is False

    stores = read(out / "stores" / "spar.json")
    assert {s["city"] for s in stores} == {"Zagreb", "Rijeka"}

    prices = read(out / "prices" / "spar" / "87005.json")
    by_ing = {}
    for item in prices["items"]:
        by_ing.setdefault(item["ingredient"], []).append(item)
    assert by_ing["chicken-breast"][0]["salePrice"] == 4.99
    assert by_ing["eggs"][0]["size"] == 10
    # Mayonnaise "od svj. jaja" is not eggs; juice and dish soap match nothing
    assert all("MAJONEZA" not in i["name"] for i in by_ing["eggs"])
    assert "apple" not in by_ing
    # Best value first: 1 kg basmati (2.29/kg) beats 500 g (3.58/kg)
    assert by_ing["rice"][0]["name"] == "RIŽA S-BUDGET BASMATI 1 kg"
    assert by_ing["mandarin"][0].get("loose") is True

    deals = read(out / "deals" / "spar" / "87005.json")
    assert [d["ingredient"] for d in deals["items"]] == ["chicken-breast"]

    lidl = read(out / "prices" / "lidl" / "104.json")
    assert len([i for i in lidl["items"] if i["ingredient"] == "rice"]) == 1  # duplicate rows merged
    assert lidl["items"][0]["price"] != 9.99  # older archive not used

    kaufland = read(out / "prices" / "kaufland" / "1830.json")
    rice = next(i for i in kaufland["items"] if i["ingredient"] == "rice")
    assert rice["size"] == 500 and rice["unitPrice"] == 2.58

    assert (out / "bundle" / "spar.json.gz").exists()

    ref = {r["ingredient"]: r for r in read(out / "reference-prices.json")}
    assert ref["rice"]["stores"] == 3  # Spar 87005, Lidl, Kaufland (Spar 87011 has no rice)
    assert ref["eggs"]["unit"] == "piece"
    assert ref["mandarin"]["loose"] is True
    assert len(read(out / "ingredients.json")) > 100


def test_previous_data_is_kept_when_a_chain_disappears(first_run, tmp_path):
    out1, _ = first_run
    # A later day where Spar is missing from cijene.dev
    newer = tmp_path / "archives2"
    shutil.copytree(FIXTURE / "2026-11-19" / "lidl", newer / "2026-11-20" / "lidl")
    out2 = tmp_path / "site2"
    meta = build(out2, newer, previous=out1, today="2026-11-20")
    spar = meta["chains"]["spar"]
    assert spar["date"] == "2026-11-19" and spar["fallback"] is True
    assert (out2 / "prices" / "spar" / "87005.json").exists()
    assert meta["chains"]["lidl"]["date"] == "2026-11-20"


def test_stale_chain_is_flagged(first_run, tmp_path):
    out1, _ = first_run
    newer = tmp_path / "archives3"
    shutil.copytree(FIXTURE / "2026-11-19" / "lidl", newer / "2026-11-23" / "lidl")
    meta = build(tmp_path / "site3", newer, previous=out1, today="2026-11-23")
    assert meta["chains"]["spar"]["stale"] is True  # 4 days old
    assert meta["chains"]["lidl"]["stale"] is False


def test_partial_file_keeps_missing_store(first_run, tmp_path):
    out1, _ = first_run
    newer = tmp_path / "archives4"
    src = FIXTURE / "2026-11-19" / "spar"
    dst = newer / "2026-11-20" / "spar"
    dst.mkdir(parents=True)
    for name in ("stores.csv", "products.csv"):
        shutil.copy(src / name, dst / name)
    # Today's file only has store 87005
    lines = (src / "prices.csv").read_text(encoding="utf-8").splitlines()
    (dst / "prices.csv").write_text(
        "\n".join(row for row in lines if not row.startswith("87011")) + "\n", encoding="utf-8"
    )
    out = tmp_path / "site4"
    meta = build(out, newer, previous=out1, today="2026-11-20")
    assert meta["chains"]["spar"]["date"] == "2026-11-20"
    kept = read(out / "prices" / "spar" / "87011.json")
    assert kept["date"] == "2026-11-19"


def test_no_data_at_all_fails_loudly(tmp_path):
    empty = tmp_path / "empty"
    (empty / "2026-11-19").mkdir(parents=True)
    with pytest.raises(SystemExit):
        build(tmp_path / "out", empty)
