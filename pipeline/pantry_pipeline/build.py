"""Build the app's price data: one run of the daily pipeline."""

from __future__ import annotations

import datetime as dt
import gzip
import json
import logging
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .ingredients import Ingredient, load_ingredients
from .matcher import Matcher, Offer, PackInfo, pack_for, pick_options
from .parsing import parse_decimal
from .sources import (
    ArchiveSet,
    ChainFiles,
    chain_files_from,
    crawl_official,
    load_previous_bundle,
    temp_workdir,
)

log = logging.getLogger(__name__)

CHAINS = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "konzum": "Konzum",
    "spar": "Spar",
    "plodine": "Plodine",
}

STALE_DAYS = 3  # open a GitHub issue when a chain is this many days old
CARRY_OVER_DAYS = 7  # keep a store's older prices this long if it vanishes from a new file
MAX_DEALS_PER_STORE = 80


def annotate(level: str, title: str, message: str) -> None:
    """Loud messages: GitHub shows ::error:: / ::warning:: lines on the run page."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::{level} title={title}::{message}", flush=True)
    (log.error if level == "error" else log.warning)("%s: %s", title, message)


def zagreb_today() -> str:
    try:
        from zoneinfo import ZoneInfo

        return dt.datetime.now(ZoneInfo("Europe/Zagreb")).date().isoformat()
    except Exception:  # noqa: BLE001 - tzdata missing
        return dt.date.today().isoformat()


def days_between(a: str, b: str) -> int:
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


_SAFE_ID = re.compile(r"[^A-Za-z0-9_-]")


def safe_id(store_id: str) -> str:
    return _SAFE_ID.sub("_", store_id.strip())


# ---------------------------------------------------------------------------
# Processing one chain's CSV files


def process_chain(
    chain: str, files: ChainFiles, ingredients: list[Ingredient], matcher: Matcher, date: str, source: str
) -> dict:
    """Turn one chain's stores/products/prices CSVs into our compact bundle."""
    ing_by_id = {i.id: i for i in ingredients}

    stores: dict[str, dict] = {}
    for r in files.rows("stores.csv"):
        sid = safe_id(r.get("store_id", ""))
        if not sid:
            continue
        stores[sid] = {
            "id": sid,
            "type": (r.get("type") or "").strip(),
            "address": (r.get("address") or "").strip(),
            "city": (r.get("city") or "").strip(),
            "zip": (r.get("zipcode") or "").strip(),
        }

    products: dict[str, dict] = {}
    n_products = 0
    for r in files.rows("products.csv"):
        n_products += 1
        name = (r.get("name") or "").strip()
        if not name:
            continue
        found = matcher.match(name, r.get("category") or "")
        if found:
            products[r["product_id"].strip()] = {
                "name": name,
                "brand": (r.get("brand") or "").strip(),
                "barcode": (r.get("barcode") or "").strip(),
                "quantity": r.get("quantity") or "",
                "unit": r.get("unit") or "",
                "ings": found,
            }
    log.info("%s: %d products, %d match an ingredient", chain, n_products, len(products))

    per_store: dict[str, dict[str, tuple]] = defaultdict(dict)
    for r in files.rows("prices.csv"):
        pid = (r.get("product_id") or "").strip()
        if pid not in products:
            continue
        if (r.get("available") or "").strip() in {"0", "false", "False"}:
            continue
        price = parse_decimal(r.get("price"))
        if not price or price <= 0:
            continue
        sid = safe_id(r.get("store_id", ""))
        row = (
            price,
            parse_decimal(r.get("unit_price")),
            parse_decimal(r.get("best_price_30")),
            parse_decimal(r.get("anchor_price")),
            parse_decimal(r.get("special_price")),
        )
        old = per_store[sid].get(pid)
        if old is None or price < old[0]:
            per_store[sid][pid] = row

    pack_cache: dict[tuple[str, str], PackInfo | None] = {}
    prices_out: dict[str, list[dict]] = {}
    deals_out: dict[str, list[dict]] = {}
    for sid, rows in per_store.items():
        offers_by_ing: dict[str, list[Offer]] = defaultdict(list)
        for pid, (price, unit_price, best30, anchor, special) in rows.items():
            p = products[pid]
            for ing in p["ings"]:
                key = (pid, ing.id)
                if key not in pack_cache:
                    pack_cache[key] = pack_for(ing, p["name"], p["quantity"], p["unit"], price, unit_price)
                pack = pack_cache[key]
                if pack is None:
                    continue
                offers_by_ing[ing.id].append(
                    Offer(
                        ing.id,
                        pid,
                        p["name"],
                        p["brand"],
                        p["barcode"],
                        pack.amount,
                        pack.loose,
                        price,
                        special,
                        best30,
                        anchor,
                    )
                )
        items: list[dict] = []
        deals: list[tuple[float, dict]] = []
        for iid in sorted(offers_by_ing):
            ing = ing_by_id[iid]
            for o in pick_options(ing, offers_by_ing[iid]):
                items.append(o.to_json(ing.unit))
            seen = set()
            for o in offers_by_ing[iid]:
                if not o.special_price or (o.barcode, o.name) in seen:
                    continue
                seen.add((o.barcode, o.name))
                o._is_piece = ing.unit == "piece"
                ref = max(x for x in (o.anchor_price, o.best_price_30, 0) if x is not None)
                saving = (ref - o.price) / ref if ref > o.price else 0.0
                deals.append((saving, o.to_json(ing.unit)))
        if items:
            prices_out[sid] = items
        deals.sort(key=lambda d: -d[0])
        if deals:
            deals_out[sid] = [d for _, d in deals[:MAX_DEALS_PER_STORE]]

    if not prices_out:
        raise ValueError(f"no matched prices for {chain}")
    store_list = [stores.get(sid, {"id": sid, "type": "", "address": "", "city": "", "zip": ""}) for sid in prices_out]
    return {
        "chain": chain,
        "name": CHAINS.get(chain, chain.title()),
        "date": date,
        "source": source,
        "stores": sorted(store_list, key=lambda s: (s["city"], s["address"])),
        "storeDates": {sid: date for sid in prices_out},
        "prices": prices_out,
        "deals": deals_out,
        "matchedProducts": len(products),
    }


def rematch(bundle: dict, matcher: Matcher) -> int:
    """Data kept from an earlier day was matched with that day's rules. Drop
    products today's rules no longer match (a rule was fixed), so a chain
    that has not updated for a while does not keep a wrong match."""
    cache: dict[str, set[str]] = {}

    def ok(item: dict) -> bool:
        name = item.get("name") or ""
        if name not in cache:
            cache[name] = {i.id for i in matcher.match(name)}
        return item.get("ingredient") in cache[name]

    dropped = 0
    for key in ("prices", "deals"):
        for sid, items in list(bundle.get(key, {}).items()):
            kept = [i for i in items if ok(i)]
            if key == "prices":
                dropped += len(items) - len(kept)
            if kept:
                bundle[key][sid] = kept
            else:
                del bundle[key][sid]
    bundle["stores"] = [s for s in bundle.get("stores", []) if s["id"] in bundle.get("prices", {})]
    return dropped


def carry_over_missing_stores(new: dict, prev: dict | None, today: str) -> int:
    """If a store disappeared from today's file (a partial upload), keep its
    recent previous prices instead of showing nothing."""
    if not prev:
        return 0
    added = 0
    new_ids = set(new["prices"])
    prev_stores = {s["id"]: s for s in prev.get("stores", [])}
    for sid, items in prev.get("prices", {}).items():
        if sid in new_ids:
            continue
        sdate = prev.get("storeDates", {}).get(sid, prev.get("date"))
        if not sdate or days_between(sdate, today) > CARRY_OVER_DAYS:
            continue
        new["prices"][sid] = items
        if sid in prev.get("deals", {}):
            new["deals"][sid] = prev["deals"][sid]
        new["storeDates"][sid] = sdate
        if sid in prev_stores:
            new["stores"].append(prev_stores[sid])
        added += 1
    new["stores"].sort(key=lambda s: (s["city"], s["address"]))
    return added


# ---------------------------------------------------------------------------
# Choosing the source for each chain


@dataclass
class ChainOutcome:
    chain: str
    bundle: dict | None
    notes: list[str] = field(default_factory=list)


def build_chain(
    chain: str,
    archives: ArchiveSet,
    ingredients: list[Ingredient],
    matcher: Matcher,
    today: str,
    prev: dict | None,
    use_crawler: bool,
    lookback: int,
    workdir: Path,
) -> ChainOutcome:
    name = CHAINS.get(chain, chain)
    outcome = ChainOutcome(chain, None)
    prev_date = prev.get("date") if prev else None
    if prev and (dropped := rematch(prev, matcher)):
        log.info("%s: %d kept prices no longer match today's rules and were dropped", chain, dropped)

    def attempt(files: ChainFiles, date: str, source: str) -> dict | None:
        try:
            return process_chain(chain, files, ingredients, matcher, date, source)
        except Exception as err:  # noqa: BLE001
            annotate("error", f"{name} data broken", f"Could not process {source} data for {date}: {err}")
            return None

    bundle = None
    newest = archives.dates[0] if archives.dates else None
    # 1. Newest cijene.dev archive
    if newest:
        files = chain_files_from(archives.get(newest), chain)
        if files:
            bundle = attempt(files, newest, "cijene.dev")
        else:
            annotate("warning", f"{name} missing", f"{name} is not in the cijene.dev archive for {newest}")
    else:
        annotate("error", "cijene.dev unavailable", "Could not list cijene.dev archives")

    # 2. Official site via the cijene-api crawler
    if bundle is None and use_crawler:
        yesterday = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
        for date in (today, yesterday):
            if prev_date and date <= prev_date:
                break
            files = crawl_official(chain, date, workdir)
            if files:
                bundle = attempt(files, date, "official site")
                if bundle:
                    outcome.notes.append(f"from the official {name} site")
                    break
        if bundle is None:
            annotate("warning", f"{name} official site", f"Crawling the official {name} site did not work")

    # 3. Older cijene.dev archives (only useful when there is no previous data)
    if bundle is None and not prev:
        for date in archives.dates[1:lookback]:
            files = chain_files_from(archives.get(date), chain)
            if files:
                bundle = attempt(files, date, "cijene.dev")
                if bundle:
                    outcome.notes.append(f"from an older cijene.dev archive ({date})")
                    break

    # 4. Keep the previous good data if it is newer (or we have nothing)
    if prev and (bundle is None or (prev_date and prev_date > bundle["date"])):
        if bundle is None:
            annotate("error", f"{name} not updated", f"Keeping previous {name} data from {prev_date}")
        prev["fallback"] = True
        outcome.bundle = prev
        outcome.notes.append(f"kept previous data from {prev_date}")
        return outcome

    if bundle is None:
        annotate("error", f"{name} has no data", f"No data at all for {name}; it will be missing from the app")
        return outcome

    bundle["fallback"] = False
    carried = carry_over_missing_stores(bundle, prev, today)
    if carried:
        annotate(
            "warning",
            f"{name} partial file",
            f"{carried} {name} stores were missing today; kept their recent previous prices",
        )
    outcome.bundle = bundle
    return outcome


# ---------------------------------------------------------------------------
# Writing the output files


def _dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_outputs(out: Path, outcomes: list[ChainOutcome], ingredients: list[Ingredient], today: str) -> dict:
    meta: dict = {
        "generatedAt": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "today": today,
        "ingredients": len(ingredients),
        "chains": {},
    }
    for oc in outcomes:
        b = oc.bundle
        name = CHAINS.get(oc.chain, oc.chain)
        if not b:
            meta["chains"][oc.chain] = {"name": name, "date": None, "available": False, "notes": oc.notes}
            continue
        chain = oc.chain
        for sid, items in b["prices"].items():
            _dump(
                out / "prices" / chain / f"{sid}.json",
                {"chain": chain, "store": sid, "date": b["storeDates"].get(sid, b["date"]), "items": items},
            )
        for sid in b["prices"]:
            _dump(
                out / "deals" / chain / f"{sid}.json",
                {
                    "chain": chain,
                    "store": sid,
                    "date": b["storeDates"].get(sid, b["date"]),
                    "items": b["deals"].get(sid, []),
                },
            )
        _dump(out / "stores" / f"{chain}.json", b["stores"])
        bundle_path = out / "bundle" / f"{chain}.json.gz"
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        bundle_path.write_bytes(gzip.compress(json.dumps(b, ensure_ascii=False).encode("utf-8"), mtime=0))
        age = days_between(b["date"], today)
        meta["chains"][chain] = {
            "name": name,
            "date": b["date"],
            "ageDays": age,
            "stale": age >= STALE_DAYS,
            "source": b.get("source"),
            "fallback": bool(b.get("fallback")),
            "stores": len(b["stores"]),
            "matchedProducts": b.get("matchedProducts"),
            "available": True,
            "notes": oc.notes,
        }
    _dump(out / "ingredients.json", [i.to_public() for i in ingredients])
    _dump(out / "reference-prices.json", reference_prices(outcomes))
    _dump(out / "meta.json", meta)
    return meta


def reference_prices(outcomes: list[ChainOutcome]) -> list[dict]:
    """A typical price per ingredient: the median best-value product across all
    stores. The planner uses it only for items a chosen store does not list,
    and marks them as estimated."""
    per_ing: dict[str, list[dict]] = defaultdict(list)
    for oc in outcomes:
        if not oc.bundle:
            continue
        for items in oc.bundle["prices"].values():
            seen: set[str] = set()
            for item in items:  # best value option comes first per ingredient
                if item["ingredient"] in seen:
                    continue
                seen.add(item["ingredient"])
                per_ing[item["ingredient"]].append(item)
    out = []
    for iid, items in sorted(per_ing.items()):
        unit_prices = sorted(i["unitPrice"] for i in items)
        mid = unit_prices[len(unit_prices) // 2]
        loose_share = sum(1 for i in items if i.get("loose")) / len(items)
        sizes = sorted(i["size"] for i in items if not i.get("loose"))
        unit = items[0]["unit"]
        if loose_share > 0.5 or not sizes:
            size, loose = (1000.0 if unit != "piece" else 1.0), True
        else:
            size, loose = sizes[len(sizes) // 2], False
        per = 1 if unit == "piece" else 1000
        entry = {
            "ingredient": iid,
            "name": "Typical price (estimate)",
            "size": size,
            "unit": unit,
            "price": round(mid * size / per, 2),
            "salePrice": None,
            "unitPrice": round(mid, 2),
            "stores": len(items),
        }
        if loose:
            entry["loose"] = True
        out.append(entry)
    return out


def write_summary(meta: dict) -> None:
    """A table on the GitHub Actions run page, plus a list of stale chains."""
    lines = ["| Chain | Prices from | Source | Stores | Matched products | Notes |", "|---|---|---|---|---|---|"]
    stale = []
    for c in meta["chains"].values():
        if not c.get("available"):
            lines.append(f"| {c['name']} | none | | | | {'; '.join(c['notes'])} |")
            stale.append(c["name"])
            continue
        flag = " ⚠️" if c["stale"] else ""
        lines.append(
            f"| {c['name']} | {c['date']}{flag} | {c['source']}{' (previous)' if c['fallback'] else ''} "
            f"| {c['stores']} | {c['matchedProducts']} | {'; '.join(c['notes'])} |"
        )
        if c["stale"]:
            stale.append(f"{c['name']} ({c['date']})")
    text = "## Price data\n\n" + "\n".join(lines) + "\n"
    print(text)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)
    if path := os.environ.get("GITHUB_OUTPUT"):
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"stale={', '.join(stale)}\n")


def run(
    out: Path,
    ingredients_path: Path,
    chains: list[str],
    archives: ArchiveSet,
    today: str,
    previous_site: str | None,
    previous_dir: Path | None,
    use_crawler: bool,
    lookback: int = 7,
) -> dict:
    ingredients, settings = load_ingredients(ingredients_path)
    matcher = Matcher(ingredients, settings)
    workdir = temp_workdir()
    outcomes = []
    for chain in chains:
        prev = load_previous_bundle(previous_site, previous_dir, chain)
        outcomes.append(build_chain(chain, archives, ingredients, matcher, today, prev, use_crawler, lookback, workdir))
    meta = write_outputs(out, outcomes, ingredients, today)
    write_summary(meta)
    if not any(oc.bundle for oc in outcomes):
        raise SystemExit("No price data for any chain. Failing the run so the old site stays online.")
    return meta
